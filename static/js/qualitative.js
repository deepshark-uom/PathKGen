/*
 * Qualitative results: WSI | interactive knowledge graph | generated report.
 *
 * Built on the shared graph engine (kg.js). The full curated graph is drawn in grey and the
 * extracted subgraph of the selected example is highlighted (blue = predicted histology,
 * green = present, red = not present) and linked to the report text.
 * Data is loaded lazily, when the section approaches the viewport.
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

  var COLORS = {
    edge: '#dfe2e9', edgeHover: '#9aa1b5', nodeClass: '#b4b9c7', node: '#cdd1db',
    green: '#12a66a', greenInk: '#0e9a60', red: '#e5484d', redInk: '#dc3b40',
    blue: '#3b5bdb', halo: '#ffffff', label: '#3b4252'
  };
  var TAU = Math.PI * 2;

  var examples = [], view = null, current = null;   // current: state of the selected example

  /* ------------------------------------------------------------------ drawing */

  function dotRadius(n) { return n.isClass ? 4.6 : 3.6; }

  function draw(ctx, v) {
    var W = v.W, H = v.H, k = v.cam.k, vx = v.cam.x, vy = v.cam.y, cx = W / 2, cy = H / 2, grow = v.grow;
    var i, e, n, s, t, p, q, hov = v.hover;

    // 1. full graph, grey
    ctx.lineWidth = 1; ctx.strokeStyle = COLORS.edge; ctx.beginPath();
    for (i = 0; i < v.edges.length; i++) {
      e = v.edges[i]; s = e.s; t = e.t;
      ctx.moveTo((s.x - vx) * k + cx, (s.y - vy) * k + cy); ctx.lineTo((t.x - vx) * k + cx, (t.y - vy) * k + cy);
    }
    ctx.stroke();

    // 2. hovered node: emphasise its edges
    if (hov) {
      ctx.strokeStyle = COLORS.edgeHover; ctx.lineWidth = 1.6; ctx.beginPath();
      hov.links.forEach(function (l) {
        ctx.moveTo((hov.x - vx) * k + cx, (hov.y - vy) * k + cy); ctx.lineTo((l.node.x - vx) * k + cx, (l.node.y - vy) * k + cy);
      });
      ctx.stroke();
    }

    if (current) {
      // 3. extracted subgraph edges
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
    for (i = 0; i < v.nodes.length; i++) {
      n = v.nodes[i]; if (current && current.status.has(n.id)) continue;
      p = (n.x - vx) * k + cx; q = (n.y - vy) * k + cy;
      if (p < -10 || q < -10 || p > W + 10 || q > H + 10) continue;
      ctx.fillStyle = n.isClass ? COLORS.nodeClass : COLORS.node;
      ctx.beginPath(); ctx.arc(p, q, dotRadius(n) * grow, 0, TAU); ctx.fill();
    }

    // 5. highlighted nodes + labels
    if (current) {
      var labels = [];
      current.list.forEach(function (it) {
        n = it.node; p = (n.x - vx) * k + cx; q = (n.y - vy) * k + cy;
        var r = (it.status === 'center' ? 9 : 6.6) * grow, hot = (hov === n);
        var col = it.status === 'present' ? COLORS.green : it.status === 'absent' ? COLORS.red : COLORS.blue;
        if (hot) {
          ctx.fillStyle = col; ctx.globalAlpha = .18; ctx.beginPath(); ctx.arc(p, q, r + 9, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
          r += 1.8;
        }
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p, q, r, 0, TAU); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
        labels.push([it, p, q, r]);
      });
      var cs = v.toScreen(current.center.node.x, current.center.node.y);
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
      KG.placeLabels(boxes, W, H);
      boxes.forEach(function (bx) {
        ctx.strokeStyle = COLORS.halo; ctx.lineWidth = 4; ctx.strokeText(bx.it.label, bx.x, bx.y);
        ctx.fillStyle = bx.it.status === 'present' ? COLORS.greenInk : bx.it.status === 'absent' ? COLORS.redInk : COLORS.blue;
        ctx.fillText(bx.it.label, bx.x, bx.y);
      });
    }

    // 6. hover label for any other node
    if (hov && !(current && current.status.has(hov.id))) {
      p = (hov.x - vx) * k + cx; q = (hov.y - vy) * k + cy;
      ctx.fillStyle = '#6b7184'; ctx.beginPath(); ctx.arc(p, q, dotRadius(hov) * grow + 1.5, 0, TAU); ctx.fill();
      ctx.font = '600 12px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      ctx.strokeStyle = COLORS.halo; ctx.lineWidth = 4; ctx.strokeText(hov.id, p, q - 11);
      ctx.fillStyle = COLORS.label; ctx.fillText(hov.id, p, q - 11);
    }
  }

  /* ----------------------------------------------------------------- examples */

  function focusTarget() {
    if (!current) return view.fit(view.nodes, 14, 14);
    return view.fit(current.list.map(function (it) { return it.node; }), Math.min(80, view.W * 0.2), 50);
  }

  function select(i, instant) {
    var ex = examples[i], st = new Map(), list = [], es = [], c = view.byId.get(ex.center.id);
    list.push({ node: c, status: 'center', label: ex.center.label }); st.set(c.id, 'center');
    ex.present.concat(ex.absent).forEach(function (f) {
      var n = view.byId.get(f.id), status = ex.present.indexOf(f) >= 0 ? 'present' : 'absent';
      if (!n) { console.warn('qualitative: unknown node', f.id); return; }
      st.set(n.id, status); list.push({ node: n, status: status, label: f.label });
    });
    c.links.forEach(function (l) {                     // graph edges between the predicted class and its features
      if (st.has(l.node.id)) es.push({ s: l.edge.s, t: l.edge.t, status: st.get(l.node.id) });
    });
    current = { ex: ex, status: st, list: list, edges: es, center: list[0] };

    Array.prototype.forEach.call(els.tabs.children, function (b, j) {
      b.setAttribute('aria-selected', j === i ? 'true' : 'false'); b.tabIndex = j === i ? 0 : -1;
    });
    els.img.src = ex.image; els.img.alt = ex.alt; els.site.textContent = ex.site;
    renderReport(ex, st);
    markSpans(null); view.setHover(null, true);
    view.flyTo(focusTarget(), instant);
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

  function markSpans(id) {                              // highlight the report phrases that refer to a node
    Array.prototype.forEach.call(els.report.querySelectorAll('[data-n]'), function (s) {
      s.classList.toggle('hot', !!id && s.getAttribute('data-n') === id);
    });
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

  function bindControls() {
    $('.qx-ctl').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'in') view.zoomAt(view.W / 2, view.H / 2, 1.35);
      else if (a === 'out') view.zoomAt(view.W / 2, view.H / 2, 1 / 1.35);
      else if (a === 'focus') view.flyTo(focusTarget());
      else if (a === 'all') view.flyTo(view.fit(view.nodes, 14, 14));
      else if (a === 'reset') { view.resetLayout(); view.flyTo(focusTarget()); }
    });
    // report <-> graph linking
    els.report.addEventListener('pointerover', function (ev) {
      var s = ev.target.closest('[data-n]'); if (!s) return;
      var id = s.getAttribute('data-n'); markSpans(id); view.setHover(view.byId.get(id) || null, true);
    });
    els.report.addEventListener('pointerout', function (ev) {
      if (ev.target.closest('[data-n]')) { markSpans(null); view.setHover(null, true); }
    });
  }

  /* --------------------------------------------------------------------- boot */

  function boot() {
    els.status.textContent = 'Loading graph…';
    Promise.all([
      fetch(root.getAttribute('data-examples')).then(function (r) { return r.json(); }),
      KG.load(root.getAttribute('data-graph'))
    ]).then(function (res) {
      examples = res[0];
      view = KG.View(els.canvas, res[1], {
        draw: draw,
        hitRadius: function (n) { return current && current.status.has(n.id) ? 11 : 8; },
        onHover: function (n) { markSpans(n ? n.id : null); },
        onResize: function (v) { if (!v.userMoved && current) v.flyTo(focusTarget(), true); }
      });
      buildTabs(); bindControls();
      els.status.hidden = true; root.classList.add('ready');
      select(0, true);
    }).catch(function (err) {
      els.status.textContent = 'Could not load the graph data. Please serve the page over HTTP.';
      console.error(err);
    });
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) { io.disconnect(); boot(); }
    }, { rootMargin: '400px' });
    io.observe(root);
  } else boot();
})();
