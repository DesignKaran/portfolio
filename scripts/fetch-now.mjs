// Refreshes data/now.json with recent Letterboxd + Spotify activity for the
// about page's "When I'm not designing" cards. Runs in GitHub Actions
// (.github/workflows/now.yml); zero dependencies, Node 20+.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const LB_USER = process.env.LETTERBOXD_USER || 'BinkyBoinky';
const OUT = 'data/now.json';

// ---------- Letterboxd (public RSS, no auth) ----------
function decode(s) {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}
function tag(xml, name) {
  const m = xml.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>'));
  return m ? decode(m[1].trim()) : '';
}
export function parseLetterboxd(xml, limit = 6) {
  const items = xml.split('<item>').slice(1).map((s) => s.split('</item>')[0]);
  const films = [];
  for (const it of items) {
    const title = tag(it, 'letterboxd:filmTitle');
    if (!title) continue; // list entries have no filmTitle
    const desc = tag(it, 'description');
    const img = desc.match(/<img[^>]+src="([^"]+)"/);
    const rating = parseFloat(tag(it, 'letterboxd:memberRating'));
    films.push({
      title,
      year: tag(it, 'letterboxd:filmYear') || null,
      rating: Number.isNaN(rating) ? null : rating,
      watchedDate: tag(it, 'letterboxd:watchedDate') || null,
      rewatch: tag(it, 'letterboxd:rewatch') === 'Yes',
      url: tag(it, 'link'),
      poster: img ? img[1] : null,
    });
    if (films.length >= limit) break;
  }
  return { user: LB_USER, films };
}
async function letterboxd() {
  const r = await fetch(`https://letterboxd.com/${LB_USER}/rss/`, {
    headers: { 'User-Agent': 'karanqmr.com now-card (github actions)' },
  });
  if (!r.ok) throw new Error('rss ' + r.status);
  return parseLetterboxd(await r.text());
}

// ---------- Spotify (refresh-token flow; secrets live in GitHub Actions) ----------
function pickArt(imgs) {
  if (!imgs || !imgs.length) return null;
  return [...imgs].sort((a, b) => Math.abs((a.width || 0) - 300) - Math.abs((b.width || 0) - 300))[0].url;
}
function track(t) {
  if (!t) return null;
  return {
    name: t.name,
    artists: (t.artists || []).map((a) => a.name).join(', '),
    album: (t.album && t.album.name) || '',
    art: pickArt(t.album && t.album.images),
    url: (t.external_urls && t.external_urls.spotify) || '',
  };
}
export function shapeSpotify(np, rec, top) {
  const nowPlaying = np && np.is_playing && np.item && np.currently_playing_type === 'track' ? track(np.item) : null;
  const recent = ((rec && rec.items) || []).map((i) => Object.assign(track(i.track), { playedAt: i.played_at }));
  return { nowPlaying, recent, top: ((top && top.items) || []).map(track) };
}
async function spotify() {
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret, SPOTIFY_REFRESH_TOKEN: rt } = process.env;
  if (!id || !secret || !rt) { console.log('spotify: secrets not set, skipping'); return { skipped: true }; }
  const tok = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt }),
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error('token refresh failed: ' + JSON.stringify(tok));
  const H = { Authorization: 'Bearer ' + tok.access_token };
  const get = async (p) => {
    const r = await fetch('https://api.spotify.com/v1' + p, { headers: H });
    if (r.status === 204) return null;
    if (!r.ok) throw new Error(p + ' -> ' + r.status);
    return r.json();
  };
  const [np, rec, top] = await Promise.all([
    get('/me/player/currently-playing').catch(() => null),
    get('/me/player/recently-played?limit=6'),
    get('/me/top/tracks?time_range=short_term&limit=3').catch(() => null),
  ]);
  return shapeSpotify(np, rec, top);
}

// ---------- main ----------
async function main() {
  let prev = null;
  try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch (_) {}

  const next = { spotify: prev ? prev.spotify : null, letterboxd: prev ? prev.letterboxd : { user: LB_USER, films: [] } };
  let ok = 0;

  try { next.letterboxd = await letterboxd(); ok++; console.log('letterboxd:', next.letterboxd.films.length, 'films'); }
  catch (e) { console.error('letterboxd failed (keeping previous):', e.message); }

  try {
    const s = await spotify();
    if (s && s.skipped) next.spotify = null; else { next.spotify = s; ok++; console.log('spotify:', s.recent.length, 'recent,', s.nowPlaying ? 'now playing' : 'idle'); }
  } catch (e) { console.error('spotify failed (keeping previous):', e.message); }

  if (!ok) { console.error('no source succeeded; leaving data untouched'); process.exit(1); }

  // Skip the write (and therefore the commit) when nothing actually changed and
  // nothing is live, so idle half-hours don't add noise to the git history.
  const same = prev && JSON.stringify({ s: prev.spotify, l: prev.letterboxd }) === JSON.stringify({ s: next.spotify, l: next.letterboxd });
  if (same && !(next.spotify && next.spotify.nowPlaying)) { console.log('unchanged'); return; }

  await mkdir('data', { recursive: true });
  await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), ...next }, null, 2) + '\n');
  console.log('wrote', OUT);
}

if (!process.env.NOW_NO_RUN) main();
