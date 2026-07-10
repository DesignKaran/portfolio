(function () {
  'use strict';

  function mq(q) {
    try { return window.matchMedia(q).matches; } catch (e) { return false; }
  }
  var reduced = mq('(prefers-reduced-motion: reduce)');
  var coarse = mq('(hover: none)') || mq('(pointer: coarse)');

  var WARP_STRENGTH = 1;
  var WARP_RADIUS = 170;

  var mouse = { x: -99999, y: -99999 };
  window.addEventListener('mousemove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  window.addEventListener('touchmove', function (e) { if (e.touches && e.touches[0]) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; } }, { passive: true });
  window.addEventListener('touchend', function () { mouse.x = -99999; mouse.y = -99999; }, { passive: true });
  document.addEventListener('mouseleave', function () { mouse.x = -99999; mouse.y = -99999; });

  // ---------- headline letter-warp (hero + footer) ----------
  function initHeadline(el, cfg) {
    if (!el) return null;
    var letters = Array.prototype.slice.call(el.querySelectorAll('[data-l]'));
    if (!letters.length) return null;
    return letters.map(function (l) {
      return { el: l, cfg: cfg, w: cfg.bW, wd: cfg.bWd, o: cfg.bO, vw: 0, vwd: 0, vo: 0, cx: 0, cy: 0 };
    });
  }

  function applyVar(it) {
    it.el.style.fontVariationSettings = "'opsz' " + it.o.toFixed(1) + ", 'wght' " + it.w.toFixed(0) + ", 'wdth' " + it.wd.toFixed(1);
  }

  function stepHeadline(items, t) {
    if (!items) return;
    var strength = WARP_STRENGTH, R = WARP_RADIUS, k = 0.12, d = 0.72;
    if (!coarse) {
      for (var i = 0; i < items.length; i++) {
        var r = items[i].el.getBoundingClientRect();
        items[i].cx = r.left + r.width / 2;
        items[i].cy = r.top + r.height / 2;
      }
    }
    for (var j = 0; j < items.length; j++) {
      var it = items[j], cfg = it.cfg, tw, twd, to;
      if (coarse) {
        var ph = (Math.sin(t / 520 - j * 0.45) + 1) / 2;
        var f = ph * 0.8 * strength;
        tw = cfg.bW + f * (cfg.nW - cfg.bW);
        twd = cfg.bWd + f * (cfg.nWd - cfg.bWd);
        to = cfg.bO + f * (cfg.nO - cfg.bO);
      } else {
        var dx = mouse.x - it.cx, dy = mouse.y - it.cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var f2 = 1 - dist / R;
        if (f2 < 0) f2 = 0;
        f2 = f2 * f2 * (3 - 2 * f2) * strength;
        tw = cfg.bW + f2 * (cfg.nW - cfg.bW);
        twd = cfg.bWd + f2 * (cfg.nWd - cfg.bWd);
        to = cfg.bO + f2 * (cfg.nO - cfg.bO);
      }
      it.vw += (tw - it.w) * k; it.vw *= d; it.w += it.vw;
      it.vwd += (twd - it.wd) * k; it.vwd *= d; it.wd += it.vwd;
      it.vo += (to - it.o) * k; it.vo *= d; it.o += it.vo;
      applyVar(it);
    }
  }

  // ---------- load-in + scroll-reveal ----------
  function initReveals() {
    var loads = Array.prototype.slice.call(document.querySelectorAll('[data-load]'));
    var reveals = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));

    // Never write to el.style here: assigning any inline style re-serializes the
    // whole style attribute (hex colors become rgb(...)), which breaks the theme
    // override map's [style*="..."] matching on these elements. The stagger is
    // done purely with timeouts + the .in class instead.
    var counts = new Map(), delayOf = new Map();
    reveals.forEach(function (el) {
      var p = el.parentElement;
      var i = counts.get(p) || 0; counts.set(p, i + 1);
      delayOf.set(el, i * 90);
    });

    if (reduced) {
      loads.forEach(function (el) { el.classList.add('in'); });
      reveals.forEach(function (el) { el.classList.add('in'); });
      return;
    }

    loads.forEach(function (el) {
      var d = parseInt(el.getAttribute('data-load-delay') || '0', 10);
      setTimeout(function () { el.classList.add('in'); }, d);
    });

    // Reveal once on load instead of on scroll. Content in the initial viewport
    // fades in (with its stagger); anything below the fold finishes revealing
    // off-screen, so scrolling no longer keeps re-triggering the fade-in.
    requestAnimationFrame(function () {
      reveals.forEach(function (el) {
        var d = delayOf.get(el) || 0;
        if (d) setTimeout(function () { el.classList.add('in'); }, d);
        else el.classList.add('in');
      });
    });
  }

  // ---------- footer: Material-3-style expressive shapes ----------
  function buildShapeLib() {
    var cx = 50, cy = 50, TAU = Math.PI * 2;
    function blobPts(lobes, amp, rot) {
      var out = [], steps = 240;
      for (var i = 0; i < steps; i++) {
        var a = i / steps * TAU + (rot || 0);
        var r = 42 * (1 + amp * Math.cos(lobes * a));
        out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      return out;
    }
    function polyPts(n, rate, rot) {
      var V = [];
      for (var i = 0; i < n; i++) { var a = (rot || 0) + i / n * TAU - Math.PI / 2; V.push([cx + 46 * Math.cos(a), cy + 46 * Math.sin(a)]); }
      var A = [], B = [];
      for (var j = 0; j < n; j++) {
        var p0 = V[(j - 1 + n) % n], p1 = V[j], p2 = V[(j + 1) % n];
        var v1x = p0[0] - p1[0], v1y = p0[1] - p1[1], v2x = p2[0] - p1[0], v2y = p2[1] - p1[1];
        var l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y), cut = Math.min(l1, l2) * 0.5 * rate;
        A.push([p1[0] + v1x / l1 * cut, p1[1] + v1y / l1 * cut]);
        B.push([p1[0] + v2x / l2 * cut, p1[1] + v2y / l2 * cut]);
      }
      var out = [], arc = 9, edge = 6;
      for (var k = 0; k < n; k++) {
        for (var t1 = 0; t1 < arc; t1++) { var tt = t1 / arc, u = 1 - tt; out.push([u * u * A[k][0] + 2 * u * tt * V[k][0] + tt * tt * B[k][0], u * u * A[k][1] + 2 * u * tt * V[k][1] + tt * tt * B[k][1]]); }
        var nx = A[(k + 1) % n];
        for (var t2 = 0; t2 < edge; t2++) { var tt2 = t2 / edge; out.push([B[k][0] + (nx[0] - B[k][0]) * tt2, B[k][1] + (nx[1] - B[k][1]) * tt2]); }
      }
      return out;
    }
    function pillPts() {
      var out = [];
      function seg(x0, y0, x1, y1, c) { for (var k = 0; k < c; k++) { var tt = k / c; out.push([x0 + (x1 - x0) * tt, y0 + (y1 - y0) * tt]); } }
      function quad(x0, y0, xc, yc, x1, y1, c) { for (var k = 0; k < c; k++) { var tt = k / c, u = 1 - tt; out.push([u * u * x0 + 2 * u * tt * xc + tt * tt * x1, u * u * y0 + 2 * u * tt * yc + tt * tt * y1]); } }
      seg(28, 24, 72, 24, 12); quad(72, 24, 96, 24, 96, 50, 10); quad(96, 50, 96, 76, 72, 76, 10);
      seg(72, 76, 28, 76, 12); quad(28, 76, 4, 76, 4, 50, 10); quad(4, 50, 4, 24, 28, 24, 10);
      return out;
    }
    var N = 120;
    function toAngular(pts) {
      var arr = pts.map(function (p) { var a = Math.atan2(p[1] - cy, p[0] - cx); if (a < 0) a += TAU; return [a, Math.hypot(p[0] - cx, p[1] - cy)]; });
      arr.sort(function (u, v) { return u[0] - v[0]; });
      var m = arr.length, d = '', j = 0;
      for (var i = 0; i < N; i++) {
        var a = i / N * TAU;
        while (j < m - 1 && arr[j + 1][0] <= a) j++;
        var a0, r0, a1, r1;
        if (a < arr[0][0]) { a0 = arr[m - 1][0] - TAU; r0 = arr[m - 1][1]; a1 = arr[0][0]; r1 = arr[0][1]; }
        else if (j >= m - 1) { a0 = arr[m - 1][0]; r0 = arr[m - 1][1]; a1 = arr[0][0] + TAU; r1 = arr[0][1]; }
        else { a0 = arr[j][0]; r0 = arr[j][1]; a1 = arr[j + 1][0]; r1 = arr[j + 1][1]; }
        var r = r0 + (r1 - r0) * (a1 === a0 ? 0 : (a - a0) / (a1 - a0));
        d += (i === 0 ? 'M' : 'L') + (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2);
      }
      return d + 'Z';
    }
    return [
      { name: 'circle', d: toAngular(blobPts(2, 0, 0)) },
      { name: 'sunny', d: toAngular(blobPts(8, 0.085, 0)) },
      { name: 'cookie6', d: toAngular(blobPts(6, 0.105, 0)) },
      { name: 'cookie12', d: toAngular(blobPts(12, 0.055, 0)) },
      { name: 'clover4', d: toAngular(blobPts(4, 0.165, 0)) },
      { name: 'clover8', d: toAngular(blobPts(8, 0.12, 0)) },
      { name: 'flower', d: toAngular(blobPts(5, 0.14, -Math.PI / 2)) },
      { name: 'softburst', d: toAngular(blobPts(10, 0.15, 0)) },
      { name: 'pentagon', d: toAngular(polyPts(5, 0.55, 0)) },
      { name: 'hexagon', d: toAngular(polyPts(6, 0.5, 0)) },
      { name: 'triangle', d: toAngular(polyPts(3, 0.62, 0)) },
      { name: 'gem', d: toAngular(polyPts(4, 0.42, Math.PI / 4)) },
      { name: 'pill', d: toAngular(pillPts()) },
      { name: 'squircle', d: toAngular(polyPts(4, 0.95, 0)) }
    ];
  }

  var shapesDrift = true;
  var shapes = null, shapeLib = null, palette = null, playgroundEl = null, activeDrag = null;

  // Apply a shape path. Set the `d` ATTRIBUTE (works in every browser, incl. iOS
  // WebKit) and also the CSS `d` property (Blink-only) so desktop keeps its smooth
  // tween via `transition: d`. On WebKit the CSS line is ignored and the attribute
  // morphs the shape instantly.
  function applyShape(path, d) {
    if (!path) return;
    path.setAttribute('d', d);
    try { path.style.d = 'path("' + d + '")'; } catch (_) {}
  }

  function morphShape(s) {
    s.shapeIdx = (s.shapeIdx + 1) % shapeLib.length;
    s.colorIdx = (s.colorIdx + 1) % palette.length;
    if (s.path) {
      applyShape(s.path, shapeLib[s.shapeIdx].d);
      s.path.style.fill = palette[s.colorIdx];
    }
    s.pop = 1.12; s.vpop = 0;
  }

  function initShapes(cont) {
    if (!cont) return;
    playgroundEl = cont;
    palette = ['#e8552d', '#ffd23f', '#3d9be9', '#13c296', '#d6356a'];
    shapeLib = buildShapeLib();
    var order = ['sunny', 'clover4', 'pentagon', 'flower', 'gem', 'cookie12', 'pill', 'hexagon'];
    function findIdx(n) { var k = shapeLib.findIndex(function (s) { return s.name === n; }); return k < 0 ? 0 : k; }
    var els = Array.prototype.slice.call(cont.querySelectorAll('[data-color]'));
    shapes = els.map(function (el, i) {
      var startC = palette.indexOf(el.getAttribute('data-color'));
      var path = el.querySelector('path');
      var s = {
        el: el, path: path, mode: 'float', dragId: null,
        k: 0.045 + (i % 4) * 0.008, d: 0.88,
        bob: 7 + (i % 4) * 3, bobSpeed: 0.5 + (i % 5) * 0.09, phase: i * 1.3,
        ox: 0, oy: 0, vx: 0, vy: 0, hx: 0, hy: 0, pop: 1, vpop: 0,
        shapeIdx: findIdx(order[i % order.length]),
        colorIdx: startC >= 0 ? startC : (i % palette.length)
      };
      applyShape(path, shapeLib[s.shapeIdx].d);
      el.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        activeDrag = s; s.mode = 'drag'; s.dragId = e.pointerId;
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        s.startX = e.clientX; s.startY = e.clientY; s.px = e.clientX; s.py = e.clientY;
        s.grabOX = s.ox; s.grabOY = s.oy; s.vx = 0; s.vy = 0; s.moved = false;
        el.style.cursor = 'grabbing'; el.style.zIndex = '6';
      });
      return s;
    });

    window.addEventListener('pointermove', function (e) {
      var s = activeDrag; if (!s || s.mode !== 'drag' || e.pointerId !== s.dragId) return;
      var dx = e.clientX - s.startX, dy = e.clientY - s.startY;
      s.vx = e.clientX - s.px; s.vy = e.clientY - s.py; s.px = e.clientX; s.py = e.clientY;
      s.ox = s.grabOX + dx; s.oy = s.grabOY + dy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) s.moved = true;
    }, { passive: false });

    function onUp(e) {
      var s = activeDrag; if (!s || e.pointerId !== s.dragId) return;
      try { s.el.releasePointerCapture(e.pointerId); } catch (_) {}
      s.el.style.cursor = 'grab'; s.el.style.zIndex = '';
      activeDrag = null; s.dragId = null;
      if (s.moved) {
        var cap = 36;
        s.vx = Math.max(-cap, Math.min(cap, s.vx));
        s.vy = Math.max(-cap, Math.min(cap, s.vy));
        s.mode = 'fly';
      } else {
        s.mode = 'float'; morphShape(s);
      }
    }
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function stepShapes(t) {
    if (!shapes) return;
    var cont = playgroundEl;
    var W = cont ? cont.clientWidth : 0, H = cont ? cont.clientHeight : 0;
    var tt = t / 1000;
    for (var i = 0; i < shapes.length; i++) {
      var s = shapes[i];
      if (s.mode === 'fly') {
        s.ox += s.vx; s.oy += s.vy;
        s.vx *= 0.96; s.vy *= 0.96;
        var hw = s.el.offsetWidth / 2, hh = s.el.offsetHeight / 2;
        var cx0 = s.el.offsetLeft + hw, cy0 = s.el.offsetTop + hh;
        var pad = 2, cx = cx0 + s.ox, cy = cy0 + s.oy;
        if (cx < hw + pad) { s.ox = (hw + pad) - cx0; s.vx = Math.abs(s.vx) * 0.7; }
        else if (W && cx > W - hw - pad) { s.ox = (W - hw - pad) - cx0; s.vx = -Math.abs(s.vx) * 0.7; }
        if (cy < hh + pad) { s.oy = (hh + pad) - cy0; s.vy = Math.abs(s.vy) * 0.7; }
        else if (H && cy > H - hh - pad) { s.oy = (H - hh - pad) - cy0; s.vy = -Math.abs(s.vy) * 0.7; }
        if (Math.hypot(s.vx, s.vy) < 0.7) {
          var bx = Math.sin(tt * s.bobSpeed + s.phase) * s.bob + Math.sin(tt * s.bobSpeed * 0.41 + s.phase * 1.7) * s.bob * 0.55;
          var by = Math.cos(tt * s.bobSpeed * 0.9 + s.phase) * s.bob + Math.cos(tt * s.bobSpeed * 0.37 + s.phase * 1.3) * s.bob * 0.55;
          s.hx = s.ox - bx; s.hy = s.oy - by; s.mode = 'float'; s.vx *= 0.5; s.vy *= 0.5;
        }
      } else if (s.mode !== 'drag') {
        var tx = s.hx, ty = s.hy;
        if (shapesDrift) {
          tx += Math.sin(tt * s.bobSpeed + s.phase) * s.bob + Math.sin(tt * s.bobSpeed * 0.41 + s.phase * 1.7) * s.bob * 0.55;
          ty += Math.cos(tt * s.bobSpeed * 0.9 + s.phase) * s.bob + Math.cos(tt * s.bobSpeed * 0.37 + s.phase * 1.3) * s.bob * 0.55;
        }
        s.vx += (tx - s.ox) * s.k; s.vx *= s.d; s.ox += s.vx;
        s.vy += (ty - s.oy) * s.k; s.vy *= s.d; s.oy += s.vy;
      }
      var popTarget = (s.mode === 'drag') ? 1.08 : 1;
      s.vpop += (popTarget - s.pop) * 0.09; s.vpop *= 0.8; s.pop += s.vpop;
      s.el.style.transform = 'translate3d(' + s.ox.toFixed(1) + 'px,' + s.oy.toFixed(1) + 'px,0) scale(' + s.pop.toFixed(3) + ')';
    }
  }

  // ---------- type toy: slowly-morphing blob clip-path ----------
  var toyClipEl = null;
  function stepToyBlob(t) {
    var clip = toyClipEl || document.getElementById('toy-clip-path');
    if (!clip) return;
    toyClipEl = clip;
    var tt = t / 1000;
    var N = 72, TAU = Math.PI * 2, d = '';
    for (var i = 0; i < N; i++) {
      var a = i / N * TAU;
      var r = 0.455 * (1
        + 0.042 * Math.cos(5 * a - tt * 0.19 + 0.8)
        + 0.030 * Math.cos(3 * a + tt * 0.14 + 2.4)
        + 0.018 * Math.cos(8 * a - tt * 0.24 + 4.2));
      var x = 0.5 + r * Math.cos(a), y = 0.5 + r * Math.sin(a);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(4) + ' ' + y.toFixed(4);
    }
    d += 'Z';
    clip.setAttribute('d', d);
  }

  // ---------- About page: morphing blob frame around the headshot ----------
  // Drives both the clip-path (objectBoundingBox units) and the visible
  // stroke outline (100x125 viewBox) with the same outline.
  var aboutClipEl = null, aboutStrokeEl = null, aboutBlobChecked = false;
  function stepAboutBlob(t) {
    if (!aboutBlobChecked) {
      aboutClipEl = document.getElementById('about-blob-clip-path');
      aboutStrokeEl = document.getElementById('about-blob-stroke');
      aboutBlobChecked = true;
    }
    if (!aboutClipEl && !aboutStrokeEl) return;
    var tt = t / 1000;
    var N = 84, TAU = Math.PI * 2, dc = '', ds = '';
    for (var i = 0; i < N; i++) {
      var a = i / N * TAU;
      var r = 0.44 * (1
        + 0.048 * Math.cos(6 * a + tt * 0.21)
        + 0.036 * Math.cos(4 * a - tt * 0.16 + 1.7)
        + 0.020 * Math.cos(9 * a + tt * 0.27 + 3.1));
      var x = 0.5 + r * Math.cos(a), y = 0.5 + r * Math.sin(a);
      var cmd = i === 0 ? 'M' : 'L';
      dc += cmd + x.toFixed(4) + ' ' + y.toFixed(4);
      ds += cmd + (x * 100).toFixed(2) + ' ' + (y * 125).toFixed(2);
    }
    dc += 'Z'; ds += 'Z';
    if (aboutClipEl) aboutClipEl.setAttribute('d', dc);
    if (aboutStrokeEl) aboutStrokeEl.setAttribute('d', ds);
  }

  // ---------- type toy: cursor-warp word cycle ----------
  function initSpecimen() {
    var tile = document.getElementById('toy');
    if (!tile) return;
    var wordEl = document.getElementById('toy-word');
    if (!wordEl) return;
    var words = ['study', 'sketch', 'build', 'test', 'ship'];
    var BASE = "'opsz' 40, 'wght' 420";
    var SPRING = 'cubic-bezier(0.2, 0.9, 0.3, 1.2)';
    var wi = 0, hovered = false, animating = false;

    function renderWord(w) {
      wordEl.textContent = '';
      for (var i = 0; i < w.length; i++) {
        var sp = document.createElement('span');
        sp.textContent = w[i];
        sp.style.display = 'inline-block';
        sp.style.fontVariationSettings = BASE;
        if (!reduced) sp.style.transition = 'font-variation-settings 120ms ease';
        wordEl.appendChild(sp);
      }
    }
    renderWord(words[0]);

    function relax() {
      Array.prototype.forEach.call(wordEl.children, function (sp) { sp.style.fontVariationSettings = BASE; });
    }
    function warp(e) {
      if (reduced) return;
      Array.prototype.forEach.call(wordEl.children, function (sp) {
        var r = sp.getBoundingClientRect();
        var d = Math.abs(e.clientX - (r.left + r.width / 2));
        var f = 1 - d / 150; if (f < 0) f = 0; if (f > 1) f = 1;
        var wght = 300 + f * f * 500;
        var opsz = 20 + f * 76;
        sp.style.fontVariationSettings = "'opsz' " + opsz.toFixed(1) + ", 'wght' " + wght.toFixed(0);
      });
    }

    function swap() { wi = (wi + 1) % words.length; renderWord(words[wi]); }
    function cycle() {
      if (reduced) { swap(); return; }
      if (animating) return;
      animating = true;
      wordEl.style.transition = 'opacity 280ms ' + SPRING + ', transform 280ms ' + SPRING;
      wordEl.style.opacity = '0';
      wordEl.style.transform = 'translateY(-10px)';
      setTimeout(function () {
        swap();
        wordEl.style.transition = 'none';
        wordEl.style.transform = 'translateY(10px)';
        void wordEl.offsetHeight;
        wordEl.style.transition = 'opacity 280ms ' + SPRING + ', transform 280ms ' + SPRING;
        wordEl.style.opacity = '1';
        wordEl.style.transform = 'translateY(0)';
        setTimeout(function () { animating = false; }, 300);
      }, 290);
    }

    tile.addEventListener('pointermove', warp);
    tile.addEventListener('pointerenter', function () { hovered = true; });
    tile.addEventListener('pointerleave', function () { hovered = false; relax(); });
    tile.addEventListener('click', cycle);
    tile.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(); } });
    if (!reduced) {
      setInterval(function () { if (!hovered && !document.hidden) cycle(); }, 2800);
    }
  }

  // ---------- honor a #work hash on load (nav "Work" link from other pages) ----------
  function handleHashScroll() {
    try {
      var hash = window.location.hash;
      if (hash && hash.length > 1) {
        var target = document.getElementById(decodeURIComponent(hash.slice(1)));
        if (target) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              var top = target.getBoundingClientRect().top + window.pageYOffset - 24;
              window.scrollTo({ top: top, behavior: 'auto' });
            });
          });
        }
      }
    } catch (e) {}
  }

  // ---------- theme toggle (M3-expressive switch) ----------
  // The pre-paint script in each page's <head> has already set data-theme on <html>;
  // this builds the switch, mounts it next to the nav links, and drives the flip.
  function initThemeToggle() {
    var mount = document.querySelector('.nav-links');
    if (!mount) {
      var navlink = document.querySelector('.hov-navlink');
      if (navlink) mount = navlink.parentElement;
    }
    if (!mount || mount.querySelector('.theme-toggle')) return;

    var btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.type = 'button';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-label', 'Dark mode');
    btn.innerHTML =
      '<span class="theme-toggle-thumb" aria-hidden="true">' +
        '<svg class="tt-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="4.6" fill="currentColor" stroke="none"></circle><path d="M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.3 5.3 L7 7 M17 17 L18.7 18.7 M18.7 5.3 L17 7 M7 17 L5.3 18.7"></path></svg>' +
        '<svg class="tt-moon" viewBox="0 0 24 24" fill="currentColor"><path d="M20.4 14.2 A8.8 8.8 0 1 1 9.8 3.6 A7.2 7.2 0 0 0 20.4 14.2 Z"></path></svg>' +
      '</span>';

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && !meta.getAttribute('data-light')) meta.setAttribute('data-light', meta.getAttribute('content') || '#faf3e6');

    function isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }
    function sync() {
      btn.setAttribute('aria-checked', isDark() ? 'true' : 'false');
      if (meta) meta.setAttribute('content', isDark() ? '#161310' : meta.getAttribute('data-light'));
    }

    btn.addEventListener('click', function () {
      var root = document.documentElement;
      var next = isDark() ? 'light' : 'dark';
      function apply() {
        root.setAttribute('data-theme', next);
        try { localStorage.setItem('theme', next); } catch (_) {}
        sync();
        window.dispatchEvent(new CustomEvent('themechange'));
      }
      btn.classList.add('is-switching');
      setTimeout(function () { btn.classList.remove('is-switching'); }, 520);

      // M3-expressive ripple: the new theme reveals in a circle expanding from the
      // toggle thumb (View Transitions API). The circle is animated with CSS
      // keyframes parameterized by custom properties on <html> - WebKit doesn't
      // support targeting view-transition pseudos via WAAPI's pseudoElement option,
      // but every engine with view transitions runs CSS animations on them, and the
      // pseudo tree inherits custom properties from the root. The new-state snapshot
      // is live, so the thumb's own slide/squash plays inside the growing circle.
      // Falls back to the brief property cross-fade where VT is unsupported.
      if (!reduced && typeof document.startViewTransition === 'function') {
        var r = btn.getBoundingClientRect();
        var x = r.left + r.width / 2, y = r.top + r.height / 2;
        var endR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
        root.style.setProperty('--ripple-x', x + 'px');
        root.style.setProperty('--ripple-y', y + 'px');
        root.style.setProperty('--ripple-r', endR + 'px');
        root.classList.add('theme-ripple');
        var vt = document.startViewTransition(apply);
        var done = function () { root.classList.remove('theme-ripple'); };
        vt.finished.then(done, done);
      } else {
        root.classList.add('theme-anim');
        apply();
        setTimeout(function () { root.classList.remove('theme-anim'); }, 520);
      }
    });

    sync();
    mount.appendChild(btn);
  }

  // ---------- footer credit: real 3D coffee cup ----------
  // Upgrades the flat SVG mug into a CSS 3D cylinder (faceted wall + coffee disc +
  // orbiting handle) inside a preserve-3d scene, so on hover it lifts off the saucer
  // and spins with genuine depth. Transforms live on plain HTML elements (iOS-reliable).
  // Left as the flat SVG when 3D isn't supported or reduced-motion is on.
  function initFooterCup() {
    if (reduced || !(window.CSS && CSS.supports && CSS.supports('transform-style', 'preserve-3d'))) return;
    Array.prototype.forEach.call(document.querySelectorAll('.emoji-coffee .ce-mug'), function (flat) {
      var scene = document.createElement('span');
      scene.className = 'cup3d-scene';
      var u = parseFloat(getComputedStyle(scene).getPropertyValue('--u')) || 9;
      var cup = document.createElement('span'); cup.className = 'cup3d';
      var body = document.createElement('span'); body.className = 'cup3d-body';
      cup.appendChild(body); scene.appendChild(cup);
      var N = 22, r = 1.02 * u, faceW = (2 * Math.PI * r / N) + 1.1;
      var base = [233, 220, 192];
      for (var i = 0; i < N; i++) {
        var a = i * 360 / N;
        var f = document.createElement('span'); f.className = 'cup3d-face';
        f.style.width = faceW.toFixed(2) + 'px';
        f.style.marginLeft = (-faceW / 2).toFixed(2) + 'px';
        f.style.transform = 'rotateY(' + a + 'deg) translateZ(' + r.toFixed(2) + 'px)';
        var lit = 0.58 + 0.42 * Math.cos(a * Math.PI / 180);
        f.style.background = 'rgb(' + base.map(function (c) { return Math.round(c * lit); }).join(',') + ')';
        body.appendChild(f);
      }
      function disc(cls, d, extra) {
        var el = document.createElement('span'); el.className = cls;
        el.style.width = d.toFixed(2) + 'px'; el.style.height = d.toFixed(2) + 'px';
        el.style.transform = 'translate(-50%,-50%) rotateX(90deg) translateZ(' + extra.toFixed(2) + 'px)';
        body.appendChild(el); return el;
      }
      disc('cup3d-lip', 2.06 * u, 1.16 * u);      // cream rim
      disc('cup3d-coffee', 1.74 * u, 1.18 * u);   // coffee surface, just inside the rim
      var handle = document.createElement('span'); handle.className = 'cup3d-handle';
      handle.style.width = (1.02 * u).toFixed(2) + 'px'; handle.style.height = (1.32 * u).toFixed(2) + 'px';
      handle.style.borderWidth = (0.22 * u).toFixed(2) + 'px';
      handle.style.transform = 'translate(-50%,-50%) translateX(' + (1.2 * u).toFixed(2) + 'px) rotate(-46deg)';
      body.appendChild(handle);
      flat.replaceWith(scene);
    });
  }

  // ---------- boot ----------
  function init() {
    // Any element with data-warp="baseWght,baseWdth,baseOpsz,nearWght,nearWdth,nearOpsz"
    // gets the cursor-proximity letter warp on its [data-l] spans.
    var warpSets = [];
    Array.prototype.forEach.call(document.querySelectorAll('[data-warp]'), function (el) {
      var p = (el.getAttribute('data-warp') || '').split(',').map(Number);
      var cfg = (p.length === 6 && p.every(function (n) { return !isNaN(n); }))
        ? { bW: p[0], bWd: p[1], bO: p[2], nW: p[3], nWd: p[4], nO: p[5] }
        : { bW: 480, bWd: 90, bO: 50, nW: 820, nWd: 100, nO: 82 };
      var items = initHeadline(el, cfg);
      if (items) warpSets.push(items);
    });

    initThemeToggle();
    initFooterCup();
    initShapes(document.getElementById('playground'));
    initSpecimen();
    initReveals();
    handleHashScroll();

    if (reduced) {
      warpSets.forEach(function (items) {
        items.forEach(function (it) { it.w = 700; it.wd = 100; it.o = 66; applyVar(it); });
      });
      stepToyBlob(0);
      stepAboutBlob(0);
      return;
    }

    var warned = false;
    function tick(t) {
      try {
        for (var i = 0; i < warpSets.length; i++) stepHeadline(warpSets[i], t);
        stepShapes(t);
        stepToyBlob(t);
        stepAboutBlob(t);
      } catch (e) {
        if (!warned) { warned = true; console.warn('motion loop error', e); }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
