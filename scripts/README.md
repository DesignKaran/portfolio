# Live "When I'm not designing" cards

`data/now.json` is refreshed every 30 minutes by `.github/workflows/now.yml`
(runs `scripts/fetch-now.mjs`). The about page fetches that file and fills the
**Listening** (Spotify) and **Watching** (Letterboxd) cards; nothing runs in the
browser against either service, and no keys are shipped to the site.

- **Letterboxd** needs nothing: it reads the public RSS at
  `letterboxd.com/<user>/rss/`. Change the user with the `LETTERBOXD_USER` env
  (defaults to `BinkyBoinky`).
- **Spotify** needs a one-time setup:
  1. Create an app at https://developer.spotify.com/dashboard. Set the
     Redirect URI to exactly `http://127.0.0.1:8888/callback` and enable the
     Web API. Copy the Client ID and Client Secret.
  2. Run locally: `node scripts/spotify-auth.mjs <CLIENT_ID> <CLIENT_SECRET>`,
     open the printed URL, click Agree. The script prints your refresh token.
  3. In the repo: Settings → Secrets and variables → Actions → add
     `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`.
  4. Actions → "Refresh now-card data" → Run workflow. The Listening card fills
     on the next deploy.

- **Favorites** (the four posters under "Last watched"): Letterboxd's profile page
  is behind a bot challenge, so list them in `data/favorites.json`:
  `[{ "title": "Whiplash", "year": 2014, "slug": "whiplash-2014" }, ...]`
  (`slug` is the part after `letterboxd.com/film/`; it only powers the link).
  Posters resolve automatically on the next run.

Nothing to install; Node 20+ only.
