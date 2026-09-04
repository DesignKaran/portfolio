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
    // Dark-mode variants for the JS-painted spy colors: the deep accent actives lack
    // contrast on the dark background, and the light idle dots would glow. Anything
    // not in the map is legible on both themes and passes through unchanged.
    var DARK_SPY = {
      '#3a5fd9': '#a9b8f8', '#4a90d9': '#85bbeb', '#0f5b43': '#5ecfa4',
      '#d6cdb9': '#4a4436', '#c3ccc5': '#414b46'
    };
    function themed(c) {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark';
      return dark && DARK_SPY[c] ? DARK_SPY[c] : c;
    }
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
      var A = themed(active), I = themed(idle), D = themed(dotIdle);
      links.forEach(function (a) {
        var on = a.getAttribute('data-sidelink') === cur;
        a.style.color = on ? A : I;
        var dot = a.querySelector('[data-sidedot]');
        if (dot) { dot.style.background = on ? A : D; dot.style.width = on ? '28px' : '18px'; }
      });
      // Mobile bar: reveal past the hero (so it never covers the wordmark at the top),
      // highlight the active chip, and keep it centered in the horizontal scroller.
      var sy = window.pageYOffset || document.documentElement.scrollTop || 0;
      tabsEl.classList.toggle('is-visible', sy > 280);
      tabEls.forEach(function (tab) {
        var on = tab.getAttribute('data-tab') === cur;
        tab.style.color = on ? A : I;
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

  // ---------- lightbox: zoom any figure, as an accessible modal dialog ----------
  // Follows the APG modal pattern: each zoomable image acts as a button
  // ("Enlarge: {alt}"), the overlay is role=dialog + aria-modal with a real
  // close button, focus moves in on open and back to the trigger on close,
  // Tab is trapped inside, Esc / backdrop / the button all close, the rest of
  // the page is made inert, and body scroll is locked while it is open.
  function initLightbox() {
    var lb = document.querySelector('[data-lightbox]');
    var lbImg = lb ? lb.querySelector('[data-lightbox-img]') : null;
    if (!lb || !lbImg) return;

    // The overlay ships inside the page wrapper; move it to <body> so the
    // wrapper can be inert while the dialog is open.
    document.body.appendChild(lb);
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Enlarged image');

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lb-close';
    closeBtn.setAttribute('aria-label', 'Close enlarged image');
    closeBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"></path></svg>';
    lb.appendChild(closeBtn);

    var inerted = [];
    var lastTrigger = null;
    var isOpen = false;

    function setInert(on) {
      if (!('inert' in HTMLElement.prototype)) return;
      if (on) {
        inerted = [];
        Array.prototype.forEach.call(document.body.children, function (el) {
          if (el === lb || el.inert) return;
          el.inert = true;
          inerted.push(el);
        });
      } else {
        inerted.forEach(function (el) { el.inert = false; });
        inerted = [];
      }
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      lb.style.opacity = '0';
      lb.style.pointerEvents = 'none';
      lb.style.background = 'rgba(16,22,20,0)';
      lbImg.style.transform = 'scale(0.92)';
      lb.setAttribute('aria-hidden', 'true');
      setInert(false);
      document.documentElement.style.removeProperty('overflow');
      if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
      lastTrigger = null;
    }
    function open(im) {
      lastTrigger = im;
      lbImg.src = im.currentSrc || im.getAttribute('src');
      lbImg.alt = im.getAttribute('alt') || '';
      lb.setAttribute('aria-label', im.getAttribute('alt') || 'Enlarged image');
      lb.removeAttribute('aria-hidden');
      lb.style.pointerEvents = 'auto';
      lb.style.opacity = '1';
      lb.style.background = 'rgba(16,22,20,0.85)';
      if (reduced) { lbImg.style.transform = 'scale(1)'; }
      else { requestAnimationFrame(function () { lbImg.style.transform = 'scale(1)'; }); }
      setInert(true);
      document.documentElement.style.overflow = 'hidden';
      isOpen = true;
      closeBtn.focus();
    }

    lb.addEventListener('click', close);
    closeBtn.addEventListener('click', function (e) { e.stopPropagation(); close(); });
    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      // Single-stop focus trap: the close button is the only focusable control.
      if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }
    });

    Array.prototype.forEach.call(document.querySelectorAll('img'), function (im) {
      if (lb.contains(im)) return;
      im.style.cursor = 'zoom-in';
      im.setAttribute('role', 'button');
      im.setAttribute('tabindex', '0');
      im.setAttribute('aria-label', 'Enlarge: ' + (im.getAttribute('alt') || 'image'));
      im.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        open(im);
      });
      im.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          open(im);
        }
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

  // ---------- wide figures: mobile swipe affordance ----------
  // Some diagram tables overflow horizontally on small screens with no visual
  // cue. Tag them for a right-edge fade (CSS .hscroll) and add a small hint
  // caption that disappears after the first scroll.
  function initHScrollHints() {
    Array.prototype.forEach.call(document.querySelectorAll('div'), function (el) {
      if (el.closest('.section-tabs') || el.classList.contains('hscroll')) return;
      var cs = getComputedStyle(el);
      if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') return;
      if (el.scrollWidth <= el.clientWidth + 8) return;
      el.classList.add('hscroll');
      var hint = document.createElement('span');
      hint.className = 'hscroll-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = 'swipe \u2192';
      el.insertAdjacentElement('afterend', hint);
      el.addEventListener('scroll', function done() {
        el.classList.add('hscroll--used');
        el.removeEventListener('scroll', done);
      }, { passive: true });
    });
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
    initHScrollHints();
    window.addEventListener('load', initHScrollHints);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('themechange', function () { if (updateSidenav) updateSidenav(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
