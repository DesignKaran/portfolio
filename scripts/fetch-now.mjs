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
const UA = { 'User-Agent': 'karanqmr.com now-card (github actions)' };

// Favorites: Letterboxd's profile page sits behind a Cloudflare JS challenge, so
// the four favorites are listed by hand in data/favorites.json
// ([{ "title", "year", "slug" }]). Posters come from the diary feed when the
// film is in it, otherwise from Apple's public movie catalog (no key needed).
export function pickItunes(json, year) {
  const r = (json && json.results) || [];
  const y = parseInt(year, 10);
  const byYear = (tol) => r.find((x) => Math.abs(parseInt((x.releaseDate || '').slice(0, 4), 10) - y) <= tol);
  const m = (y ? (byYear(0) || byYear(1)) : null) || r[0];
  return m && m.artworkUrl100 ? m.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x900bb.') : null;
}
async function itunesPoster(title, year) {
  const q = new URLSearchParams({ term: title, media: 'movie', entity: 'movie', limit: '10', country: 'US' });
  const r = await fetch('https://itunes.apple.com/search?' + q, { headers: UA });
  if (!r.ok) throw new Error('itunes ' + r.status);
  const j = JSON.parse(await r.text());
  console.log('itunes', JSON.stringify(title), 'results:', j.resultCount);
  return pickItunes(j, year);
}
// Wikipedia fallback: search for the film article, then take the page's lead image
// (the poster on film articles). Keyless; wants a descriptive User-Agent.
const WIKI_UA = { 'User-Agent': 'karanqmr.com-now-card/1.0 (portfolio favorites poster lookup)' };
export function pickWikiTitle(json, title, year) {
  const hits = (json && json.query && json.query.search) || [];
  const t = title.toLowerCase();
  const scored = hits.map((h) => {
    const n = h.title.toLowerCase(); let sc = 0;
    if (n === t || n === t + ' (film)' || n === `${t} (${year} film)`) sc += 3;
    else if (n.startsWith(t)) sc += 1;
    if (/\(.*film\)/.test(n)) sc += 1;
    if (year && n.includes(String(year))) sc += 1;
    return { title: h.title, sc };
  }).sort((a, b) => b.sc - a.sc);
  return scored.length ? scored[0].title : null;
}
async function wikiPoster(title, year) {
  const q = new URLSearchParams({ action: 'query', list: 'search', srsearch: `${title} ${year || ''} film`, srlimit: '5', format: 'json' });
  const r = await fetch('https://en.wikipedia.org/w/api.php?' + q, { headers: WIKI_UA });
  if (!r.ok) throw new Error('wiki search ' + r.status);
  const page = pickWikiTitle(await r.json(), title, year);
  if (!page) return null;
  const s = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(page.replace(/ /g, '_')), { headers: WIKI_UA });
  if (!s.ok) throw new Error('wiki summary ' + s.status);
  const j = await s.json();
  const img = (j.originalimage && j.originalimage.source) || (j.thumbnail && j.thumbnail.source) || null;
  console.log('wiki', JSON.stringify(title), '->', page, img ? 'poster' : 'no image');
  return img;
}
async function favorites(diaryFilms) {
  let cfg = [];
  try { cfg = JSON.parse(await readFile('data/favorites.json', 'utf8')); } catch (_) { return []; }
  const out = [];
  for (const f of (Array.isArray(cfg) ? cfg : []).slice(0, 4)) {
    if (!f || !f.title) continue;
    const hit = diaryFilms.find((x) => x.title.toLowerCase() === f.title.toLowerCase());
    let poster = hit && hit.poster ? hit.poster : null;
    if (!poster) poster = await itunesPoster(f.title, f.year).catch((e) => { console.error('itunes failed for', f.title, e.message); return null; });
    if (!poster) poster = await wikiPoster(f.title, f.year).catch((e) => { console.error('wiki failed for', f.title, e.message); return null; });
    out.push({ title: f.title, year: f.year || null, url: f.slug ? `https://letterboxd.com/film/${f.slug}/` : null, poster });
  }
  return out;
}
async function letterboxd() {
  const r = await fetch(`https://letterboxd.com/${LB_USER}/rss/`, { headers: UA });
  if (!r.ok) throw new Error('rss ' + r.status);
  const all = parseLetterboxd(await r.text(), 50);
  const out = { user: all.user, films: all.films.slice(0, 6) };
  try { out.favorites = await favorites(all.films); console.log('letterboxd favorites:', out.favorites.length, 'posters:', out.favorites.filter((f) => f.poster).length); }
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
// Top genres. Spotify still ranks top artists but (since 2025) returns empty
// genre tags for newer apps, so tags come from MusicBrainz, filtered against its
// canonical genre list and cached in data/genre-cache.json (only new artists are
// looked up; MusicBrainz asks for 1 request/second).
const GENRE_CACHE = 'data/genre-cache.json';
const MB = { 'User-Agent': 'karanqmr.com-now-card/1.0 (https://www.karanqmr.com)', Accept: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function pickMbTags(json, name, genreSet) {
  const list = (json && json.artists) || [];
  const hit = list.find((a) => (a.name || '').toLowerCase() === name.toLowerCase()) || list[0];
  return ((hit && hit.tags) || [])
    .filter((t) => t.count > 0 && (!genreSet || genreSet.has(t.name.toLowerCase())))
    .sort((a, b) => b.count - a.count).slice(0, 4).map((t) => t.name.toLowerCase());
}
async function mbGenres(names, maxLookups = 20) {
  let cache = { genres: null, artists: {} };
  try { cache = JSON.parse(await readFile(GENRE_CACHE, 'utf8')); } catch (_) {}
  if (!cache.genres) {
    try {
      const r = await fetch('https://musicbrainz.org/ws/2/genre/all?fmt=txt', { headers: MB });
      if (r.ok) cache.genres = (await r.text()).split('\n').map((x) => x.trim().toLowerCase()).filter(Boolean);
    } catch (e) { console.error('mb genre list failed:', e.message); }
    await sleep(1100);
  }
  const genreSet = cache.genres && cache.genres.length ? new Set(cache.genres) : null;
  let looked = 0;
  for (const name of names) {
    if (cache.artists[name] !== undefined) continue;
    if (looked >= maxLookups) break;
    looked++;
    try {
      const q = new URLSearchParams({ query: 'artist:"' + name.replace(/"/g, '') + '"', fmt: 'json', limit: '5' });
      const r = await fetch('https://musicbrainz.org/ws/2/artist/?' + q, { headers: MB });
      if (!r.ok) throw new Error('mb ' + r.status);
      cache.artists[name] = pickMbTags(await r.json(), name, genreSet);
    } catch (e) { console.error('musicbrainz failed for', name, e.message); }
    await sleep(1100);
  }
  if (looked) console.log('musicbrainz: looked up', looked, 'artists');
  await mkdir('data', { recursive: true });
  await writeFile(GENRE_CACHE, JSON.stringify(cache, null, 1) + '\n');
  return cache.artists;
}
export function topGenres(artistsJson, mbMap, limit = 6) {
  const items = (artistsJson && artistsJson.items) || [];
  const score = new Map();
  items.forEach((a, i) => {
    const w = items.length - i;
    const tags = (a.genres && a.genres.length) ? a.genres : ((mbMap && mbMap[a.name]) || []);
    tags.forEach((g, k) => score.set(g, (score.get(g) || 0) + w * Math.pow(0.7, k)));
  });
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([g]) => g.replace(/\b\w/g, (c) => c.toUpperCase()));
}
export function shapeSpotify(np, rec, top, artists, mbMap) {
  const nowPlaying = np && np.is_playing && np.item && np.currently_playing_type === 'track' ? track(np.item) : null;
  // Newest first; drop repeats of the same track (played twice in a row) so the
  // card's cover grid shows distinct songs. Cap at 8.
  const seen = new Set();
  const recent = ((rec && rec.items) || [])
    .map((i) => Object.assign(track(i.track), { playedAt: i.played_at }))
    .filter((t) => { const k = t.url || t.name + '|' + t.artists; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 8);
  return { nowPlaying, recent, top: ((top && top.items) || []).map(track), genres: topGenres(artists, mbMap) };
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
  const [np, rec, top, artists] = await Promise.all([
    get('/me/player/currently-playing').catch(() => null),
    get('/me/player/recently-played?limit=15'),
    get('/me/top/tracks?time_range=short_term&limit=8').catch(() => null),
    get('/me/top/artists?time_range=medium_term&limit=50').catch((e) => { console.error('top artists failed:', e.message); return null; }),
  ]);
  const arts = (artists && artists.items) || [];
  console.log('spotify top artists:', arts.length, '| with spotify genres:', arts.filter((a) => a.genres && a.genres.length).length);
  const needMb = arts.filter((a) => !(a.genres && a.genres.length)).map((a) => a.name);
  const mbMap = needMb.length ? await mbGenres(needMb).catch((e) => { console.error('musicbrainz failed:', e.message); return {}; }) : {};
  const shaped = shapeSpotify(np, rec, top, artists, mbMap);
  console.log('spotify genres:', shaped.genres.join(', ') || '(none)');
  return shaped;
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
