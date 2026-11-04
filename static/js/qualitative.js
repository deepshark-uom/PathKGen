/*
 * Qualitative results: WSI | interactive knowledge graph | generated report.
 *
 * - The full curated graph (static/graph/relations.csv) is laid out once with a small
 *   force simulation and drawn on a <canvas>; nodes can be dragged, the view can be
 *   panned and zoomed.
 * - The extracted subgraph of the selected example is highlighted (blue = predicted
 *   histology, green = present, red = not present) and linked to the report text.
 * - Data is loaded lazily, when the section approaches the viewport.
 */
(function () {
  'use strict';
  var root = document.getElementById('qx');
  if (!root) return;

  var $ = function (sel) { return root.querySelector(sel); };
  var els = {
    tabs: $('.qx-tabs'), canvas: $('.qx-stage canvas'), status: $('.qx-status'),
    img: $('.qx-wsi img'), site: $('.qx-site'), report: $('.qx-report')
  };
  var ctx = els.canvas.getContext('2d');

  var COLORS = {
    edge: '#dfe2e9', edgeHover: '#9aa1b5', nodeClass: '#b4b9c7', node: '#cdd1db',
    green: '#12a66a', greenInk: '#0e9a60', red: '#e5484d', redInk: '#dc3b40',
    blue: '#3b5bdb', halo: '#ffffff', label: '#3b4252'
  };


  var examples = [], nodes = [], edges = [], byId = new Map(), adj = new Map();
  var current = null;                       // selected example state
  var hoverId = null, dragNode = null, panning = null, wheelArmed = false;
  var view = { x: 0, y: 0, k: 1 }, flight = null;
  var W = 0, H = 0, dpr = 1;
  var alpha = 0, running = false;

  /* ------------------------------------------------------------ data loading */

  function parseCSV(text) {
    var out = [];                           // columns: reference_entity, related_entity, relation_name
    text.trim().split(/\r?\n/).slice(1).forEach(function (line) {
      var f = line.split(',');
      if (f.length >= 3) out.push({ a: f[0].trim(), b: f[1].trim(), rel: f[2].trim() });
    });
    return out;
  }

  function buildGraph(rows) {
    rows.forEach(function (r) {
      [r.a, r.b].forEach(function (id) {
        if (!byId.has(id)) {
          var n = { id: id, x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null, deg: 0, isClass: false };
          byId.set(id, n); nodes.push(n); adj.set(id, []);
        }
      });
      var s = byId.get(r.a), t = byId.get(r.b);
      s.isClass = true; s.deg++; t.deg++;
      edges.push({ s: s, t: t, rel: r.rel });
      adj.get(r.a).push(r.b); adj.get(r.b).push(r.a);
    });
  }

  /* ------------------------------------------------------- force simulation */

  function rng(seed) {                      // deterministic initial layout
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var LINK_DIST = 40, CHARGE = -120, DECAY = 0.4, ALPHA_DECAY = 0.0228;

  function tick() {
    var i, j, e, a, b, dx, dy, d2, d, f, n = nodes.length;
    alpha += (0 - alpha) * ALPHA_DECAY;
    for (i = 0; i < edges.length; i++) {                    // springs
      e = edges[i]; a = e.s; b = e.t;
      dx = b.x + b.vx - a.x - a.vx; dy = b.y + b.vy - a.y - a.vy;
      d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      f = (d - LINK_DIST) / d * alpha / Math.min(a.deg, b.deg);
      dx *= f; dy *= f;
      var bias = a.deg / (a.deg + b.deg);
      b.vx -= dx * bias; b.vy -= dy * bias; a.vx += dx * (1 - bias); a.vy += dy * (1 - bias);
    }
    for (i = 0; i < n; i++) {                               // repulsion
      a = nodes[i];
      for (j = i + 1; j < n; j++) {
        b = nodes[j]; dx = b.x - a.x; dy = b.y - a.y;
        d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (Math.random() - .5) * 1e-2; dy = (Math.random() - .5) * 1e-2; d2 = dx * dx + dy * dy + 1; }
        if (d2 > 90000) continue;
        f = CHARGE * alpha / d2;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
    }
    for (i = 0; i < n; i++) {                               // gravity + integration
      a = nodes[i];
      a.vx -= a.x * 0.012 * alpha; a.vy -= a.y * 0.012 * alpha;
      if (a.fx !== null) { a.x = a.fx; a.vx = 0; } else { a.vx *= 1 - DECAY; a.x += a.vx; }
      if (a.fy !== null) { a.y = a.fy; a.vy = 0; } else { a.vy *= 1 - DECAY; a.y += a.vy; }
    }
  }

  function layout() {
    var r = rng(7);
    nodes.forEach(function (n) {
      var ang = r() * Math.PI * 2, rad = 40 + r() * 160;
      n.x = Math.cos(ang) * rad; n.y = Math.sin(ang) * rad;
    });
    alpha = 1;
    while (alpha > 0.002) tick();
    nodes.forEach(function (n) { n.x0 = n.x; n.y0 = n.y; });
    alpha = 0;
  }

  /* ------------------------------------------------------------------ camera */

  function toScreen(x, y) { return [(x - view.x) * view.k + W / 2, (y - view.y) * view.k + H / 2]; }
  function toWorld(sx, sy) { return [(sx - W / 2) / view.k + view.x, (sy - H / 2) / view.k + view.y]; }

  function boundsOf(list) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    list.forEach(function (n) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); });
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  function fitTo(list, padX, padY) {
    var b = boundsOf(list), bw = Math.max(b.x1 - b.x0, 60), bh = Math.max(b.y1 - b.y0, 60);
    var k = Math.min((W - padX * 2) / bw, (H - padY * 2) / bh, 3.2);
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, k: Math.max(k, 0.25) };
  }

  function flyTo(target, instant) {
    if (instant || !W) { view = target; flight = null; requestDraw(); return; }
    flight = { from: { x: view.x, y: view.y, k: view.k }, to: target, t0: performance.now(), dur: 650 };
    requestDraw();
  }

  function stepFlight(now) {
    if (!flight) return;
    var p = Math.min(1, (now - flight.t0) / flight.dur), e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    var f = flight.from, t = flight.to, lk = Math.log(f.k) + (Math.log(t.k) - Math.log(f.k)) * e;
    view = { x: f.x + (t.x - f.x) * e, y: f.y + (t.y - f.y) * e, k: Math.exp(lk) };
    if (p >= 1) flight = null;
  }

  function zoomAt(sx, sy, factor) {
    flight = null;
    var w = toWorld(sx, sy), k = Math.min(6, Math.max(0.2, view.k * factor));
    view.k = k; view.x = w[0] - (sx - W / 2) / k; view.y = w[1] - (sy - H / 2) / k;
    requestDraw();
  }

  /* ---------------------------------------------------------------- drawing */

  function requestDraw() {
    if (running) return;
    running = true; requestAnimationFrame(frame);
  }

  function frame(now) {
    var active = alpha > 0.003;
    if (active) tick();
    stepFlight(now);
    draw();
    if (active || flight) requestAnimationFrame(frame); else running = false;
  }

  function dotRadius(n) { return n.isClass ? 4.6 : 3.6; }

  /* push overlapping labels apart and keep them inside the canvas */
  function placeLabels(bx) {
    var it, i, j, a, b, ox, oy, LH = 15;
    for (it = 0; it < 24; it++) {
      for (i = 0; i < bx.length; i++) for (j = i + 1; j < bx.length; j++) {
        a = bx[i]; b = bx[j];
        ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + 4;
        oy = LH + 3 - Math.abs(a.y - b.y);                 // labels are LH px tall, anchored at their baseline
        if (ox > 0 && oy > 0) {
          var d = oy / 2 + .5; if (a.y <= b.y) { a.y -= d; b.y += d; } else { a.y += d; b.y -= d; }
        }
      }
      for (i = 0; i < bx.length; i++) {
        a = bx[i]; a.x = Math.max(4, Math.min(W - a.w - 4, a.x)); a.y = Math.max(14, Math.min(H - 8, a.y));
      }
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!nodes.length) return;
    var i, e, n, s, t, p, q, cx = W / 2, cy = H / 2, k = view.k, vx = view.x, vy = view.y;
    var grow = Math.min(1.7, Math.max(0.85, Math.pow(k, 0.28)));

    // 1. full graph, grey
    ctx.lineWidth = 1; ctx.strokeStyle = COLORS.edge; ctx.beginPath();
    for (i = 0; i < edges.length; i++) {
      e = edges[i]; s = e.s; t = e.t;
      ctx.moveTo((s.x - vx) * k + cx, (s.y - vy) * k + cy); ctx.lineTo((t.x - vx) * k + cx, (t.y - vy) * k + cy);
    }
    ctx.stroke();

    // 2. hovered node: emphasise its edges
    var hov = hoverId && byId.get(hoverId);
    if (hov) {
      ctx.strokeStyle = COLORS.edgeHover; ctx.lineWidth = 1.6; ctx.beginPath();
      edges.forEach(function (ed) {
        if (ed.s === hov || ed.t === hov) {
          ctx.moveTo((ed.s.x - vx) * k + cx, (ed.s.y - vy) * k + cy); ctx.lineTo((ed.t.x - vx) * k + cx, (ed.t.y - vy) * k + cy);
        }
      });
      ctx.stroke();
    }

    // 3. extracted subgraph edges
    if (current) {
      current.edges.forEach(function (ed) {
        s = ed.s; t = ed.t;
        ctx.beginPath(); ctx.lineWidth = 2.6 * Math.min(1.4, grow);
        ctx.strokeStyle = ed.status === 'present' ? COLORS.green : COLORS.red;
        ctx.setLineDash(ed.status === 'present' ? [] : [7, 5]);
        ctx.moveTo((s.x - vx) * k + cx, (s.y - vy) * k + cy); ctx.lineTo((t.x - vx) * k + cx, (t.y - vy) * k + cy);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // 4. grey nodes
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i]; if (current && current.status.has(n.id)) continue;
      p = (n.x - vx) * k + cx; q = (n.y - vy) * k + cy;
      if (p < -10 || q < -10 || p > W + 10 || q > H + 10) continue;
      ctx.fillStyle = n.isClass ? COLORS.nodeClass : COLORS.node;
      ctx.beginPath(); ctx.arc(p, q, dotRadius(n) * grow, 0, 6.2832); ctx.fill();
    }

    // 5. highlighted nodes + labels
    if (current) {
      var labels = [];
      current.list.forEach(function (it) {
        n = it.node; p = (n.x - vx) * k + cx; q = (n.y - vy) * k + cy;
        var r = (it.status === 'center' ? 9 : 6.6) * grow, hot = (hoverId === n.id);
        var col = it.status === 'present' ? COLORS.green : it.status === 'absent' ? COLORS.red : COLORS.blue;
        if (hot) {
          ctx.fillStyle = col; ctx.globalAlpha = .18; ctx.beginPath(); ctx.arc(p, q, r + 9, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
          r += 1.8;
        }
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p, q, r, 0, 6.2832); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
        labels.push([it, p, q, r]);
      });
      var cs = toScreen(current.center.node.x, current.center.node.y);
      ctx.font = '700 12.5px Inter, system-ui, sans-serif'; ctx.lineJoin = 'round'; ctx.textAlign = 'left';
      var boxes = labels.map(function (L) {
        var it = L[0], px = L[1], py = L[2], r = L[3], w = ctx.measureText(it.label).width, dx, dy, x;
        if (it.status === 'center') { dx = 0; dy = r + 15; x = px - w / 2; }
        else {
          var ang = Math.atan2(py - cs[1], px - cs[0]), ca = Math.cos(ang), sa = Math.sin(ang);
          dx = ca * (r + 6); dy = sa * (r + 6) + (sa > .45 ? 11 : sa < -.45 ? -3 : 4);
          x = ca > .35 ? px + dx : ca < -.35 ? px + dx - w : px + dx - w / 2;
        }
        return { it: it, x: x, y: py + dy, w: w };
      });
      placeLabels(boxes);
      boxes.forEach(function (bx) {
        ctx.strokeStyle = COLORS.halo; ctx.lineWidth = 4; ctx.strokeText(bx.it.label, bx.x, bx.y);
        ctx.fillStyle = bx.it.status === 'present' ? COLORS.greenInk : bx.it.status === 'absent' ? COLORS.redInk : COLORS.blue;
        ctx.fillText(bx.it.label, bx.x, bx.y);
      });
    }

    // 6. hover label for any other node
    if (hov && !(current && current.status.has(hov.id))) {
      p = (hov.x - vx) * k + cx; q = (hov.y - vy) * k + cy;
      ctx.fillStyle = '#6b7184'; ctx.beginPath(); ctx.arc(p, q, dotRadius(hov) * grow + 1.5, 0, 6.2832); ctx.fill();
      ctx.font = '600 12px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      ctx.strokeStyle = COLORS.halo; ctx.lineWidth = 4; ctx.strokeText(hov.id, p, q - 11);
      ctx.fillStyle = COLORS.label; ctx.fillText(hov.id, p, q - 11);
    }
  }

  /* ------------------------------------------------------------ interaction */

  function pick(sx, sy) {
    var best = null, bd = 1e9, k = view.k, w = toWorld(sx, sy), i, n, d;
    for (i = nodes.length - 1; i >= 0; i--) {
      n = nodes[i];
      d = Math.hypot((n.x - w[0]) * k, (n.y - w[1]) * k);
      var tol = (current && current.status.has(n.id) ? 11 : 8);
      if (d < tol && d < bd) { bd = d; best = n; }
    }
    return best;
  }

  function pos(ev) {
    var r = els.canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  function setHover(id) {
    if (hoverId === id) return;
    hoverId = id;
    Array.prototype.forEach.call(els.report.querySelectorAll('[data-n]'), function (s) {
      s.classList.toggle('hot', !!id && s.getAttribute('data-n') === id);
    });
    requestDraw();
  }

  els.canvas.addEventListener('pointerdown', function (ev) {
    var p = pos(ev), n = pick(p[0], p[1]);
    wheelArmed = true; els.canvas.setPointerCapture(ev.pointerId); flight = null;
    if (n) {
      dragNode = n; els.canvas.style.cursor = 'grabbing';
      var w = toWorld(p[0], p[1]); n.fx = w[0]; n.fy = w[1];
      alpha = Math.max(alpha, 0.35); requestDraw();
    } else {
      panning = { sx: p[0], sy: p[1], vx: view.x, vy: view.y }; els.canvas.style.cursor = 'grabbing';
    }
  });

  els.canvas.addEventListener('pointermove', function (ev) {
    var p = pos(ev);
    if (dragNode) {
      var w = toWorld(p[0], p[1]); dragNode.fx = w[0]; dragNode.fy = w[1];
      alpha = Math.max(alpha, 0.2); requestDraw();
    } else if (panning) {
      view.x = panning.vx - (p[0] - panning.sx) / view.k; view.y = panning.vy - (p[1] - panning.sy) / view.k;
      requestDraw();
    } else {
      var n = pick(p[0], p[1]);
      els.canvas.style.cursor = n ? 'grab' : '';
      setHover(n ? n.id : null);
    }
  });

  function endPointer(ev) {
    if (dragNode) { dragNode.fixedByUser = true; dragNode = null; }   // stays where it was dropped
    panning = null; els.canvas.style.cursor = '';
    if (ev && ev.pointerId !== undefined && els.canvas.hasPointerCapture(ev.pointerId)) els.canvas.releasePointerCapture(ev.pointerId);
  }
  els.canvas.addEventListener('pointerup', endPointer);
  els.canvas.addEventListener('pointercancel', endPointer);
  els.canvas.addEventListener('pointerleave', function () { if (!dragNode && !panning) { setHover(null); wheelArmed = false; } });

  els.canvas.addEventListener('wheel', function (ev) {      // scroll-zoom only after the graph was clicked (or with Ctrl/Cmd)
    if (!wheelArmed && !ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    var p = pos(ev); zoomAt(p[0], p[1], Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0016)));
  }, { passive: false });

  els.canvas.addEventListener('dblclick', function (ev) {   // double-click a node to release it
    var p = pos(ev), n = pick(p[0], p[1]);
    if (n && n.fixedByUser) { n.fx = n.fy = null; n.fixedByUser = false; alpha = Math.max(alpha, 0.3); requestDraw(); }
  });

  root.querySelector('.qx-ctl').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'in') zoomAt(W / 2, H / 2, 1.35);
    else if (a === 'out') zoomAt(W / 2, H / 2, 1 / 1.35);
    else if (a === 'focus') flyTo(focusTarget());
    else if (a === 'all') flyTo(fitTo(nodes, 14, 14));
    else if (a === 'reset') {
      nodes.forEach(function (n) { n.x = n.x0; n.y = n.y0; n.vx = n.vy = 0; n.fx = n.fy = null; n.fixedByUser = false; });
      alpha = 0; flyTo(focusTarget());
    }
  });

  /* report <-> graph linking */
  els.report.addEventListener('pointerover', function (ev) {
    var s = ev.target.closest('[data-n]'); if (s) setHover(s.getAttribute('data-n'));
  });
  els.report.addEventListener('pointerout', function (ev) {
    if (ev.target.closest('[data-n]')) setHover(null);
  });

  /* --------------------------------------------------------------- examples */

  function focusTarget() {
    if (!current) return fitTo(nodes, 14, 14);
    return fitTo(current.list.map(function (it) { return it.node; }), Math.min(80, W * 0.2), 50);
  }

  function select(i, instant) {
    var ex = examples[i], st = new Map(), list = [], es = [], c = byId.get(ex.center.id);
    list.push({ node: c, status: 'center', label: ex.center.label }); st.set(c.id, 'center');
    ex.present.concat(ex.absent).forEach(function (f) {
      var n = byId.get(f.id), status = ex.present.indexOf(f) >= 0 ? 'present' : 'absent';
      if (!n) { console.warn('qualitative: unknown node', f.id); return; }
      st.set(n.id, status); list.push({ node: n, status: status, label: f.label });
    });
    edges.forEach(function (e) {                       // graph edges between the predicted class and its features
      var o = e.s === c ? e.t : e.t === c ? e.s : null;
      if (o && st.has(o.id)) es.push({ s: e.s, t: e.t, status: st.get(o.id) });
    });
    current = { ex: ex, status: st, list: list, edges: es, center: list[0] };

    Array.prototype.forEach.call(els.tabs.children, function (b, j) {
      b.setAttribute('aria-selected', j === i ? 'true' : 'false'); b.tabIndex = j === i ? 0 : -1;
    });
    els.img.src = ex.image; els.img.alt = ex.alt; els.site.textContent = ex.site;
    renderReport(ex, st);
    hoverId = null;
    flyTo(focusTarget(), instant);
  }

  function renderReport(ex, st) {
    var frag = document.createDocumentFragment();
    ex.report.forEach(function (seg) {
      if (!seg.n && !seg.dx && !seg.neg) { frag.appendChild(document.createTextNode(seg.t)); return; }
      var s = document.createElement('span'); s.textContent = seg.t;
      if (seg.dx) s.className = 'qx-dx';
      else if (seg.neg) s.className = 'qx-r';
      else { s.className = st.get(seg.n) === 'absent' ? 'qx-r' : 'qx-g'; s.setAttribute('data-n', seg.n); }
      frag.appendChild(s);
    });
    els.report.textContent = ''; els.report.appendChild(frag);
  }

  function buildTabs() {
    examples.forEach(function (ex, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'qx-tab'; b.setAttribute('role', 'tab'); b.textContent = ex.tab;
      b.title = ex.site; b.addEventListener('click', function () { select(i); });
      els.tabs.appendChild(b);
    });
    els.tabs.addEventListener('keydown', function (ev) {
      var d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
      var cur = Array.prototype.findIndex.call(els.tabs.children, function (b) { return b.getAttribute('aria-selected') === 'true'; });
      var nx = (cur + d + examples.length) % examples.length;
      select(nx); els.tabs.children[nx].focus(); ev.preventDefault();
    });
  }

  /* ------------------------------------------------------------ size + boot */

  function resize() {
    var r = els.canvas.getBoundingClientRect();
    if (!r.width) return;
    var keep = W && current ? toWorld(W / 2, H / 2) : null;
    W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
    els.canvas.width = Math.round(W * dpr); els.canvas.height = Math.round(H * dpr);
    if (keep) { view.x = keep[0]; view.y = keep[1]; }
    requestDraw();
  }

  function boot() {
    els.status.textContent = 'Loading graph…';
    Promise.all([
      fetch(root.getAttribute('data-examples')).then(function (r) { return r.json(); }),
      fetch(root.getAttribute('data-graph')).then(function (r) { return r.text(); })
    ]).then(function (res) {
      examples = res[0]; buildGraph(parseCSV(res[1])); layout();
      buildTabs(); resize();
      els.status.hidden = true; root.classList.add('ready');
      select(0, true);
    }).catch(function (err) {
      els.status.textContent = 'Could not load the graph data. Please serve the page over HTTP.';
      console.error(err);
    });
  }

  new ResizeObserver(resize).observe(els.canvas);
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) { io.disconnect(); boot(); }
    }, { rootMargin: '400px' });
    io.observe(root);
  } else boot();
})();
