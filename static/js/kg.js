/*
 * Shared knowledge-graph engine (used by qualitative.js and kg-explorer.js).
 *
 *   KG.load(csvUrl)              -> Promise<graph>  (parsed + laid out once, cached per URL)
 *   KG.View(canvas, graph, hooks) -> interactive canvas view of the graph
 *   KG.placeLabels(boxes, W, H)  -> de-overlaps label boxes {x, y, w}
 *
 * A View owns its own copy of the node positions, so dragging nodes in one view never
 * affects another. Rendering is delegated to hooks.draw(ctx, view); the View handles the
 * force simulation, camera (pan / zoom / fly-to), dragging, hover, click and resizing.
 *
 * hooks: draw(ctx, view) [required], onHover(node|null), onClick(node|null),
 *        onResize(view), hitRadius(node) -> px,
 *        aspect (optional): stretch the layout horizontally by this factor, for wide canvases
 */
(function (root) {
  'use strict';
  var KG = root.KG = {}, cache = {};

  /* ------------------------------------------------------------------ data */

  function parseCSV(text) {                 // columns: reference_entity, related_entity, relation_name
    var out = [];
    text.trim().split(/\r?\n/).slice(1).forEach(function (line) {
      var f = line.split(',');
      if (f.length >= 3) out.push({ a: f[0].trim(), b: f[1].trim(), rel: f[2].trim() });
    });
    return out;
  }

  function rng(seed) {                      // deterministic initial layout
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------ force simulation */

  var GX_EXP = 3, GY_MUL = 2;
  var HOME_K = 0.05, HOME_DAMP = 0.84;                   // spring that returns released nodes to their layout position
  var LINK_DIST = 40, CHARGE = -120, DECAY = 0.4, ALPHA_DECAY = 0.0228;

  function tick(sim) {                      // d3-force style: springs + repulsion + gravity
    var nodes = sim.nodes, edges = sim.edges, n = nodes.length, i, j, e, a, b, dx, dy, d2, d, f;
    sim.alpha += (0 - sim.alpha) * ALPHA_DECAY;
    var alpha = sim.alpha;
    for (i = 0; i < edges.length; i++) {
      e = edges[i]; a = e.s; b = e.t;
      dx = b.x + b.vx - a.x - a.vx; dy = b.y + b.vy - a.y - a.vy;
      d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      f = (d - LINK_DIST) / d * alpha * (sim.linkK || 1) / Math.min(a.deg, b.deg);
      dx *= f; dy *= f;
      var bias = a.deg / (a.deg + b.deg);
      b.vx -= dx * bias; b.vy -= dy * bias; a.vx += dx * (1 - bias); a.vy += dy * (1 - bias);
    }
    for (i = 0; i < n; i++) {
      a = nodes[i];
      for (j = i + 1; j < n; j++) {
        b = nodes[j]; dx = b.x - a.x; dy = b.y - a.y; d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (Math.random() - .5) * 1e-2; dy = (Math.random() - .5) * 1e-2; d2 = dx * dx + dy * dy + 1; }
        if (d2 > 90000) continue;
        f = CHARGE * alpha / d2;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
    }
    for (i = 0; i < n; i++) {
      a = nodes[i];
      a.vx -= a.x * (sim.gx || 0.012) * alpha; a.vy -= a.y * (sim.gy || 0.012) * alpha;
      if (sim.returning && sim.returning.has(a) && a.fx === null) {                       // released: spring back home
        a.vx = (a.vx + (a.x0 - a.x) * HOME_K) * HOME_DAMP; a.vy = (a.vy + (a.y0 - a.y) * HOME_K) * HOME_DAMP;
        a.x += a.vx; a.y += a.vy;
        if (Math.abs(a.x0 - a.x) + Math.abs(a.y0 - a.y) < 0.5 && Math.abs(a.vx) + Math.abs(a.vy) < 0.1) {
          a.x = a.x0; a.y = a.y0; a.vx = a.vy = 0; sim.returning.delete(a);
        }
        continue;
      }
      if (sim.free && !sim.free.has(a) && a.fx === null) { a.vx = a.vy = 0; continue; }   // local relaxation while dragging
      if (a.fx !== null) { a.x = a.fx; a.vx = 0; } else { a.vx *= 1 - DECAY; a.x += a.vx; }
      if (a.fy !== null) { a.y = a.fy; a.vy = 0; } else { a.vy *= 1 - DECAY; a.y += a.vy; }
    }
  }

  function build(rows) {
    var g = { ids: [], idx: new Map(), deg: [], isClass: [], isSite: [], edges: [], rels: [], x0: [], y0: [] };
    rows.forEach(function (r) {
      [r.a, r.b].forEach(function (id) {
        if (!g.idx.has(id)) { g.idx.set(id, g.ids.length); g.ids.push(id); g.deg.push(0); g.isClass.push(false); g.isSite.push(false); }
      });
      var a = g.idx.get(r.a), b = g.idx.get(r.b);
      g.isClass[a] = true; g.deg[a]++; g.deg[b]++;
      if (r.rel === 'found_in') g.isSite[b] = true;
      if (g.rels.indexOf(r.rel) < 0) g.rels.push(r.rel);
      g.edges.push({ a: a, b: b, rel: r.rel });
    });
    var rand = rng(7);
    var nodes = g.ids.map(function (id, i) {
      var ang = rand() * Math.PI * 2, rad = 40 + rand() * 160;
      return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, vx: 0, vy: 0, fx: null, fy: null, deg: g.deg[i] };
    });
    var sim = { nodes: nodes, alpha: 1, edges: g.edges.map(function (e) { return { s: nodes[e.a], t: nodes[e.b] }; }) };
    while (sim.alpha > 0.002) tick(sim);
    nodes.forEach(function (n, i) { g.x0[i] = n.x; g.y0[i] = n.y; });
    return g;
  }

  KG.load = function (url) {
    return cache[url] || (cache[url] = fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return r.text();
    }).then(function (t) { return build(parseCSV(t)); }));
  };

  /* push overlapping labels apart and keep them inside the canvas */
  KG.placeLabels = function (bx, W, H) {
    var it, i, j, a, b, ox, oy, LH = 15;
    for (it = 0; it < 24; it++) {
      for (i = 0; i < bx.length; i++) for (j = i + 1; j < bx.length; j++) {
        a = bx[i]; b = bx[j];
        ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + 4;
        oy = LH + 3 - Math.abs(a.y - b.y);              // labels are LH px tall, anchored at their baseline
        if (ox > 0 && oy > 0) {
          var d = oy / 2 + .5; if (a.y <= b.y) { a.y -= d; b.y += d; } else { a.y += d; b.y -= d; }
        }
      }
      for (i = 0; i < bx.length; i++) {
        a = bx[i]; a.x = Math.max(4, Math.min(W - a.w - 4, a.x)); a.y = Math.max(14, Math.min(H - 8, a.y));
      }
    }
  };

  /* ------------------------------------------------------------------ view */

  KG.View = function (canvas, g, hooks) {
    var ctx = canvas.getContext('2d');
    var v = { canvas: canvas, ctx: ctx, W: 0, H: 0, dpr: 1, cam: { x: 0, y: 0, k: 1 }, hover: null, userMoved: false, grow: 1 };
    var sim, flight = null, running = false, dragNode = null, panning = null, press = null, armed = false;

    /* per-view copy of the graph */
    v.nodes = g.ids.map(function (id, i) {
      return { id: id, i: i, x: g.x0[i], y: g.y0[i], x0: g.x0[i], y0: g.y0[i], vx: 0, vy: 0, fx: null, fy: null,
               deg: g.deg[i], isClass: g.isClass[i], isSite: g.isSite[i], links: [] };
    });
    v.byId = new Map(v.nodes.map(function (n) { return [n.id, n]; }));
    v.edges = g.edges.map(function (e) {
      var s = v.nodes[e.a], t = v.nodes[e.b], ed = { s: s, t: t, rel: e.rel };
      s.links.push({ node: t, edge: ed }); t.links.push({ node: s, edge: ed });
      return ed;
    });
    sim = { nodes: v.nodes, edges: v.edges, alpha: 0, returning: new Set() };

    if (hooks.aspect && Math.abs(hooks.aspect - 1) > 0.05) {      // let the layout settle into a wide (or tall) shape
      var A = hooks.aspect;
      v.nodes.forEach(function (n) { n.x *= A; });
      sim.gx = 0.012 / Math.pow(A, GX_EXP); sim.gy = 0.012 * GY_MUL; sim.alpha = 0.9;
      while (sim.alpha > 0.002) tick(sim);
      v.nodes.forEach(function (n) { n.x0 = n.x; n.y0 = n.y; n.vx = n.vy = 0; });
      sim.alpha = 0;
    }

    /* ---- camera */
    v.toScreen = function (x, y) { return [(x - v.cam.x) * v.cam.k + v.W / 2, (y - v.cam.y) * v.cam.k + v.H / 2]; };
    v.toWorld = function (sx, sy) { return [(sx - v.W / 2) / v.cam.k + v.cam.x, (sy - v.H / 2) / v.cam.k + v.cam.y]; };

    v.fit = function (list, padX, padY) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      list.forEach(function (n) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); });
      var bw = Math.max(x1 - x0, 60), bh = Math.max(y1 - y0, 60);
      var k = Math.min((v.W - padX * 2) / bw, (v.H - padY * 2) / bh, 3.2);
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, k: Math.max(k, 0.25) };
    };

    v.flyTo = function (t, instant) {
      v.userMoved = false;
      if (instant || !v.W) { v.cam.x = t.x; v.cam.y = t.y; v.cam.k = t.k; flight = null; v.requestDraw(); return; }
      flight = { from: { x: v.cam.x, y: v.cam.y, k: v.cam.k }, to: t, t0: performance.now(), dur: 650 };
      v.requestDraw();
    };

    function stepFlight(now) {
      if (!flight) return;
      var p = Math.min(1, (now - flight.t0) / flight.dur), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      var f = flight.from, t = flight.to, lk = Math.log(f.k) + (Math.log(t.k) - Math.log(f.k)) * e;
      v.cam.x = f.x + (t.x - f.x) * e; v.cam.y = f.y + (t.y - f.y) * e; v.cam.k = Math.exp(lk);
      if (p >= 1) flight = null;
    }

    v.zoomAt = function (sx, sy, factor) {
      flight = null; v.userMoved = true;
      var w = v.toWorld(sx, sy), k = Math.min(6, Math.max(0.2, v.cam.k * factor));
      v.cam.k = k; v.cam.x = w[0] - (sx - v.W / 2) / k; v.cam.y = w[1] - (sy - v.H / 2) / k;
      v.requestDraw();
    };

    v.resetLayout = function () {
      v.nodes.forEach(function (n) { n.x = n.x0; n.y = n.y0; n.vx = n.vy = 0; n.fx = n.fy = null; });
      sim.alpha = 0; sim.returning.clear(); v.requestDraw();
    };

    v.setHover = function (node, silent) {
      if (v.hover === node) return;
      v.hover = node;
      if (!silent && hooks.onHover) hooks.onHover(node);
      v.requestDraw();
    };

    /* ---- render loop (runs only while something moves) */
    v.requestDraw = function () { if (!running) { running = true; requestAnimationFrame(frame); } };

    function frame(now) {
      var active = sim.alpha > 0.003 || sim.returning.size > 0;
      if (active) tick(sim);
      stepFlight(now);
      v.grow = Math.min(1.7, Math.max(0.85, Math.pow(v.cam.k, 0.28)));
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      ctx.clearRect(0, 0, v.W, v.H);
      hooks.draw(ctx, v);
      if (!active) sim.free = null;
      if (active || flight) requestAnimationFrame(frame); else running = false;
    }

    /* ---- interaction */
    function pos(ev) { var r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }

    function pick(sx, sy) {
      var best = null, bd = 1e9, k = v.cam.k, w = v.toWorld(sx, sy), i, n, d, tol;
      for (i = v.nodes.length - 1; i >= 0; i--) {
        n = v.nodes[i]; d = Math.hypot((n.x - w[0]) * k, (n.y - w[1]) * k);
        tol = hooks.hitRadius ? hooks.hitRadius(n) : 8;
        if (d < tol && d < bd) { bd = d; best = n; }
      }
      return best;
    }
    v.pick = pick;

    canvas.addEventListener('pointerdown', function (ev) {
      var p = pos(ev);
      armed = true; v.userMoved = true; flight = null; canvas.setPointerCapture(ev.pointerId);
      press = { x: p[0], y: p[1], node: pick(p[0], p[1]), moved: false, cx: v.cam.x, cy: v.cam.y };
    });

    canvas.addEventListener('pointermove', function (ev) {
      var p = pos(ev);
      if (press) {
        if (!press.moved && Math.hypot(p[0] - press.x, p[1] - press.y) > 3) {
          press.moved = true; canvas.style.cursor = 'grabbing';
          if (press.node) {
            dragNode = press.node; sim.alpha = Math.max(sim.alpha, 0.35);
            sim.free = new Set([dragNode]); dragNode.links.forEach(function (l) { sim.free.add(l.node); });
          }
          else panning = true;
        }
        if (dragNode) {
          var w = v.toWorld(p[0], p[1]); dragNode.fx = w[0]; dragNode.fy = w[1];
          sim.alpha = Math.max(sim.alpha, 0.2); v.requestDraw();
        } else if (panning) {
          v.cam.x = press.cx - (p[0] - press.x) / v.cam.k; v.cam.y = press.cy - (p[1] - press.y) / v.cam.k;
          v.requestDraw();
        }
      } else {
        var n = pick(p[0], p[1]);
        canvas.style.cursor = n ? 'pointer' : '';
        v.setHover(n);
      }
    });

    function endPointer(ev) {
      if (press && !press.moved && ev.type === 'pointerup' && hooks.onClick) hooks.onClick(press.node);
      if (dragNode) {                                         // let go: the node and its neighbours spring back
        if (sim.free) sim.free.forEach(function (n) { sim.returning.add(n); });
        dragNode.fx = dragNode.fy = null; sim.alpha = 0;
      }
      dragNode = null; panning = null; press = null; canvas.style.cursor = '';
      if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('pointerleave', function () { if (!press) { v.setHover(null); armed = false; } });

    canvas.addEventListener('wheel', function (ev) {          // scroll-zoom only after a click on the graph (or with Ctrl/Cmd)
      if (!armed && !ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      var p = pos(ev); v.zoomAt(p[0], p[1], Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0016)));
    }, { passive: false });

    /* ---- sizing */
    function resize() {
      var r = canvas.getBoundingClientRect();
      if (!r.width) return;
      var keep = v.W ? v.toWorld(v.W / 2, v.H / 2) : null;
      v.W = r.width; v.H = r.height; v.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(v.W * v.dpr); canvas.height = Math.round(v.H * v.dpr);
      if (keep && v.userMoved) { v.cam.x = keep[0]; v.cam.y = keep[1]; }
      if (hooks.onResize) hooks.onResize(v);
      v.requestDraw();
    }
    new ResizeObserver(resize).observe(canvas);
    resize();

    return v;
  };
})(window);
