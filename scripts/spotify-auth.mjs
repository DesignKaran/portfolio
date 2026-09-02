// One-time helper: mints the Spotify refresh token the Action needs.
//   node scripts/spotify-auth.mjs <CLIENT_ID> <CLIENT_SECRET>
// Your Spotify app's Redirect URI must be exactly: http://127.0.0.1:8888/callback
import http from 'node:http';
import { randomBytes } from 'node:crypto';

const id = process.env.SPOTIFY_CLIENT_ID || process.argv[2];
const secret = process.env.SPOTIFY_CLIENT_SECRET || process.argv[3];
if (!id || !secret) { console.error('usage: node scripts/spotify-auth.mjs <CLIENT_ID> <CLIENT_SECRET>'); process.exit(1); }

const REDIRECT = 'http://127.0.0.1:8888/callback';
const state = randomBytes(8).toString('hex');
const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
  client_id: id, response_type: 'code', redirect_uri: REDIRECT, state,
  scope: 'user-read-currently-playing user-read-recently-played user-top-read',
});

http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
  if (u.searchParams.get('state') !== state) { res.writeHead(400); res.end('state mismatch'); return; }
  const tok = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: u.searchParams.get('code'), redirect_uri: REDIRECT }),
  }).then((r) => r.json());
  if (!tok.refresh_token) { res.end('Failed: ' + JSON.stringify(tok)); console.error(tok); process.exit(1); }
  res.end('All set. You can close this tab and go back to the terminal.');
  console.log('\nAdd these three repository secrets (Settings -> Secrets and variables -> Actions):\n');
  console.log('SPOTIFY_CLIENT_ID     =', id);
  console.log('SPOTIFY_CLIENT_SECRET =', secret);
  console.log('SPOTIFY_REFRESH_TOKEN =', tok.refresh_token, '\n');
  process.exit(0);
}).listen(8888, '127.0.0.1', () => {
  console.log('1) Open this URL in your browser and click Agree:\n\n' + url + '\n');
  console.log('2) Waiting for Spotify to send you back to ' + REDIRECT + ' ...');
});
