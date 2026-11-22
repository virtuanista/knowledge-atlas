/* OSINT Atlas — grafo fractal atómico.
 * Jerarquía: raíz → cluster → subcluster → átomo (fuente).
 * Layout determinista: espiral de Vogel (girasol áureo) + relajación de círculos.
 * Cada átomo es un splat gaussiano; al enfocarlo aparece la tarjeta de preview con blur animado.
 * Todo el texto se inserta con textContent. Los enlaces solo admiten http(s).
 */
(function () {
  "use strict";

  const GOLD = Math.PI * (3 - Math.sqrt(5));
  const AR = 1.5;            // radio base de un átomo (unidades de mundo)
  const PAD = 5;             // separación entre círculos
  const SIGMA = 0.30;        // σ del splat gaussiano (normalizado a radio 1)

  const $ = (id) => document.getElementById(id);
  const canvas = $("c"), ctx = canvas.getContext("2d");
  const card = $("card"), qInput = $("q"), legend = $("legend"), stats = $("stats");

  let DATA = null, NODES = [], CLUS = [], SUBS = [];
  let W = 0, H = 0, DPR = 1;
  let view = { x: 0, y: 0, k: 1 };        // screen = world*k + (x,y)
  let fitK = 1, minK = 0.2, maxK = 400;
  let hover = -1, pinned = -1, dirty = true;
  let hidden = new Set();                  // clusters ocultos
  let query = "", matchFlag = null;
  let sprites = [];                        // splat por cluster

  // ---------- util ----------
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hue = (i) => (i * 137.508) % 360;
  function safeHref(u) {
    try { const p = new URL(u); return (p.protocol === "http:" || p.protocol === "https:") ? p.href : null; }
    catch (e) { return null; }
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const fmt = (n) => n.toLocaleString("es-ES");

  // ---------- layout ----------
  function relax(circles, iters) {
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
          const a = circles[i], b = circles[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1e-6;
          const min = a.r + b.r + PAD;
          if (d < min) {
            const push = (min - d) / 2, ux = dx / d, uy = dy / d;
            a.x -= ux * push; a.y -= uy * push;
            b.x += ux * push; b.y += uy * push;
          }
        }
      }
      for (const c of circles) { c.x *= 0.985; c.y *= 0.985; }
    }
  }
  function enclose(children) {
    let R = 0;
    for (const c of children) R = Math.max(R, Math.hypot(c.x, c.y) + c.r);
    return R;
  }
  function layout() {
    // 1) átomos por subcluster
    SUBS.forEach((s) => { s.atoms = []; });
    NODES.forEach((nd, ni) => SUBS[nd.s].atoms.push(ni));
    // 2) subclusters: radio desde Vogel de sus átomos, empaquetados por cluster
    CLUS.forEach((cl) => {
      cl.subs = SUBS.filter((s) => s.c === cl.i && s.atoms.length > 0);
      cl.subs.sort((a, b) => b.atoms.length - a.atoms.length || a.n.localeCompare(b.n));
      cl.subs.forEach((s, j) => {
        s.r = AR * 1.08 * Math.sqrt(s.atoms.length) + AR * 2.2;
        s.x = Math.cos(j * GOLD) * 14 * Math.sqrt(j + 1);
        s.y = Math.sin(j * GOLD) * 14 * Math.sqrt(j + 1);
      });
      relax(cl.subs, 260);
      cl.r = enclose(cl.subs) + PAD;
    });
    // 3) clusters en la raíz
    CLUS.forEach((cl, j) => {
      cl.x = Math.cos(j * GOLD) * 40 * Math.sqrt(j + 1);
      cl.y = Math.sin(j * GOLD) * 40 * Math.sqrt(j + 1);
    });
    relax(CLUS.filter((c) => c.subs.length), 320);
    // 4) coordenadas absolutas: cada átomo en Vogel dentro de su subcluster
    CLUS.forEach((cl) => {
      cl.subs.forEach((s) => {
        s.ax = cl.x + s.x; s.ay = cl.y + s.y;
        s.atoms.forEach((ni, j) => {
          const rr = AR * 1.08 * Math.sqrt(j + 1), t = j * GOLD;
          NODES[ni].X = s.ax + Math.cos(t) * rr;
          NODES[ni].Y = s.ay + Math.sin(t) * rr;
        });
      });
    });
    // radio total
    let R = 0;
    CLUS.forEach((cl) => { if (cl.subs.length) R = Math.max(R, Math.hypot(cl.x, cl.y) + cl.r); });
    ROOT_R = R;
  }
  let ROOT_R = 1;

  // ---------- sprites gaussianos ----------
  function makeSprite(h) {
    const S = 96, c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d"), r = S / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;                                 // radio normalizado
      const a = Math.exp(-(t * t) / (2 * SIGMA * SIGMA)); // gaussiana
      grd.addColorStop(t, `hsla(${h},95%,68%,${(a * 0.95).toFixed(3)})`);
    }
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    return c;
  }

  // ---------- resize / view ----------
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    fitView(); dirty = true;
  }
  function fitView() {
    const side = Math.min(W, H) * 0.92;
    fitK = side / (2 * ROOT_R);
    minK = fitK * 0.6; maxK = fitK * 900;
    view.k = fitK; view.x = W / 2; view.y = H / 2;
  }
  const w2s = (wx, wy) => [wx * view.k + view.x, wy * view.k + view.y];
  const s2w = (sx, sy) => [(sx - view.x) / view.k, (sy - view.y) / view.k];

  // ---------- render ----------
  function draw() {
    dirty = false;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#07090d"; ctx.fillRect(0, 0, W, H);
    const k = view.k;

    // clusters + subclusters (contornos)
    ctx.lineWidth = 1;
    CLUS.forEach((cl) => {
      if (!cl.subs.length || hidden.has(cl.i)) return;
      const [cx, cy] = w2s(cl.x, cl.y), rr = cl.r * k;
      if (cx + rr < 0 || cy + rr < 0 || cx - rr > W || cy - rr > H) return;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${cl.h},70%,60%,0.035)`; ctx.fill();
      ctx.strokeStyle = `hsla(${cl.h},70%,65%,0.22)`; ctx.stroke();
      if (rr > 60) {
        ctx.font = `600 ${clamp(rr / 14, 11, 26)}px system-ui,sans-serif`;
        ctx.fillStyle = `hsla(${cl.h},80%,78%,0.85)`; ctx.textAlign = "center";
        ctx.fillText(cl.label, cx, cy - rr - 6);
      }
      if (rr > 120) {
        cl.subs.forEach((s) => {
          const [sx, sy] = w2s(s.ax, s.ay), sr = s.r * k;
          if (sr < 14) return;
          ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${cl.h},60%,70%,0.12)`; ctx.stroke();
          if (sr > 46) {
            ctx.font = `${clamp(sr / 9, 9, 15)}px system-ui,sans-serif`;
            ctx.fillStyle = "rgba(230,237,246,.55)"; ctx.textAlign = "center";
            ctx.fillText(s.n, sx, sy + sr + 12);
          }
        });
      }
    });

    // átomos: splats aditivos
    ctx.globalCompositeOperation = "lighter";
    const splat = AR * 3.2 * k;                    // radio visual del splat
    const hasQ = matchFlag !== null;
    for (let i = 0; i < NODES.length; i++) {
      const nd = NODES[i];
      if (hidden.has(nd.c)) continue;
      const [sx, sy] = w2s(nd.X, nd.Y);
      if (sx < -splat || sy < -splat || sx > W + splat || sy > H + splat) continue;
      let alpha = 1;
      if (hasQ && !matchFlag[i]) alpha = 0.06;
      if (nd.x) alpha *= 0.35;                     // sin respuesta
      const sz = Math.max(1.2, splat);
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprites[nd.c], sx - sz, sy - sz, sz * 2, sz * 2);
    }
    ctx.globalAlpha = 1;

    // halo gaussiano (preview) del átomo enfocado
    ctx.globalCompositeOperation = "lighter";
    const focus = pinned >= 0 ? pinned : hover;
    if (focus >= 0 && !hidden.has(NODES[focus].c)) {
      const nd = NODES[focus];
      const [sx, sy] = w2s(nd.X, nd.Y);
      const hs = Math.max(26, splat * 6);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(sprites[nd.c], sx - hs, sy - hs, hs * 2, hs * 2);
      ctx.globalAlpha = 1;
      if (k > fitK * 6) {                         // zoom alto: etiqueta del átomo
        ctx.globalCompositeOperation = "source-over";
        ctx.font = "12px system-ui,sans-serif"; ctx.textAlign = "left";
        ctx.fillStyle = "rgba(230,237,246,.9)";
        ctx.fillText(nd.t.slice(0, 60), sx + hs * 0.6, sy - hs * 0.6);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }
  function loop() {
    if (dirty) draw();
    requestAnimationFrame(loop);
  }

  // ---------- hit test ----------
  function nearest(sx, sy) {
    const [wx, wy] = s2w(sx, sy);
    const rad = 10 / view.k;                       // 10px en pantalla
    let best = -1, bd = rad * rad;
    for (let i = 0; i < NODES.length; i++) {
      const nd = NODES[i];
      if (hidden.has(nd.c)) continue;
      if (matchFlag && !matchFlag[i]) continue;
      const dx = nd.X - wx, dy = nd.Y - wy, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // ---------- card ----------
  function showCard(i, sx, sy, isPinned) {
    const nd = NODES[i];
    card.hidden = false;
    card.className = "card";
    card.classList.toggle("pin", isPinned);
    card.textContent = "";
    card.appendChild(el("p", "t", nd.t));
    card.appendChild(el("div", "h", nd.h));
    const cl = CLUS[nd.c], sub = SUBS[nd.s];
    card.appendChild(el("div", "m", `${cl.label} · ${sub.n}${nd.l ? " · " + nd.l : ""}`));
    if (nd.d) card.appendChild(el("p", "d", nd.d));
    if (nd.x) card.appendChild(el("div", "x", "sin respuesta al último rastreo"));
    const href = safeHref(nd.u);
    if (href) {
      const a = el("a", "go", "Abrir fuente ↗");
      a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer nofollow";
      card.appendChild(a);
    }
    // posición junto al puntero
    const pad = 16, cw = card.offsetWidth || 300, ch = card.offsetHeight || 160;
    let x = sx + pad, y = sy + pad;
    if (x + cw > W - 8) x = sx - cw - pad;
    if (y + ch > H - 8) y = H - ch - 8;
    card.style.left = Math.max(8, x) + "px";
    card.style.top = Math.max(8, y) + "px";
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("on")));
  }
  function hideCard() {
    card.classList.remove("on", "pin");
    card.hidden = true;
  }

  // ---------- interacción ----------
  const pointers = new Map();
  let drag = null, pinchD = 0;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchD = Math.hypot(a.x - b.x, a.y - b.y);
    }
    canvas.classList.add("drag");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      zoomAt(mx, my, d / (pinchD || d));
      pinchD = d; dirty = true; return;
    }
    if (drag && pointers.size === 1 && e.buttons) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      view.x = drag.vx + dx; view.y = drag.vy + dy;
      dirty = true; hideCard(); pinned = -1; return;
    }
    const i = nearest(e.clientX, e.clientY);
    if (i !== hover) {
      hover = i; dirty = true;
      if (i >= 0 && pinned < 0) showCard(i, e.clientX, e.clientY, false);
      else if (i < 0 && pinned < 0) hideCard();
    } else if (hover >= 0 && pinned < 0) {
      // reposiciona la tarjeta junto al puntero
      showCard(hover, e.clientX, e.clientY, false);
    }
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      canvas.classList.remove("drag");
      if (drag && !drag.moved) {
        const i = nearest(e.clientX, e.clientY);
        if (i >= 0) { pinned = i; hover = i; showCard(i, e.clientX, e.clientY, true); }
        else { pinned = -1; hideCard(); }
        dirty = true;
      }
      drag = null;
    }
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => { if (pinned < 0) { hover = -1; hideCard(); dirty = true; } });

  function zoomAt(sx, sy, factor) {
    const k2 = clamp(view.k * factor, minK, maxK);
    const f = k2 / view.k;
    view.x = sx - (sx - view.x) * f;
    view.y = sy - (sy - view.y) * f;
    view.k = k2; dirty = true;
  }
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016));
    if (hover >= 0 || pinned >= 0) { /* mantiene tarjeta */ }
  }, { passive: false });
  canvas.addEventListener("dblclick", (e) => {
    zoomAt(e.clientX, e.clientY, 2.2);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== qInput) { e.preventDefault(); qInput.focus(); }
    if (e.key === "Escape") { pinned = -1; hideCard(); qInput.blur(); dirty = true; }
  });
  $("reset").addEventListener("click", () => { fitView(); pinned = -1; hideCard(); dirty = true; });
  window.addEventListener("resize", resize);

  // ---------- búsqueda ----------
  let qTimer = 0;
  qInput.addEventListener("input", () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      query = qInput.value.trim().toLowerCase();
      if (!query) { matchFlag = null; }
      else {
        matchFlag = new Array(NODES.length);
        for (let i = 0; i < NODES.length; i++) {
          const nd = NODES[i];
          matchFlag[i] = nd._q.indexOf(query) !== -1;
        }
      }
      dirty = true;
    }, 120);
  });

  // ---------- leyenda ----------
  function buildLegend() {
    legend.textContent = "";
    CLUS.forEach((cl) => {
      if (!cl.subs.length) return;
      const b = el("button", "chip");
      b.type = "button";
      b.setAttribute("aria-pressed", hidden.has(cl.i) ? "false" : "true");
      const sw = el("span", "sw"); sw.style.background = `hsl(${cl.h},70%,62%)`; sw.style.color = `hsl(${cl.h},70%,62%)`;
      b.appendChild(sw);
      b.appendChild(el("span", "lb", cl.label));
      b.appendChild(el("span", "n", fmt(cl.count)));
      b.addEventListener("click", () => {
        if (hidden.has(cl.i)) hidden.delete(cl.i); else hidden.add(cl.i);
        b.setAttribute("aria-pressed", hidden.has(cl.i) ? "false" : "true");
        dirty = true;
      });
      legend.appendChild(b);
    });
  }

  // ---------- carga ----------
  async function boot() {
    const res = await fetch("data/atlas.json", { cache: "force-cache" });
    DATA = await res.json();
    CLUS = DATA.keys.map((key, i) => ({ i, key, label: DATA.labels[i], h: hue(i), subs: [], x: 0, y: 0, r: 0, count: 0 }));
    SUBS = DATA.subs.map((s, si) => ({ si, c: s.c, n: s.n, atoms: [], x: 0, y: 0, r: 0 }));
    NODES = DATA.nodes.map((n) => ({
      u: n.u, h: n.h, t: n.t, d: n.d, c: n.c, s: n.s, k: n.k, l: n.l, x: n.x, X: 0, Y: 0,
      _q: (n.t + " " + n.h + " " + n.d + " " + n.u).toLowerCase()
    }));
    NODES.forEach((nd) => { CLUS[nd.c].count++; });
    layout();
    sprites = CLUS.map((cl) => makeSprite(cl.h));
    resize();
    buildLegend();
    const st = DATA.stats;
    stats.textContent = `${fmt(st.total)} fuentes · ${DATA.labels.length} clusters · ${fmt(SUBS.filter((s) => s.atoms && s.atoms.length).length)} subclusters`;
    requestAnimationFrame(loop);
  }
  boot().catch((err) => {
    stats.textContent = "No se pudo cargar data/atlas.json";
    console.error(err);
  });
})();
