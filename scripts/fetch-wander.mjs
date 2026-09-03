// Pulls scenic photos from a public iCloud Shared Album into the repo for the
// about page's "Wandering for ideas" mosaic. Runs in .github/workflows/now.yml.
// Zero dependencies, Node 20+. Reads data/wander.config.json, writes
// data/wander.json and assets/wander/<photoGuid>.jpg. Any feed failure leaves the
// existing files untouched (it just logs why).
import { readFile, writeFile, mkdir, readdir, unlink, access } from 'node:fs/promises';

const CONFIG = 'data/wander.config.json';
const OUT = 'data/wander.json';
const DIR = 'assets/wander';
const UA = { 'User-Agent': 'karanqmr.com now-card (github actions)', Origin: 'https://www.icloud.com', 'Content-Type': 'text/plain' };

// ---------- pure helpers (unit-tested) ----------
export function parseRedirectHost(json) {
  return (json && json['X-Apple-MMe-Host']) || null;
}
export function pickDerivative(derivatives, maxLongEdge = 1200) {
  const list = Object.entries(derivatives || {}).map(([key, d]) => ({
    key, checksum: d.checksum, w: Number(d.width) || 0, h: Number(d.height) || 0, size: Number(d.fileSize) || 0,
  })).filter((d) => d.checksum);
  if (!list.length) return null;
  const long = (d) => Math.max(d.w, d.h);
  const fits = list.filter((d) => long(d) > 0 && long(d) <= maxLongEdge).sort((a, b) => long(b) - long(a));
  if (fits.length) return fits[0];
  return list.sort((a, b) => (long(a) || Infinity) - (long(b) || Infinity))[0];
}
export function assetUrl(item) {
  return item && item.url_location && item.url_path ? 'https://' + item.url_location + item.url_path : null;
}
export function choosePhotos(photos, max = 12) {
  return (photos || [])
    .filter((p) => !p.mediaAssetType || String(p.mediaAssetType).toLowerCase() === 'image')
    .filter((p) => p.derivatives && Object.keys(p.derivatives).length)
    .sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated))
    .slice(0, max);
}

// ---------- feed ----------
async function post(host, token, path, body) {
  const r = await fetch(`https://${host}/${token}/sharedstreams/${path}`, { method: 'POST', headers: UA, body: JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (_) {}
  return { status: r.status, json, text };
}
async function feed(token) {
  let host = 'p01-sharedstreams.icloud.com';
  let res = await post(host, token, 'webstream', { streamCtag: null });
  const redirect = parseRedirectHost(res.json);
  if (redirect && redirect !== host) { host = redirect; res = await post(host, token, 'webstream', { streamCtag: null }); }
  if (res.status !== 200 || !res.json || !Array.isArray(res.json.photos)) {
    throw new Error(`webstream ${res.status} on ${host}: ${res.text.slice(0, 200).replace(/\s+/g, ' ')}`);
  }
  return { host, stream: res.json };
}
async function diagnose(token) {
  // First-run help: if the legacy feed rejects the token, show what the album
  // page references so the endpoint can be adapted from the logs.
  try {
    const r = await fetch(`https://photos.icloud.com/shared/album/${token}`, { headers: { 'User-Agent': UA['User-Agent'] } });
    const html = await r.text();
    const hosts = [...new Set((html.match(/https?:\/\/[a-z0-9.-]*icloud\.com[^"' )]*/gi) || []))].slice(0, 20);
    console.log('diagnose: album page', r.status, 'len', html.length, '| refs:', hosts.join(' | ') || '(none)');
    const cfg = html.match(/window\.__[A-Z_]+__\s*=\s*\{[\s\S]{0,400}/);
    if (cfg) console.log('diagnose: config snippet:', cfg[0].replace(/\s+/g, ' ').slice(0, 400));
  } catch (e) { console.log('diagnose: album page failed:', e.message); }
}

// ---------- main ----------
async function main() {
  let cfg;
  try { cfg = JSON.parse(await readFile(CONFIG, 'utf8')); } catch (_) { console.log('wander: no config, skipping'); return; }
  if (!cfg.token) { console.log('wander: no token, skipping'); return; }
  const max = cfg.max || 12;

  let host, stream;
  try { ({ host, stream } = await feed(cfg.token)); }
  catch (e) { console.error('wander feed failed (keeping previous):', e.message); await diagnose(cfg.token); return; }

  const chosen = choosePhotos(stream.photos, max).map((p) => ({ p, d: pickDerivative(p.derivatives) })).filter((x) => x.d);
  console.log('wander: album', JSON.stringify(stream.streamName || ''), '| photos in feed', stream.photos.length, '| chosen', chosen.length);

  await mkdir(DIR, { recursive: true });
  const existing = new Set((await readdir(DIR)).filter((f) => f.endsWith('.jpg')));
  const need = chosen.filter((x) => !existing.has(x.p.photoGuid + '.jpg'));
  let urls = {};
  if (need.length) {
    const res = await post(host, cfg.token, 'webasseturls', { photoGuids: need.map((x) => x.p.photoGuid) });
    if (res.status !== 200 || !res.json || !res.json.items) { console.error('wander webasseturls failed:', res.status, res.text.slice(0, 200)); return; }
    urls = res.json.items;
  }
  let downloaded = 0;
  for (const x of need) {
    const url = assetUrl(urls[x.d.checksum]);
    if (!url) { console.error('wander: no url for', x.p.photoGuid); continue; }
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('download ' + r.status);
      await writeFile(`${DIR}/${x.p.photoGuid}.jpg`, Buffer.from(await r.arrayBuffer()));
      downloaded++;
    } catch (e) { console.error('wander: download failed for', x.p.photoGuid, e.message); }
  }
  const keep = new Set(chosen.map((x) => x.p.photoGuid + '.jpg'));
  let removed = 0;
  for (const f of existing) if (!keep.has(f)) { await unlink(`${DIR}/${f}`); removed++; }

  const photos = [];
  for (const x of chosen) {
    const file = `${DIR}/${x.p.photoGuid}.jpg`;
    try { await access(file); } catch (_) { continue; }
    photos.push({ file, caption: (x.p.caption || '').trim(), date: x.p.dateCreated || null, w: x.d.w, h: x.d.h });
  }
  await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), album: stream.streamName || '', photos }, null, 2) + '\n');
  console.log('wander: downloaded', downloaded, '| removed', removed, '| wrote', OUT, 'with', photos.length, 'photos');
}

if (!process.env.NOW_NO_RUN) main();
