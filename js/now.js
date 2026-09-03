(function () {
  'use strict';
  // Fills the about page's Listening (Spotify) and Watching (Letterboxd) cards
  // from data/now.json, which a scheduled GitHub Action refreshes. If the fetch
  // fails or a source is empty, the static copy already in the HTML stays.
  var cards = document.querySelectorAll('[data-now]');
  if (!cards.length) return;
  var byKey = {};
  Array.prototype.forEach.call(cards, function (c) { byKey[c.getAttribute('data-now')] = c; });

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function link(href, cls, text) {
    var a = el('a', cls, text);
    a.href = href; a.target = '_blank'; a.rel = 'noopener';
    return a;
  }
  function ago(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var s = (Date.now() - t) / 1000;
    if (s < 90) return 'just now';
    var m = s / 60; if (m < 60) return Math.round(m) + ' min ago';
    var h = m / 60; if (h < 24) return Math.round(h) + 'h ago';
    var d = h / 24; if (d < 7) return Math.round(d) + 'd ago';
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function stars(r) {
    if (r == null) return '';
    var full = Math.floor(r), half = r - full >= 0.5;
    var s = ''; for (var i = 0; i < full; i++) s += '★';
    return s + (half ? '½' : '');
  }
  function body(card) {
    var b = card.querySelector('.now-body');
    while (b.firstChild) b.removeChild(b.firstChild);
    return b;
  }

  function coverTile(x, sub) {
    var tile = x.url ? link(x.url, 'now-tile') : el('div', 'now-tile');
    tile.setAttribute('aria-label', x.name + (sub ? ' by ' + sub : ''));
    var ph = el('span', 'now-cover now-cover--empty');
    if (x.art) {
      var cv = el('img', 'now-cover'); cv.src = x.art; cv.alt = ''; cv.loading = 'lazy';
      cv.referrerPolicy = 'no-referrer';
      cv.onerror = function () { cv.replaceWith(ph); };
      tile.appendChild(cv);
    } else tile.appendChild(ph);
    tile.appendChild(el('span', 'now-tile-title', x.name));
    if (sub) tile.appendChild(el('span', 'now-tile-sub', sub));
    return tile;
  }

  function renderSpotify(card, sp, updatedAt) {
    var fresh = updatedAt && (Date.now() - new Date(updatedAt).getTime()) < 10 * 60 * 1000;
    var live = fresh && sp.nowPlaying;
    var t = live ? sp.nowPlaying : (sp.recent && sp.recent[0]);
    if (!t) return;
    var b = body(card);

    // Hero: the current / last track, big.
    var hero = el('div', 'now-hero');
    if (t.art) {
      var img = el('img', 'now-art'); img.src = t.art; img.alt = ''; img.width = 160; img.height = 160;
      img.referrerPolicy = 'no-referrer';
      img.onerror = function () { img.remove(); };
      hero.appendChild(img);
    }
    var txt = el('div', 'now-text');
    var status = el('div', 'now-status');
    if (live) {
      var eq = el('span', 'now-eq'); eq.setAttribute('aria-hidden', 'true');
      eq.appendChild(el('i')); eq.appendChild(el('i')); eq.appendChild(el('i'));
      status.appendChild(eq);
      status.appendChild(el('span', null, 'Now playing'));
    } else {
      status.appendChild(el('span', null, 'Last played' + (t.playedAt ? ' · ' + ago(t.playedAt) : '')));
    }
    txt.appendChild(status);
    txt.appendChild(t.url ? link(t.url, 'now-name', t.name) : el('div', 'now-name', t.name));
    txt.appendChild(el('p', 'now-sub', t.artists));
    if (t.album) txt.appendChild(el('p', 'now-sub now-sub--album', t.album));
    hero.appendChild(txt);
    b.appendChild(hero);

    // On repeat: top tracks as a cover grid.
    var top = (sp.top || []).slice(0, 4);
    if (top.length) {
      var sec = el('div', 'now-section');
      sec.appendChild(el('span', 'now-chip-label', 'On repeat'));
      var grid = el('div', 'now-grid');
      top.forEach(function (x) { grid.appendChild(coverTile(x, x.artists)); });
      sec.appendChild(grid);
      b.appendChild(sec);
    }

    // Top genres as pills.
    var genres = (sp.genres || []).slice(0, 6);
    if (genres.length) {
      var chips = el('div', 'now-chips');
      chips.appendChild(el('span', 'now-chip-label', 'Top genres'));
      genres.forEach(function (g) { chips.appendChild(el('span', 'now-chip', g)); });
      b.appendChild(chips);
    }
    var src = card.querySelector('.hobby-src');
    if (src && t.url) src.href = t.url;
  }

  function filmTile(f, showStars) {
    var a = f.url ? link(f.url, 'film') : el('div', 'film');
    var ph = el('span', 'film-poster film-poster--empty');
    if (f.poster) {
      var img = el('img', 'film-poster'); img.src = f.poster; img.alt = ''; img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.onerror = function () { img.replaceWith(ph); };
      a.appendChild(img);
    } else a.appendChild(ph);
    var title = f.title + (f.year ? ' (' + f.year + ')' : '');
    a.setAttribute('aria-label', title + (showStars && f.rating != null ? ', rated ' + f.rating + ' of 5' : ''));
    a.appendChild(el('span', 'film-title', f.title));
    var meta = el('span', 'film-meta');
    if (showStars && f.rating != null) meta.appendChild(el('span', 'film-stars', stars(f.rating)));
    if (f.year) meta.appendChild(el('span', null, (showStars && f.rating != null ? ' ' : '') + f.year));
    a.appendChild(meta);
    return a;
  }

  function renderLetterboxd(card, lb) {
    var films = (lb.films || []).slice(0, 4);
    var favs = (lb.favorites || []).slice(0, 4);
    if (!films.length && !favs.length) return;
    var b = body(card);

    if (favs.length) {
      var fsec = el('div', 'now-section now-section--first');
      fsec.appendChild(el('span', 'now-chip-label fav-label', 'All-time favorites'));
      var frow = el('div', 'film-row');
      favs.forEach(function (f) { frow.appendChild(filmTile(f, false)); });
      fsec.appendChild(frow);
      b.appendChild(fsec);
    }
    if (films.length) {
      var rsec = el('div', 'now-section' + (favs.length ? '' : ' now-section--first'));
      rsec.appendChild(el('span', 'now-chip-label', 'Recently watched'));
      var row = el('div', 'film-row');
      films.forEach(function (f) { row.appendChild(filmTile(f, true)); });
      rsec.appendChild(row);
      b.appendChild(rsec);
      var last = films[0].watchedDate;
      if (last) b.appendChild(el('p', 'now-updated', 'Last watched ' + ago(last + 'T12:00:00')));
    }
  }

  // Wandering: four photos as small tilted "prints" in the poster/cover row
  // rhythm. The header's refresh button pages through the shuffled set; the
  // card keeps its static icon/title/copy when there are no photos.
  function renderWander(card, w) {
    var all = (w.photos || []).filter(function (p) { return p.file; });
    if (!all.length) return;
    var copy = card.querySelector('.now-body p');
    var copyText = copy ? copy.textContent : '';
    var offset = 0;

    function shuffle() {
      for (var i = all.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = all[i]; all[i] = all[j]; all[j] = tmp; }
    }
    function buildRow() {
      var pick = all.slice(offset, offset + 4);
      var row = el('div', 'print-row print-row--' + pick.length);
      pick.forEach(function (p) {
        var print = el('div', 'print');
        print.tabIndex = 0;
        var frame = el('div', 'print-frame');
        var img = el('img', 'print-photo'); img.src = p.file; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        var label = p.caption || (p.date ? new Date(p.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '');
        if (label) { print.title = label; print.setAttribute('aria-label', label); print.setAttribute('role', 'img'); }
        img.onerror = function () {
          print.remove();
          row.className = 'print-row print-row--' + row.children.length;
        };
        frame.appendChild(img);
        print.appendChild(frame);
        row.appendChild(print);
      });
      return row;
    }

    shuffle();
    var b = body(card);
    var row = buildRow();
    b.appendChild(row);
    if (copyText) b.appendChild(el('p', 'now-updated', copyText));
    card.classList.add('has-photos');

    var btn = card.querySelector('.wander-refresh');
    if (btn) {
      btn.hidden = false;
      btn.addEventListener('click', function () {
        offset += 4;
        if (offset + 4 > all.length) { shuffle(); offset = 0; }
        var next = buildRow();
        row.replaceWith(next);
        row = next;
        btn.classList.remove('spin');
        void btn.offsetWidth;
        btn.classList.add('spin');
      });
    }
  }

  function bucket() { return Math.floor(Date.now() / 9e5); }
  function getJson(url) {
    return fetch(url + '?t=' + bucket(), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  getJson('data/now.json')
    .then(function (d) {
      if (byKey.spotify && d.spotify) renderSpotify(byKey.spotify, d.spotify, d.updatedAt);
      if (byKey.letterboxd && d.letterboxd) renderLetterboxd(byKey.letterboxd, d.letterboxd);
    })
    .catch(function () { /* keep the static copy */ });
  if (byKey.wander) {
    getJson('data/wander.json')
      .then(function (w) { renderWander(byKey.wander, w); })
      .catch(function () { /* keep the static card */ });
  }
})();
