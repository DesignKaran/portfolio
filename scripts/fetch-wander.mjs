// Pulls scenic photos from a public iCloud shared album into the repo for the
// about page's "Wandering for ideas" mosaic. Runs in .github/workflows/now.yml.
// Zero dependencies, Node 20+. Reads data/wander.config.json, writes
// data/wander.json and assets/wander/<recordName>.jpg. Any feed failure leaves
// the existing files untouched (it just logs why).
//
// Protocol (what photos.icloud.com/shared/album/<token> does in the browser):
//   1. POST ckdatabasews.icloud.com/.../public/records/resolve  { shortGUIDs:[{value:token}] }
//      -> zoneID for the SharedCollection zone (+ a public access auth token)
//   2. POST <partition>-ckdatabasews.icloud.com/.../shared/records/query
//      recordType CPLAssetAndMasterByAddedDate -> CPLAsset + CPLMaster records
//   3. GET each master's resJPEGMedRes.downloadURL
import { readFile, writeFile, mkdir, readdir, unlink, access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const CONFIG = 'data/wander.config.json';
const OUT = 'data/wander.json';
const DIR = 'assets/wander';
const CONTAINER = 'com.apple.photos.cloud';
const CLIENT = 'clientBuildNumber=2632BuildBeta16&clientMasteringNumber=2632BuildBeta16';
const HEADERS = { 'Content-Type': 'text/plain', Origin: 'https://photos.icloud.com', Referer: 'https://photos.icloud.com/', 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' };

// ---------- pure helpers (unit-tested) ----------
export function findKey(obj, key, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 8) return null;
  if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null) return obj[key];
  for (const v of Object.values(obj)) { const r = findKey(v, key, depth + 1); if (r != null) return r; }
  return null;
}
export function findPartitionHost(obj, depth = 0) {
  if (typeof obj === 'string') { const m = obj.match(/\bp\d+-ckdatabasews\.icloud\.com\b/); return m ? m[0] : null; }
  if (!obj || typeof obj !== 'object' || depth > 8) return null;
  for (const v of Object.values(obj)) { const r = findPartitionHost(v, depth + 1); if (r) return r; }
  return null;
}
export function b64utf8(s) { try { return Buffer.from(s, 'base64').toString('utf8'); } catch (_) { return ''; } }
export function pairRecords(records) {
  const masters = new Map(), assets = [];
  for (const r of records || []) {
    if (r.recordType === 'CPLMaster') masters.set(r.recordName, r);
    else if (r.recordType === 'CPLAsset') assets.push(r);
  }
  return assets.map((a) => ({ asset: a, master: masters.get((((a.fields || {}).masterRef || {}).value || {}).recordName) })).filter((p) => p.master);
}
export function pickRendition(masterFields, maxLongEdge = 2560) {
  const f = masterFields || {};
  const v = (k) => (f[k] && f[k].value != null) ? f[k].value : null;
  const cands = [
    { key: 'med', res: v('resJPEGMedRes'), w: v('resJPEGMedWidth'), h: v('resJPEGMedHeight') },
    { key: 'thumb', res: v('resJPEGThumbRes'), w: v('resJPEGThumbWidth'), h: v('resJPEGThumbHeight') },
    { key: 'orig', res: v('resOriginalRes'), w: v('resOriginalWidth'), h: v('resOriginalHeight'), type: v('itemType') },
  ].filter((c) => c.res && c.res.downloadURL);
  if (!cands.length) return null;
  const long = (c) => Math.max(Number(c.w) || 0, Number(c.h) || 0);
  const isJpeg = (c) => c.key !== 'orig' || /jpe?g/i.test(String(c.type || ''));
  const fits = cands.filter((c) => isJpeg(c) && long(c) > 0 && long(c) <= maxLongEdge).sort((a, b) => long(b) - long(a));
  const pick = fits[0] || cands.filter(isJpeg).sort((a, b) => long(a) - long(b))[0] || null;
  return pick ? { url: pick.res.downloadURL, w: Number(pick.w) || 0, h: Number(pick.h) || 0, rendition: pick.key } : null;
}
export function describeAsset(pair) {
  const af = pair.asset.fields || {};
  const v = (k) => (af[k] && af[k].value != null) ? af[k].value : null;
  const trashed = (v('trashReason') || 0) !== 0 || pair.asset.deleted === true;
  const date = v('assetDate') || v('addedDate');
  return { id: pair.asset.recordName, caption: b64utf8(v('captionEnc') || '').trim(), date: date ? new Date(Number(date)).toISOString() : null, addedAt: Number(v('addedDate')) || 0, trashed };
}

// ---------- feed ----------
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (_) {}
  return { status: r.status, json, text };
}
function stripBlobs(obj) {
  return JSON.parse(JSON.stringify(obj, (k, val) => (typeof val === 'string' && val.length > 200 ? `<${val.length} chars>` : val)));
}
async function resolveShare(token) {
  const url = `https://ckdatabasews.icloud.com/database/1/${CONTAINER}/production/public/records/resolve?remapEnums=true&getCurrentSyncToken=true&${CLIENT}&sharing_url_key=${token}`;
  const res = await post(url, { shortGUIDs: [{ value: token }] });
  if (res.status !== 200 || !res.json) throw new Error(`resolve ${res.status}: ${res.text.slice(0, 200)}`);
  const result = (res.json.results || [])[0] || res.json;
  const zoneID = findKey(result, 'zoneID');
  // The public access token is issued per resolve under anonymousPublicAccess.token.
  const apa = findKey(result, 'anonymousPublicAccess') || findKey(res.json, 'anonymousPublicAccess');
  let authToken = (apa && (apa.token || (apa.value && apa.value.token))) || findKey(res.json, 'publicAccessAuthToken');
  if (authToken && typeof authToken === 'object') authToken = authToken.value || null;
  const hosts = [findPartitionHost(res.json), 'ckdatabasews.icloud.com'].filter(Boolean);
  if (!zoneID || !authToken) {
    console.log('resolve shape (blobs stripped):', JSON.stringify(stripBlobs(res.json)).slice(0, 3000));
    throw new Error(`resolve: missing ${!zoneID ? 'zoneID' : 'anonymousPublicAccess.token'}`);
  }
  return { zoneID, authToken, hosts };
}
// The index only pages reliably ASCENDING from a start rank (as the album page
// does), so walk it in pages and sort newest-first afterwards.
async function queryPage(share, token, startRank, pageSize) {
  const q = `remapEnums=true&getCurrentSyncToken=true&sharing_url_key=${token}&publicAccessAuthToken=${encodeURIComponent(share.authToken)}&${CLIENT}&clientId=${randomUUID()}`;
  const body = {
    query: { recordType: 'CPLAssetAndMasterByAddedDate', filterBy: [
      { fieldName: 'direction', comparator: 'EQUALS', fieldValue: { value: 'ASCENDING', type: 'STRING' } },
      { fieldName: 'startRank', comparator: 'EQUALS', fieldValue: { value: startRank, type: 'INT64' } },
    ] },
    zoneID: share.zoneID, resultsLimit: pageSize,
  };
  let last = null;
  for (const host of share.hosts) {
    const url = `https://${host}/database/1/${CONTAINER}/production/shared/records/query?${q}`;
    const res = await post(url, body);
    if (res.status === 200 && res.json && Array.isArray(res.json.records)) { share.host = host; share.hosts = [host]; return res.json.records; }
    last = `query ${res.status} on ${host}: ${res.text.slice(0, 300).replace(/\s+/g, ' ')}`;
    console.log('wander:', last);
    const hint = findPartitionHost(res.json) || findPartitionHost(res.text);
    if (hint && !share.hosts.includes(hint)) share.hosts.push(hint);
  }
  throw new Error(last || 'query failed');
}
async function listAssets(share, token) {
  const all = [];
  let startRank = 0;
  for (let page = 0; page < 8; page++) {
    const records = await queryPage(share, token, startRank, 100);
    all.push(...records);
    const assets = records.filter((r) => r.recordType === 'CPLAsset').length;
    if (assets < 40) break; // 100 records ≈ 50 asset/master pairs per full page
    startRank += assets;
  }
  return all;
}

// ---------- main ----------
async function main() {
  let cfg;
  try { cfg = JSON.parse(await readFile(CONFIG, 'utf8')); } catch (_) { console.log('wander: no config, skipping'); return; }
  if (!cfg.token) { console.log('wander: no token, skipping'); return; }
  const max = cfg.max || 12;
  await mkdir(DIR, { recursive: true });

  let pairs;
  try {
    const share = await resolveShare(cfg.token);
    console.log('wander: zone', share.zoneID.zoneName, '| hosts to try', share.hosts.join(', '));
    const records = await listAssets(share, cfg.token);
    console.log('wander: queried on', share.host);
    pairs = pairRecords(records);
    console.log('wander: records', records.length, '| asset/master pairs', pairs.length);
    if (!pairs.length && records.length) console.log('record types seen:', [...new Set(records.map((r) => r.recordType))].join(', '), '| sample:', JSON.stringify(stripBlobs(records[0])).slice(0, 1200));
  } catch (e) { console.error('wander feed failed (keeping previous):', e.message); return; }

  const chosen = pairs.map((p) => ({ meta: describeAsset(p), pick: pickRendition(p.master.fields) }))
    .filter((x) => !x.meta.trashed && x.pick)
    .sort((a, b) => b.meta.addedAt - a.meta.addedAt)
    .slice(0, max);
  if (!chosen.length && pairs.length) console.log('no usable renditions; master field keys:', Object.keys(pairs[0].master.fields || {}).join(', '));
  console.log('wander: chosen', chosen.length, chosen.slice(0, 3).map((x) => `${x.pick.rendition} ${x.pick.w}x${x.pick.h}`).join(', '));

  // Photos are stored at ≤1400px / q82 when sharp is installed by the workflow
  // (≈200 KB each instead of ≈900 KB); otherwise kept at source size.
  let sharp = null;
  try { sharp = (await import('sharp')).default; } catch (_) { console.log('wander: sharp not available, storing source size'); }
  const shrink = async (buf) => sharp ? sharp(buf).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer() : buf;

  const existing = new Set((await readdir(DIR)).filter((f) => f.endsWith('.jpg')));
  let downloaded = 0, reencoded = 0;
  for (const x of chosen) {
    const file = `${DIR}/${x.meta.id}.jpg`;
    if (existing.has(x.meta.id + '.jpg')) {
      // One-time shrink of files committed before resizing existed.
      if (sharp) { try { const cur = await readFile(file); if (cur.length > 450 * 1024) { await writeFile(file, await shrink(cur)); reencoded++; } } catch (_) {} }
      continue;
    }
    try {
      const r = await fetch(x.pick.url);
      if (!r.ok) throw new Error('download ' + r.status);
      await writeFile(file, await shrink(Buffer.from(await r.arrayBuffer())));
      downloaded++;
    } catch (e) { console.error('wander: download failed for', x.meta.id, e.message); }
  }
  if (reencoded) console.log('wander: re-encoded', reencoded, 'existing photos');
  const keep = new Set(chosen.map((x) => x.meta.id + '.jpg'));
  let removed = 0;
  for (const f of existing) if (!keep.has(f)) { await unlink(`${DIR}/${f}`); removed++; }

  const photos = [];
  for (const x of chosen) {
    const file = `${DIR}/${x.meta.id}.jpg`;
    try { await access(file); } catch (_) { continue; }
    photos.push({ file, caption: x.meta.caption, date: x.meta.date, w: x.pick.w, h: x.pick.h });
  }
  await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), album: cfg.name || '', photos }, null, 2) + '\n');
  console.log('wander: downloaded', downloaded, '| removed', removed, '| wrote', OUT, 'with', photos.length, 'photos');
}

if (!process.env.NOW_NO_RUN) main();
