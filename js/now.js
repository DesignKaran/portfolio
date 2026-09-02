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

  function renderSpotify(card, sp, updatedAt) {
    var fresh = updatedAt && (Date.now() - new Date(updatedAt).getTime()) < 10 * 60 * 1000;
    var live = fresh && sp.nowPlaying;
    var t = live ? sp.nowPlaying : (sp.recent && sp.recent[0]);
    if (!t) return;
    var b = body(card);

    var row = el('div', 'now-track');
    if (t.art) {
      var img = el('img', 'now-art'); img.src = t.art; img.alt = ''; img.width = 64; img.height = 64;
      img.referrerPolicy = 'no-referrer';
      img.onerror = function () { img.remove(); };
      row.appendChild(img);
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
    var name = t.url ? link(t.url, 'now-name', t.name) : el('div', 'now-name', t.name);
    txt.appendChild(name);
    txt.appendChild(el('p', 'now-sub', t.artists + (t.album ? ' — ' + t.album : '')));
    row.appendChild(txt);
    b.appendChild(row);

    if (sp.top && sp.top.length) {
      var chips = el('div', 'now-chips');
      chips.appendChild(el('span', 'now-chip-label', 'On repeat'));
      sp.top.slice(0, 3).forEach(function (x) {
        chips.appendChild(x.url ? link(x.url, 'now-chip', x.name) : el('span', 'now-chip', x.name));
      });
      b.appendChild(chips);
    }
    var src = card.querySelector('.hobby-src');
    if (src && t.url) src.href = t.url;
  }

  function renderLetterboxd(card, lb) {
    var films = (lb.films || []).slice(0, 4);
    if (!films.length) return;
    var b = body(card);
    var row = el('div', 'film-row');
    films.forEach(function (f) {
      var a = f.url ? link(f.url, 'film') : el('div', 'film');
      if (f.poster) {
        var img = el('img', 'film-poster'); img.src = f.poster; img.alt = ''; img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.onerror = function () { img.replaceWith(el('span', 'film-poster film-poster--empty')); };
        a.appendChild(img);
      } else {
        a.appendChild(el('span', 'film-poster film-poster--empty'));
      }
      var title = f.title + (f.year ? ' (' + f.year + ')' : '');
      a.setAttribute('aria-label', title + (f.rating != null ? ', rated ' + f.rating + ' of 5' : ''));
      a.appendChild(el('span', 'film-title', f.title));
      var meta = el('span', 'film-meta');
      if (f.rating != null) meta.appendChild(el('span', 'film-stars', stars(f.rating)));
      if (f.year) meta.appendChild(el('span', null, (f.rating != null ? ' ' : '') + f.year));
      a.appendChild(meta);
      row.appendChild(a);
    });
    b.appendChild(row);
    var last = films[0].watchedDate;
    if (last) b.appendChild(el('p', 'now-updated', 'Last watched ' + ago(last + 'T12:00:00')));
  }

  fetch('data/now.json?t=' + Math.floor(Date.now() / 9e5), { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      if (byKey.spotify && d.spotify) renderSpotify(byKey.spotify, d.spotify, d.updatedAt);
      if (byKey.letterboxd && d.letterboxd) renderLetterboxd(byKey.letterboxd, d.letterboxd);
    })
    .catch(function () { /* keep the static copy */ });
})();
