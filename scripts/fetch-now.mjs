// Refreshes data/now.json with recent Letterboxd + Spotify activity for the
// about page's "When I'm not designing" cards. Runs in GitHub Actions
// (.github/workflows/now.yml); zero dependencies, Node 20+.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const LB_USER = process.env.LETTERBOXD_USER || 'BinkyBoinky';
const OUT = 'data/now.json';

// ---------- Letterboxd (public RSS, no auth) ----------
// Letterboxd double-encodes titles (&amp;#039;), so decode &amp; first, then
// numeric (&#039; / &#x27;) and named entities.
function decode(s) {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
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
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 karanqmr.com-now-card' };

// The four "Favorite films" on the profile page (not in the RSS). Posters are
// lazy-loaded on the site, so each one is resolved via Letterboxd's poster
// fragment endpoint. Any failure just yields [] and the row stays hidden.
export function parseFavoriteSlugs(html) {
  const i = html.indexOf('id="favourites"');
  if (i < 0) return [];
  const sec = html.slice(i, html.indexOf('</section>', i) >>> 0);
  const out = [];
  const re = /data-film-slug="([^"]+)"[\s\S]*?alt="([^"]*)"/g;
  let m;
  while ((m = re.exec(sec)) && out.length < 4) out.push({ slug: m[1], title: decode(m[2]) });
  return out;
}
export function parsePosterFragment(html) {
  const src = html.match(/src="(https:\/\/a\.ltrbxd\.com[^"]+)"/);
  const year = html.match(/data-film-release-year="(\d{4})"/);
  const title = html.match(/data-film-name="([^"]*)"/);
  return { poster: src ? decode(src[1]) : null, year: year ? year[1] : null, title: title ? decode(title[1]) : null };
}
async function favorites() {
  const r = await fetch(`https://letterboxd.com/${LB_USER}/`, { headers: UA });
  if (!r.ok) throw new Error('profile ' + r.status);
  const slugs = parseFavoriteSlugs(await r.text());
  const favs = [];
  for (const f of slugs) {
    let frag = { poster: null, year: null, title: null };
    try {
      const pr = await fetch(`https://letterboxd.com/ajax/poster/film/${f.slug}/std/150x225/`, { headers: UA });
      if (pr.ok) frag = parsePosterFragment(await pr.text());
    } catch (_) {}
    favs.push({ title: frag.title || f.title, year: frag.year, url: `https://letterboxd.com/film/${f.slug}/`, poster: frag.poster });
  }
  return favs;
}
async function letterboxd() {
  const r = await fetch(`https://letterboxd.com/${LB_USER}/rss/`, { headers: UA });
  if (!r.ok) throw new Error('rss ' + r.status);
  const out = parseLetterboxd(await r.text());
  try { out.favorites = await favorites(); console.log('letterboxd favorites:', out.favorites.length); }
  catch (e) { console.error('favorites failed:', e.message); out.favorites = []; }
  return out;
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
  // Newest first; drop repeats of the same track (played twice in a row) so the
  // card's cover grid shows distinct songs. Cap at 8.
  const seen = new Set();
  const recent = ((rec && rec.items) || [])
    .map((i) => Object.assign(track(i.track), { playedAt: i.played_at }))
    .filter((t) => { const k = t.url || t.name + '|' + t.artists; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 8);
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
    get('/me/player/recently-played?limit=15'),
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

  try {
    next.letterboxd = await letterboxd(); ok++;
    if (!next.letterboxd.favorites.length && prev && prev.letterboxd && prev.letterboxd.favorites && prev.letterboxd.favorites.length) next.letterboxd.favorites = prev.letterboxd.favorites;
    console.log('letterboxd:', next.letterboxd.films.length, 'films');
  }
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
