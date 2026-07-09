/* Shared behaviors for the case-study pages: research accordion, left
   section-rail highlight, back-to-top button, and image lightbox.
   Footer shapes, headline warp, and scroll reveals come from main.js. */
(function () {
  'use strict';

  function mq(q) {
    try { return window.matchMedia(q).matches; } catch (e) { return false; }
  }
  var reduced = mq('(prefers-reduced-motion: reduce)');

  // ---------- accordion (one panel open per group) ----------
  function initAccordions() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-acc-group]'), function (group) {
      var btns = Array.prototype.slice.call(group.querySelectorAll('[data-acc-btn]'));
      function setItem(btn, open) {
        var item = btn.parentElement;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        var body = item.querySelector('[data-acc-body]');
        if (body) body.style.gridTemplateRows = open ? '1fr' : '0fr';
        var sum = btn.querySelector('[data-acc-sum]');
        if (sum) sum.style.opacity = open ? '0' : '1';
        var chev = btn.querySelector('[data-acc-chev]');
        if (chev) chev.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
      }
      btns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var wasOpen = btn.getAttribute('aria-expanded') === 'true';
          btns.forEach(function (b) { setItem(b, false); });
          if (!wasOpen) setItem(btn, true);
        });
      });
    });
  }

  // ---------- left section rail: active highlight + hide near footer ----------
  function initSidenav() {
    var sidenav = document.querySelector('[data-sidenav]');
    if (!sidenav) return null;
    var active = sidenav.getAttribute('data-active-color') || '#0f5b43';
    var idle = sidenav.getAttribute('data-idle-color') || '#8a938c';
    var dotIdle = sidenav.getAttribute('data-dot-idle') || '#c3ccc5';
    var links = Array.prototype.slice.call(sidenav.querySelectorAll('[data-sidelink]'));
    var ids = links.map(function (a) { return a.getAttribute('data-sidelink'); });
    var footerEl = document.querySelector('footer');

    // Mobile section bar: the left rail is hidden below 1440px, so mirror its anchors
    // into a slim top bar of tappable chips. Built from the same links (no per-page
    // markup) and driven by the same scroll-spy update() below.
    var tabsEl = document.createElement('nav');
    tabsEl.className = 'section-tabs';
    tabsEl.setAttribute('aria-label', 'Sections');
    var track = document.createElement('div');
    track.className = 'section-tabs-track';
    tabsEl.appendChild(track);
    var tabEls = links.map(function (a) {
      var id = a.getAttribute('data-sidelink');
      var tab = document.createElement('a');
      tab.className = 'section-tab';
      tab.href = '#' + id;
      tab.setAttribute('data-tab', id);
      tab.textContent = a.textContent.trim();
      tab.style.color = idle;
      tab.addEventListener('click', function (e) {
        e.preventDefault();
        var el = document.getElementById(id);
        if (!el) return;
        var barH = tabsEl.offsetHeight || 48;
        var y0 = window.pageYOffset || document.documentElement.scrollTop || 0;
        var y = el.getBoundingClientRect().top + y0 - barH - 8;
        window.scrollTo({ top: Math.max(0, y), behavior: reduced ? 'auto' : 'smooth' });
        if (window.history && history.replaceState) history.replaceState(null, '', '#' + id);
      });
      track.appendChild(tab);
      return tab;
    });
    document.body.appendChild(tabsEl);
    var lastCur = null;

    function update() {
      var mid = (window.innerHeight || 800) * 0.4;
      var cur = ids[0];
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= mid) cur = id;
      });
      links.forEach(function (a) {
        var on = a.getAttribute('data-sidelink') === cur;
        a.style.color = on ? active : idle;
        var dot = a.querySelector('[data-sidedot]');
        if (dot) { dot.style.background = on ? active : dotIdle; dot.style.width = on ? '28px' : '18px'; }
      });
      // Mobile bar: reveal past the hero (so it never covers the wordmark at the top),
      // highlight the active chip, and keep it centered in the horizontal scroller.
      var sy = window.pageYOffset || document.documentElement.scrollTop || 0;
      tabsEl.classList.toggle('is-visible', sy > 280);
      tabEls.forEach(function (tab) {
        var on = tab.getAttribute('data-tab') === cur;
        tab.style.color = on ? active : idle;
        tab.classList.toggle('is-active', on);
      });
      if (cur !== lastCur && tabsEl.classList.contains('is-visible')) {
        var act = tabEls[ids.indexOf(cur)];
        if (act) {
          var tr = track.getBoundingClientRect(), ar = act.getBoundingClientRect();
          var delta = (ar.left - tr.left) - (track.clientWidth - act.offsetWidth) / 2;
          track.scrollBy({ left: delta, behavior: reduced ? 'auto' : 'smooth' });
        }
      }
      lastCur = cur;
      if (footerEl) {
        var fTop = footerEl.getBoundingClientRect().top;
        var navH = sidenav.offsetHeight || 240;
        var limit = (window.innerHeight || 800) / 2 + navH / 2 + 20;
        var hide = fTop < limit;
        sidenav.style.opacity = hide ? '0' : '1';
        sidenav.style.visibility = hide ? 'hidden' : 'visible';
        sidenav.style.pointerEvents = hide ? 'none' : 'auto';
      }
    }
    update();
    return update;
  }

  // ---------- back-to-top: show past a threshold, park above the footer ----------
  function initToTop() {
    var toTop = document.querySelector('[data-totop]');
    var footerEl = document.querySelector('footer');
    if (!toTop || !footerEl) return null;

    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });

    function update() {
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      var show = y > 420;
      toTop.style.opacity = show ? '1' : '0';
      toTop.style.visibility = show ? 'visible' : 'hidden';
      toTop.style.pointerEvents = show ? 'auto' : 'none';
      var vh = window.innerHeight || 800;
      var restBottom = 24, gap = 20, btnH = toTop.offsetHeight || 56;
      var footTopDoc = footerEl.getBoundingClientRect().top + y;
      if (y + vh - restBottom > footTopDoc - gap) {
        toTop.style.position = 'absolute';
        toTop.style.top = (footTopDoc - btnH - gap) + 'px';
        toTop.style.bottom = 'auto';
      } else {
        toTop.style.position = 'fixed';
        toTop.style.top = 'auto';
        toTop.style.bottom = restBottom + 'px';
      }
    }
    update();
    return update;
  }

  // ---------- lightbox: click any figure to zoom ----------
  function initLightbox() {
    var lb = document.querySelector('[data-lightbox]');
    var lbImg = lb ? lb.querySelector('[data-lightbox-img]') : null;
    if (!lb || !lbImg) return;
    function close() {
      lb.style.opacity = '0';
      lb.style.pointerEvents = 'none';
      lb.style.background = 'rgba(16,22,20,0)';
      lbImg.style.transform = 'scale(0.92)';
    }
    function open(src, alt) {
      lbImg.src = src; lbImg.alt = alt || '';
      lb.style.pointerEvents = 'auto';
      lb.style.opacity = '1';
      lb.style.background = 'rgba(16,22,20,0.85)';
      requestAnimationFrame(function () { lbImg.style.transform = 'scale(1)'; });
    }
    lb.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    Array.prototype.forEach.call(document.querySelectorAll('img'), function (im) {
      if (lb.contains(im)) return;
      im.style.cursor = 'zoom-in';
      im.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        open(im.currentSrc || im.getAttribute('src'), im.getAttribute('alt'));
      });
    });
  }

  // ---------- annotated figure: SVG leader lines from dots to cards ----------
  function initCallouts() {
    var fig = document.querySelector('[data-anno-fig]');
    if (!fig) return null;
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:2;';
    fig.appendChild(svg);
    var keys = Array.prototype.map.call(fig.querySelectorAll('[data-anno-dot]'), function (d) {
      return d.getAttribute('data-anno-dot');
    });
    var lines = {};
    keys.forEach(function (k) {
      var l = document.createElementNS(NS, 'line');
      l.setAttribute('stroke', '#1c1a17');
      l.setAttribute('stroke-width', '1');
      svg.appendChild(l);
      lines[k] = l;
    });
    function update() {
      var fr = fig.getBoundingClientRect();
      if (!fr.width) return;
      var ok = true;
      keys.forEach(function (k) {
        var dot = fig.querySelector('[data-anno-dot="' + k + '"]');
        var card = fig.querySelector('[data-anno-card="' + k + '"]');
        var l = lines[k];
        if (!dot || !card) { l.setAttribute('opacity', '0'); return; }
        var dr = dot.getBoundingClientRect(), cr = card.getBoundingClientRect();
        var x1 = dr.left + dr.width / 2 - fr.left, y1 = dr.top + dr.height / 2 - fr.top;
        var x2 = cr.left - fr.left, y2 = cr.top + cr.height / 2 - fr.top;
        if (x2 <= x1 + 14) ok = false;
        l.setAttribute('opacity', '1');
        l.setAttribute('x1', x1.toFixed(1)); l.setAttribute('y1', y1.toFixed(1));
        l.setAttribute('x2', x2.toFixed(1)); l.setAttribute('y2', y2.toFixed(1));
      });
      svg.style.display = ok ? 'block' : 'none';
    }
    update();
    setTimeout(update, 600);
    setTimeout(update, 1800);
    window.addEventListener('load', update);
    return update;
  }

  function init() {
    initAccordions();
    initLightbox();
    var updateSidenav = initSidenav();
    var updateToTop = initToTop();
    var updateCallouts = initCallouts();
    var raf = null;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = null;
        if (updateSidenav) updateSidenav();
        if (updateToTop) updateToTop();
        if (updateCallouts) updateCallouts();
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
