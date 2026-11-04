/*
 * Curated knowledge graph explorer (full graph from static/graph/relations.csv).
 *
 * Built on the shared graph engine (kg.js). Edges are coloured by relation type (legend items
 * toggle a type on/off). No labels are shown until a node is hovered or clicked: then the node
 * and its neighbours are named and everything else is dimmed.
 */
(function () {
  'use strict';
  var root = document.getElementById('kx');
  if (!root) return;

  var $ = function (sel) { return root.querySelector(sel); };
  var els = { canvas: $('canvas'), status: $('.kx-status'), legend: $('.kx-legend'), ctl: $('.kx-ctl') };

  var REL = {
    has_cytological_feature: { label: 'Cytological feature', color: '#e0457b' },
    has_growth_pattern:      { label: 'Growth pattern',      color: '#7c5cd6' },
    has_nuclear_feature:     { label: 'Nuclear feature',     color: '#2f7fd6' },
    has_invasion_pattern:    { label: 'Invasion pattern',    color: '#e8892b' },
    has_background_feature:  { label: 'Background feature',  color: '#14a3a3' },
    found_in:                { label: 'Found in',            color: '#8a93a6' }
  };
  var NODE = { cls: '#2f3547', site: '#d1a14c', feat: '#a3abbe' };
  var TAU = Math.PI * 2, view = null, selected = null, hidden = new Set(), groups = {};
  var showNames = root.getAttribute('data-names') !== 'off', order = [], widths = {};

  function kind(n) { return n.isClass ? 'cls' : n.isSite ? 'site' : 'feat'; }
  function radius(n) { return n.isClass ? 5.6 : n.isSite ? 4.4 : 3.5; }
  function visible(edge) { return !hidden.has(edge.rel); }
  function color(rel) { return (REL[rel] || { color: '#8a93a6' }).color; }

  /* ------------------------------------------------------------------ drawing */

  function strokeEdges(ctx, v, list) {
    var k = v.cam.k, vx = v.cam.x, vy = v.cam.y, cx = v.W / 2, cy = v.H / 2;
    ctx.beginPath();
    list.forEach(function (e) {
      ctx.moveTo((e.s.x - vx) * k + cx, (e.s.y - vy) * k + cy); ctx.lineTo((e.t.x - vx) * k + cx, (e.t.y - vy) * k + cy);
    });
    ctx.stroke();
  }

  function draw(ctx, v) {
    var W = v.W, H = v.H, k = v.cam.k, vx = v.cam.x, vy = v.cam.y, cx = W / 2, cy = H / 2, grow = v.grow;
    var focus = v.hover || selected, near = new Set(), links = [], i, n, p, q;
    if (focus) {
      links = focus.links.filter(function (l) { return visible(l.edge); });
      near.add(focus); links.forEach(function (l) { near.add(l.node); });
    }

    // edges by relation type
    ctx.lineWidth = 1.1;
    Object.keys(groups).forEach(function (rel) {
      if (hidden.has(rel)) return;
      ctx.strokeStyle = color(rel); ctx.globalAlpha = focus ? 0.07 : 0.55;
      strokeEdges(ctx, v, groups[rel]);
    });
    ctx.globalAlpha = 1;
    if (focus) {                                        // the focused node's own edges
      ctx.lineWidth = 2.4;
      Object.keys(groups).forEach(function (rel) {
        var own = links.filter(function (l) { return l.edge.rel === rel; }).map(function (l) { return l.edge; });
        if (!own.length) return;
        ctx.strokeStyle = color(rel); strokeEdges(ctx, v, own);
      });
    }

    // nodes
    for (i = 0; i < v.nodes.length; i++) {
      n = v.nodes[i];
      p = (n.x - vx) * k + cx; q = (n.y - vy) * k + cy;
      if (p < -12 || q < -12 || p > W + 12 || q > H + 12) continue;
      ctx.globalAlpha = focus && !near.has(n) ? 0.2 : 1;
      ctx.fillStyle = NODE[kind(n)];
      ctx.beginPath(); ctx.arc(p, q, (radius(n) + (n === focus ? 2.5 : 0)) * grow, 0, TAU); ctx.fill();
      if (n === focus) { ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    }
    ctx.globalAlpha = 1;

    // names of all nodes, decluttered by priority (histology classes first); more appear as you zoom in
    if (showNames) drawNames(ctx, v, focus ? 0.22 : 1);

    // labels for the focused node and its neighbours
    if (!focus) return;
    var fp = v.toScreen(focus.x, focus.y);
    ctx.lineJoin = 'round'; ctx.textAlign = 'left';
    var boxes = [];
    ctx.font = '700 13.5px Inter, system-ui, sans-serif';
    var fw = ctx.measureText(focus.id).width;
    boxes.push({ text: focus.id, color: '#1d1630', font: '700 13.5px Inter, system-ui, sans-serif', x: fp[0] - fw / 2, y: fp[1] - (radius(focus) + 8) * grow - 4, w: fw });
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    links.forEach(function (l) {
      var nn = l.node, sp = v.toScreen(nn.x, nn.y), w = ctx.measureText(nn.id).width, r = (radius(nn) + 2) * grow;
      var ang = Math.atan2(sp[1] - fp[1], sp[0] - fp[0]), ca = Math.cos(ang), sa = Math.sin(ang);
      var dx = ca * (r + 5), dy = sa * (r + 5) + (sa > .45 ? 10 : sa < -.45 ? -3 : 4);
      boxes.push({ text: nn.id, color: color(l.edge.rel), font: ctx.font, w: w, y: sp[1] + dy,
                   x: ca > .35 ? sp[0] + dx : ca < -.35 ? sp[0] + dx - w : sp[0] + dx - w / 2 });
    });
    KG.placeLabels(boxes, W, H);
    boxes.forEach(function (b) {
      ctx.font = b.font; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeText(b.text, b.x, b.y);
      ctx.fillStyle = b.color; ctx.fillText(b.text, b.x, b.y);
    });
  }

  function textWidth(ctx, text, font) {
    var key = font + text;
    return widths[key] || (widths[key] = ctx.measureText(text).width);
  }

  function drawNames(ctx, v, alpha) {
    var W = v.W, H = v.H, grow = v.grow, placed = [], i, n, c, j, b, ok;
    ctx.lineJoin = 'round'; ctx.textAlign = 'left'; ctx.globalAlpha = alpha;
    for (i = 0; i < order.length; i++) {
      n = order[i];
      var sp = v.toScreen(n.x, n.y), p = sp[0], q = sp[1];
      if (p < -20 || q < -10 || p > W + 20 || q > H + 10) continue;
      var font = n.isClass ? '700 12.5px Inter, system-ui, sans-serif' : '500 11px Inter, system-ui, sans-serif';
      ctx.font = font;
      var w = textWidth(ctx, n.id, font), r = radius(n) * grow, hgt = n.isClass ? 15 : 13;
      var spots = [[p + r + 4, q + 4], [p - r - 4 - w, q + 4], [p - w / 2, q - r - 5], [p - w / 2, q + r + 13]];
      for (c = 0; c < spots.length; c++) {
        var x = spots[c][0], y = spots[c][1];
        if (x < 3 || x + w > W - 3 || y - hgt < 3 || y > H - 3) continue;
        ok = true;
        for (j = 0; j < placed.length; j++) {
          b = placed[j];
          if (x < b.x + b.w + 2 && x + w + 2 > b.x && y - hgt < b.y + 1 && y + 3 > b.y - b.h) { ok = false; break; }
        }
        if (!ok) continue;
        placed.push({ x: x, y: y, w: w, h: hgt });
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeText(n.id, x, y);
        ctx.fillStyle = n.isClass ? '#1d1630' : n.isSite ? '#8a6a28' : '#5b6275'; ctx.fillText(n.id, x, y);
        break;
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------- legend */

  function buildLegend(g) {
    var counts = {};
    g.edges.forEach(function (e) { counts[e.rel] = (counts[e.rel] || 0) + 1; });
    var frag = document.createDocumentFragment();
    Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).forEach(function (rel) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'kx-key'; b.setAttribute('aria-pressed', 'true'); b.setAttribute('data-rel', rel);
      b.title = 'Show or hide this relation type';
      b.innerHTML = '<i style="background:' + color(rel) + '"></i>' + (REL[rel] ? REL[rel].label : rel) + ' <span>' + counts[rel] + '</span>';
      frag.appendChild(b);
    });
    var sep = document.createElement('span'); sep.className = 'kx-sep'; frag.appendChild(sep);
    [['cls', 'Histology class'], ['site', 'Primary site'], ['feat', 'Feature']].forEach(function (t) {
      var s = document.createElement('span'); s.className = 'kx-node';
      s.innerHTML = '<i style="background:' + NODE[t[0]] + '"></i>' + t[1]; frag.appendChild(s);
    });
    els.legend.appendChild(frag);
    els.legend.addEventListener('click', function (ev) {
      var b = ev.target.closest('.kx-key'); if (!b) return;
      var rel = b.getAttribute('data-rel'), off = !hidden.has(rel);
      if (off) hidden.add(rel); else hidden.delete(rel);
      b.setAttribute('aria-pressed', off ? 'false' : 'true'); view.requestDraw();
    });
  }

  /* --------------------------------------------------------------------- boot */

  function boot() {
    els.status.textContent = 'Loading graph…';
    KG.load(root.getAttribute('data-graph')).then(function (g) {
      var box = els.canvas.getBoundingClientRect();
      view = KG.View(els.canvas, g, {
        draw: draw,
        aspect: Math.min(2.2, Math.max(0.9, (box.width / box.height) / 0.85)),     // the natural layout is ~0.85 wide:tall
        hitRadius: function (n) { return n.isClass ? 11 : 8; },
        onClick: function (n) { selected = (n && n !== selected) ? n : null; view.requestDraw(); },
        onResize: function (v) { if (!v.userMoved) v.flyTo(v.fit(v.nodes, 18, 18), true); }
      });
      view.edges.forEach(function (e) { (groups[e.rel] = groups[e.rel] || []).push(e); });
      order = view.nodes.slice().sort(function (a, b) { return (b.isClass - a.isClass) || (b.deg - a.deg); });
      els.ctl.querySelector('[data-act="names"]').setAttribute('aria-pressed', showNames ? 'true' : 'false');
      buildLegend(g);
      els.ctl.addEventListener('click', function (ev) {
        var b = ev.target.closest('button'); if (!b) return;
        var a = b.getAttribute('data-act');
        if (a === 'in') view.zoomAt(view.W / 2, view.H / 2, 1.35);
        else if (a === 'out') view.zoomAt(view.W / 2, view.H / 2, 1 / 1.35);
        else if (a === 'fit') view.flyTo(view.fit(view.nodes, 18, 18));
        else if (a === 'names') { showNames = !showNames; b.setAttribute('aria-pressed', showNames ? 'true' : 'false'); view.requestDraw(); }
        else if (a === 'reset') { view.resetLayout(); selected = null; view.flyTo(view.fit(view.nodes, 18, 18)); }
      });
      els.status.hidden = true; root.classList.add('ready');
      view.flyTo(view.fit(view.nodes, 18, 18), true);
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
