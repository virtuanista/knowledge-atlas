/* OSINT Atlas — grafo fractal atómico con profundidad de campo gaussiana.
 * Jerarquía: raíz → cluster → subcluster → átomo (fuente).
 * - Layout determinista: espiral de Vogel + relajación de círculos.
 * - Cada átomo es un splat gaussiano. Su tamaño crece con su popularidad (nº de listas que la citan).
 * - Profundidad de campo: el objeto señalado queda nítido (σ mínimo); los demás se desenfocan
 *   según su distancia en pantalla al foco (6 niveles de σ precalculados).
 * - Zoom con tween animado y ancla bajo el cursor; sin saltos al acercar o alejar.
 * - Todo texto se inserta con textContent. Los enlaces solo admiten http(s).
 */
(function () {
  "use strict";

  const GOLD = Math.PI * (3 - Math.sqrt(5));
  const AR = 1.5;                       // radio base de un átomo (unidades de mundo)
  const PAD = 5;                        // separación entre círculos
  const SIGMAS = [0.13, 0.19, 0.26, 0.34, 0.43, 0.54];   // σ por nivel de desenfoque
  const LEVELS = SIGMAS.length;
  const PREV_START = 12;                // zoom (×fitK) donde empiezan las previews
  const PREV_FULL = 36;                 // zoom (×fitK) donde son nítidas
  let MATTE = [], FOCUS = [];
  let previewHits = [];                 // [x, y, lado, índice] de cada tarjeta dibujada

  const $ = (id) => document.getElementById(id);
  const canvas = $("c"), ctx = canvas.getContext("2d");
  const card = $("card"), qInput = $("q"), legend = $("legend"), stats = $("stats"), dofBtn = $("dof");

  let DATA = null, NODES = [], CLUS = [], SUBS = [];
  let W = 0, H = 0, DPR = 1, ROOT_R = 1;
  let view = { x: 0, y: 0, k: 1 };      // pantalla = mundo*k + (x,y)
  let target = { x: 0, y: 0, k: 1 };   // destino del tween
  let fitK = 1, minK = 0.2, maxK = 300;
  let hover = -1, pinned = -1, dirty = true;
  let hidden = new Set();
  let matchFlag = null;
  let dof = true;
  let sprites = [];                     // [cluster][nivel] -> canvas
  let lastPt = null;                    // último puntero dentro del canvas
  let cardIdx = -1, cardPinned = false;
  const pointers = new Map();
  let drag = null, pinchD = 0;
  let lastView = "";

  // ---------- util ----------
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // radio del punto en pantalla: mate, con mínimo legible
  const rdPx = (nd) => clamp(AR * 0.6 * (0.9 + 0.05 * Math.min(nd.k, 20)) * view.k, 2.5, 6.5);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hue = (i) => (i * 137.508) % 360;
  const fmt = (n) => n.toLocaleString("es-ES");
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
    SUBS.forEach((s) => { s.atoms = []; });
    NODES.forEach((nd, ni) => SUBS[nd.s].atoms.push(ni));
    CLUS.forEach((cl) => {
      cl.subs = SUBS.filter((s) => s.c === cl.i && s.atoms.length > 0);
      cl.subs.sort((a, b) => b.atoms.length - a.atoms.length || a.n.localeCompare(b.n));
      cl.subs.forEach((s, j) => {
        s.r = AR * 1.25 * Math.sqrt(s.atoms.length) + AR * 2.2;
        s.x = Math.cos(j * GOLD) * 14 * Math.sqrt(j + 1);
        s.y = Math.sin(j * GOLD) * 14 * Math.sqrt(j + 1);
      });
      relax(cl.subs, 260);
      cl.r = enclose(cl.subs) + PAD;
    });
    CLUS.forEach((cl, j) => {
      cl.x = Math.cos(j * GOLD) * 40 * Math.sqrt(j + 1);
      cl.y = Math.sin(j * GOLD) * 40 * Math.sqrt(j + 1);
    });
    relax(CLUS.filter((c) => c.subs.length), 320);
    CLUS.forEach((cl) => {
      cl.subs.forEach((s) => {
        s.ax = cl.x + s.x; s.ay = cl.y + s.y;
        s.atoms.forEach((ni, j) => {
          const rr = AR * 1.25 * Math.sqrt(j + 1), t = j * GOLD;
          NODES[ni].X = s.ax + Math.cos(t) * rr;
          NODES[ni].Y = s.ay + Math.sin(t) * rr;
        });
      });
    });
    let R = 0;
    CLUS.forEach((cl) => { if (cl.subs.length) R = Math.max(R, Math.hypot(cl.x, cl.y) + cl.r); });
    ROOT_R = R;
  }

  // ---------- sprites gaussianos (6 niveles de σ por color) ----------
  function makeSprites(h) {
    return SIGMAS.map((sig) => {
      const S = 128, c = document.createElement("canvas");
      c.width = c.height = S;
      const g = c.getContext("2d"), r = S / 2;
      const grd = g.createRadialGradient(r, r, 0, r, r, r);
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;                                        // radio normalizado
        const gauss = Math.exp(-(t * t) / (2 * sig * sig));      // núcleo gaussiano
        const edge = Math.pow(1 - t * t, 2);                     // fundido en el borde
        grd.addColorStop(t, `hsla(${h},95%,68%,${(gauss * edge * 0.95).toFixed(3)})`);
      }
      g.fillStyle = grd; g.fillRect(0, 0, S, S);
      return c;
    });
  }

  // ---------- vista ----------
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    fitView(true); dirty = true;
  }
  function fitView(immediate) {
    const side = Math.min(W, H) * 0.92;
    fitK = side / (2 * ROOT_R);
    minK = fitK * 0.7; maxK = fitK * 300;
    target = { x: W / 2, y: H / 2, k: fitK };
    if (immediate) view = { ...target };
    dirty = true;
  }
  const w2s = (wx, wy) => [wx * view.k + view.x, wy * view.k + view.y];
  const s2w = (sx, sy) => [(sx - view.x) / view.k, (sy - view.y) / view.k];

  function tween() {
    const dk = target.k - view.k, dx = target.x - view.x, dy = target.y - view.y;
    if (Math.abs(dk) <= view.k * 0.0004 && Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) {
      if (dk || dx || dy) { view = { ...target }; return true; }
      return false;
    }
    const a = 0.24;
    view.k += dk * a; view.x += dx * a; view.y += dy * a;
    return true;
  }
  // zoom anclado en (sx,sy): el punto bajo el cursor se queda quieto
  function zoomAt(sx, sy, factor, immediate) {
    const k2 = clamp(target.k * factor, minK, maxK);
    const wx = (sx - target.x) / target.k, wy = (sy - target.y) / target.k;
    target = { k: k2, x: sx - wx * k2, y: sy - wy * k2 };
    if (immediate) view = { ...target };
    dirty = true;
  }

  // ---------- render ----------
  function draw() {
    dirty = false;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#07090d"; ctx.fillRect(0, 0, W, H);
    const k = view.k;

    // clusters y subclusters
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

    // foco: átomo señalado (pinned > hover) o centro de pantalla
    const fi = pinned >= 0 ? pinned : hover;
    let fx = W / 2, fy = H / 2;
    if (fi >= 0) [fx, fy] = w2s(NODES[fi].X, NODES[fi].Y);
    const cell = Math.max(70, Math.min(W, H) * 0.11);   // px por nivel de desenfoque
    const base = AR * 2.1 * k;

    // átomos: halo gaussiano suave (profundidad de campo) + punto mate nítido
    const visIdx = [];
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < NODES.length; i++) {
      const nd = NODES[i];
      if (hidden.has(nd.c)) continue;
      const [sx, sy] = w2s(nd.X, nd.Y);
      if (sx < -60 || sy < -60 || sx > W + 60 || sy > H + 60) continue;
      visIdx.push(i);
      if (i === fi) continue;
      let lv = 0;
      if (dof) lv = Math.min(LEVELS - 1, Math.floor(Math.hypot(sx - fx, sy - fy) / cell));
      const hr = Math.max(3, rdPx(nd) * (2.6 + 0.9 * lv));
      const dim = (matchFlag && !matchFlag[i]) ? 0.1 : 1;
      ctx.globalAlpha = Math.max(0, 0.22 * dim * (1 - 0.14 * lv));
      ctx.drawImage(sprites[nd.c][lv], sx - hr, sy - hr, hr * 2, hr * 2);
    }
    // puntos mate: sólidos, sin brillo
    ctx.globalCompositeOperation = "source-over";
    for (const i of visIdx) {
      const nd = NODES[i];
      if (i === fi) continue;
      const [sx, sy] = w2s(nd.X, nd.Y);
      const r = rdPx(nd);
      const dim = (matchFlag && !matchFlag[i]) ? 0.12 : 1;
      ctx.globalAlpha = dim * (nd.x ? 0.4 : 0.95);
      ctx.fillStyle = MATTE[nd.c];
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 0.8; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // objeto señalado: punto nítido + anillo de foco
    if (fi >= 0 && !hidden.has(NODES[fi].c)) {
      const nd = NODES[fi];
      const r = Math.max(rdPx(nd), 3);
      ctx.globalCompositeOperation = "lighter";
      const hs = clamp(r * 7, 14, 120);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(sprites[nd.c][0], fx - hs, fy - hs, hs * 2, hs * 2);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fillStyle = FOCUS[nd.c]; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.stroke();
      ctx.beginPath(); ctx.arc(fx, fy, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${CLUS[nd.c].h},90%,80%,0.45)`; ctx.stroke();
    }

    // previews: aparecen al acercar, con blur que se resuelve, sin pisarse
    const pv = smooth(PREV_START * fitK, PREV_FULL * fitK, k);
    if (pv > 0.02) drawPreviews(pv, visIdx, fi);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // tarjeta: fijada → sigue a su nodo; hover → sigue al puntero
    if (cardIdx >= 0 && cardPinned) {
      const nd = NODES[cardIdx];
      const [sx, sy] = w2s(nd.X, nd.Y);
      moveCard(sx, sy);
    } else if (cardIdx >= 0 && lastPt) {
      moveCard(lastPt.x, lastPt.y);
    }
  }
  // envuelve texto en líneas medidas en píxeles; la última línea lleva elipsis si no cabe
  function wrapText(text, maxW, maxLines) {
    const raw = String(text || "").split(/\s+/).filter(Boolean);
    // palabras más anchas que la caja (p. ej. CJK sin espacios) se trocean por carácter
    const words = [];
    for (const w of raw) {
      if (ctx.measureText(w).width <= maxW) { words.push(w); continue; }
      let chunk = "";
      for (const ch of w) {
        if (ctx.measureText(chunk + ch).width > maxW) { words.push(chunk); chunk = ""; }
        chunk += ch;
      }
      if (chunk) words.push(chunk);
    }
    const lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (ctx.measureText(t).width <= maxW) { cur = t; continue; }
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    if (lines.length > maxLines) lines.length = maxLines;
    const used = lines.join("").length, total = words.join("").length;
    if (used < total && lines.length) {
      let last = lines[lines.length - 1];
      while (last.length > 1 && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
      lines[lines.length - 1] = last.trimEnd() + "…";
    }
    return lines;
  }
  // previews: tarjeta CUADRADA por punto, colocada a distancia del punto, sin tapar otros puntos ni tarjetas
  function drawPreviews(pv, vis, fi) {
    previewHits.length = 0;
    const cx = W / 2, cy = H / 2;
    const cand = vis.filter((i) => i !== fi && !hidden.has(NODES[i].c));
    const pts = cand.map((i) => {
      const [sx, sy] = w2s(NODES[i].X, NODES[i].Y);
      return { i, sx, sy, d: Math.hypot(sx - cx, sy - cy) };
    }).filter((p) => p.sx > 0 && p.sy > 0 && p.sx < W && p.sy < H);
    pts.sort((a, b) => a.d - b.d);
    const dots = vis.map((i) => {
      const [sx, sy] = w2s(NODES[i].X, NODES[i].Y);
      return [sx, sy, rdPx(NODES[i]) + 4];
    });
    const hitsDot = (x, y, w, h) => dots.some(([dx, dy, r]) => {
      const nx = clamp(dx, x, x + w), ny = clamp(dy, y, y + h);
      return Math.hypot(dx - nx, dy - ny) < r;
    });
    const S = 176, PAD = 12, GAP = 18, MAXCARDS = 50, MARGIN = 12, TOP = 52;
    const placed = [];
    ctx.save();
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.filter = `blur(${((1 - pv) * 5).toFixed(2)}px)`;
    ctx.globalAlpha = pv;
    let n = 0;
    for (const p of pts) {
      if (n >= MAXCARDS) break;
      const nd = NODES[p.i], col = CLUS[nd.c].h;
      const inner = S - PAD * 2 - 4;
      ctx.font = "600 12px system-ui,sans-serif";
      const titleL = wrapText(nd.t, inner, 2);
      ctx.font = "10px system-ui,sans-serif";
      const hostL = wrapText(nd.h, inner, 1);
      const titleH = titleL.length * 15;
      const descRoom = Math.max(0, Math.floor((S - PAD * 2 - titleH - 16 - 22) / 13));
      const descL = wrapText(nd.d, inner, descRoom);
      const cands = [
        [p.sx + GAP, p.sy - S / 2], [p.sx - GAP - S, p.sy - S / 2],
        [p.sx + GAP, p.sy - S - GAP / 2], [p.sx - GAP - S, p.sy - S - GAP / 2],
        [p.sx + GAP, p.sy + GAP / 2], [p.sx - GAP - S, p.sy + GAP / 2],
        [p.sx - S / 2, p.sy - S - GAP], [p.sx - S / 2, p.sy + GAP]
      ];
      let spot = null;
      for (const [x, y] of cands) {
        if (x < MARGIN || y < TOP || x + S > W - MARGIN || y + S > H - MARGIN) continue;
        if (placed.some((r) => x < r[0] + S + 6 && x + S + 6 > r[0] && y < r[1] + S + 6 && y + S + 6 > r[1])) continue;
        if (hitsDot(x, y, S, S)) continue;
        spot = [x, y]; break;
      }
      if (!spot) continue;
      const [x, y] = spot;
      placed.push([x, y]); n++;
      previewHits.push([x, y, S, p.i]);
      // línea guía desde el punto al borde más cercano de la tarjeta
      const ex = clamp(p.sx, x, x + S), ey = clamp(p.sy, y, y + S);
      const onX = ex > x && ex < x + S, onY = ey > y && ey < y + S;
      const lx = onX ? ex : (p.sx < x ? x : x + S), ly = onY ? ey : (p.sy < y ? y : y + S);
      ctx.strokeStyle = `hsla(${col},70%,68%,0.7)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(lx, ly); ctx.stroke();
      // caja cuadrada
      ctx.fillStyle = "rgba(9,12,18,.95)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, S, S, 10); else ctx.rect(x, y, S, S);
      ctx.fill();
      ctx.strokeStyle = `hsla(${col},65%,60%,0.6)`; ctx.stroke();
      ctx.fillStyle = `hsl(${col},60%,58%)`;
      ctx.fillRect(x + 1, y + 10, 3, S - 20);
      // contenido
      let ty = y + PAD + 12;
      ctx.font = "600 12px system-ui,sans-serif"; ctx.fillStyle = "#e6edf6";
      for (const line of titleL) { ctx.fillText(line, x + PAD, ty); ty += 15; }
      ctx.font = "10px system-ui,sans-serif"; ctx.fillStyle = `hsl(${col},70%,72%)`;
      for (const line of hostL) { ctx.fillText(line, x + PAD, ty + 2); ty += 15; }
      ctx.fillStyle = "rgba(200,210,224,.85)";
      ty += 8;
      for (const line of descL) { ctx.fillText(line, x + PAD, ty); ty += 13; }
      ctx.font = "600 10px system-ui,sans-serif"; ctx.fillStyle = "#66ffd1";
      ctx.fillText("abrir fuente ↗", x + PAD, y + S - PAD);
    }
    ctx.restore();
  }
  // tarjeta bajo el puntero (la última dibujada gana) y apertura segura del enlace
  function previewAt(sx, sy) {
    for (let j = previewHits.length - 1; j >= 0; j--) {
      const [x, y, S, i] = previewHits[j];
      if (sx >= x && sx <= x + S && sy >= y && sy <= y + S) return i;
    }
    return -1;
  }
  function loop() {
    if (tween()) dirty = true;
    const key = view.x.toFixed(2) + "|" + view.y.toFixed(2) + "|" + view.k.toFixed(5);
    if (key !== lastView) { lastView = key; updateHover(); dirty = true; }
    try { if (dirty) draw(); }
    catch (err) { console.error("render:", err); }   // un fallo de dibujo no detiene el bucle
    requestAnimationFrame(loop);
  }

  // ---------- hit test ----------
  function nearest(sx, sy) {
    const [wx, wy] = s2w(sx, sy);
    const rad = 10 / view.k;
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
  function updateHover() {
    if (!lastPt || pointers.size > 0) return;
    const i = nearest(lastPt.x, lastPt.y);
    if (i !== hover) { hover = i; dirty = true; }
    if (pinned < 0) {
      if (i >= 0) renderCard(i, false); else hideCard();
    }
  }

  // ---------- tarjeta ----------
  function renderCard(i, isPinned) {
    if (i === cardIdx && isPinned === cardPinned) return;
    const nd = NODES[i];
    card.hidden = false;
    card.textContent = "";
    card.appendChild(el("p", "t", nd.t));
    card.appendChild(el("div", "h", nd.h));
    const cl = CLUS[nd.c], sub = SUBS[nd.s];
    card.appendChild(el("div", "m", `${cl.label} · ${sub.n}${nd.l ? " · " + nd.l : ""} · ${nd.k} listas`));
    if (nd.d) card.appendChild(el("p", "d", nd.d));
    if (nd.x) card.appendChild(el("div", "x", "sin respuesta al último rastreo"));
    const href = safeHref(nd.u);
    if (href) {
      const a = el("a", "go", "Abrir fuente ↗");
      a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer nofollow";
      card.appendChild(a);
    }
    cardIdx = i; cardPinned = isPinned;
    card.classList.toggle("pin", isPinned);
    card.classList.remove("on");
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("on")));
  }
  function moveCard(sx, sy) {
    const cw = card.offsetWidth || 300, ch = card.offsetHeight || 160;
    let x = sx + 16, y = sy + 16;
    if (x + cw > W - 8) x = sx - cw - 16;
    if (y + ch > H - 8) y = H - ch - 8;
    card.style.left = Math.max(8, x) + "px";
    card.style.top = Math.max(8, y) + "px";
  }
  function hideCard() {
    cardIdx = -1; cardPinned = false;
    card.classList.remove("on", "pin");
  }

  // ---------- interacción ----------
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
    lastPt = { x: e.clientX, y: e.clientY };
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / (pinchD || d), true);
      pinchD = d; return;
    }
    if (drag && pointers.size === 1 && e.buttons) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      view.x = drag.vx + dx; view.y = drag.vy + dy;
      target = { ...view }; dirty = true; return;
    }
    canvas.style.cursor = previewAt(e.clientX, e.clientY) >= 0 ? "pointer" : "";
    updateHover();
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      canvas.classList.remove("drag");
      if (drag && !drag.moved) {
        const pi = previewAt(e.clientX, e.clientY);
        if (pi >= 0) { pinned = pi; hover = pi; renderCard(pi, true); drag = null; dirty = true; return; }
        const i = nearest(e.clientX, e.clientY);
        if (i >= 0) { pinned = i; hover = i; renderCard(i, true); }
        else { pinned = -1; hideCard(); }
        dirty = true;
      }
      drag = null;
    }
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => {
    lastPt = null;
    if (pinned < 0) { hover = -1; hideCard(); dirty = true; }
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-clamp(e.deltaY, -120, 120) * 0.0028));
  }, { passive: false });
  canvas.addEventListener("dblclick", (e) => zoomAt(e.clientX, e.clientY, 2.2));

  window.addEventListener("keydown", (e) => {
    if (document.activeElement === qInput) {
      if (e.key === "Escape") qInput.blur();
      return;
    }
    if (e.key === "/") { e.preventDefault(); qInput.focus(); }
    else if (e.key === "Escape") { pinned = -1; hideCard(); dirty = true; }
    else if (e.key === "+" || e.key === "=") zoomAt(W / 2, H / 2, 1.5);
    else if (e.key === "-") zoomAt(W / 2, H / 2, 1 / 1.5);
    else if (e.key === "0") fitView(false);
    else if (e.key === "d" || e.key === "D") toggleDof();
  });
  function toggleDof() {
    dof = !dof; dofBtn.setAttribute("aria-pressed", String(dof)); dirty = true;
  }
  dofBtn.addEventListener("click", toggleDof);
  $("reset").addEventListener("click", () => { pinned = -1; hideCard(); fitView(false); });
  window.addEventListener("resize", resize);

  // ---------- búsqueda ----------
  let qTimer = 0;
  qInput.addEventListener("input", () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      const q = qInput.value.trim().toLowerCase();
      if (!q) matchFlag = null;
      else {
        matchFlag = new Array(NODES.length);
        for (let i = 0; i < NODES.length; i++) matchFlag[i] = NODES[i]._q.indexOf(q) !== -1;
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
      const sw = el("span", "sw");
      sw.style.background = `hsl(${cl.h},70%,62%)`; sw.style.color = `hsl(${cl.h},70%,62%)`;
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

  // ---------- carga y selector de grafo ----------
  let TOPICS = [];
  let currentTopic = null;
  function resetState() {
    hidden = new Set(); hover = -1; pinned = -1; matchFlag = null;
    qInput.value = ""; hideCard(); lastPt = null; lastView = "";
  }
  function setStats() {
    if (!DATA) return;
    stats.textContent = `${fmt(DATA.stats.total)} fuentes · ${DATA.labels.length} clusters · ${fmt(SUBS.filter((s) => s.atoms.length).length)} subclusters`;
  }
  async function loadTopic(id) {
    const res = await fetch(`data/${id}.json?v=1`);
    if (!res.ok) throw new Error(`${id}.json ${res.status}`);
    DATA = await res.json();
    currentTopic = id;
    CLUS = DATA.keys.map((key, i) => ({ i, key, label: DATA.labels[i], h: hue(i), subs: [], x: 0, y: 0, r: 0, count: 0 }));
    SUBS = DATA.subs.map((s, si) => ({ si, c: s.c, n: s.n, atoms: [], x: 0, y: 0, r: 0 }));
    NODES = DATA.nodes.map((n) => ({
      u: n.u, h: n.h, t: n.t, d: n.d, c: n.c, s: n.s, k: n.k, l: n.l, x: n.x,
      w: 0.8 + 0.09 * Math.min(n.k, 20),
      X: 0, Y: 0,
      _q: (n.t + " " + n.h + " " + n.d + " " + n.u).toLowerCase()
    }));
    NODES.forEach((nd) => { CLUS[nd.c].count++; });
    layout();
    sprites = CLUS.map((cl) => makeSprites(cl.h));
    MATTE = CLUS.map((cl) => `hsl(${cl.h},34%,46%)`);
    FOCUS = CLUS.map((cl) => `hsl(${cl.h},60%,74%)`);
    resetState();
    fitView(true);
    buildLegend();
    setStats();
    document.title = `${DATA.title} · Knowledge Atlas`;
    dirty = true;
  }
  async function boot() {
    const idx = await (await fetch("data/index.json?v=1")).json();
    TOPICS = idx;
    const sel = $("topic");
    idx.forEach((t) => {
      const o = document.createElement("option");
      o.value = t.id; o.textContent = `${t.title} (${fmt(t.nodes)})`;
      sel.appendChild(o);
    });
    const fromUrl = new URLSearchParams(location.search).get("g");
    const start = idx.some((t) => t.id === fromUrl) ? fromUrl : idx[0].id;
    sel.value = start;
    sel.addEventListener("change", () => {
      history.replaceState(null, "", `?g=${sel.value}`);
      loadTopic(sel.value).catch((e) => { stats.textContent = "No se pudo cargar el grafo"; console.error(e); });
    });
    resize();
    await loadTopic(start);
    requestAnimationFrame(loop);
  }
  boot().catch((err) => {
    stats.textContent = "No se pudo cargar los datos";
    console.error(err);
  });
})();
