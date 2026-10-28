// pdf-reader.js — PDF prohlížeč 10space: listování jako v Apple Books + poznámky perem/prstem.
//
// Modul nezná Firebase ani přihlášení; vše potřebné dostane v objektu `env`:
//   pdfjsLib                         pdf.js (globální objekt z index.html)
//   fabric                           jen pro zobrazení STARÝCH poznámek (volitelné)
//   PDFLib                           jen pro export PDF s poznámkami (volitelné)
//   user: { uid, role }              přihlášený uživatel
//   canEditPublic                    smí zapisovat veřejnou vrstvu (ADMIN/ART)
//   getPdfBytes(fileId, onProgress)  -> Promise<ArrayBuffer>
//   readAnnotPage(fileId, layerKey, page)        -> Promise<{ v2, legacy }>
//   writeAnnotPage(fileId, layerKey, page, data) -> Promise<void>   (data === null = smazat)
//   readAllAnnot(fileId, layerKey)               -> Promise<{ v2: {page: {data}}, legacy: {page: {...}} }>
//   deleteLegacyPage(fileId, layerKey, page)     -> Promise<void>
//   onClosed()                                   zavoláno po zavření
//
// Poznámky se ukládají v normalizovaných souřadnicích stránky (0–1), takže nezávisí na velikosti
// okna ani zařízení. Staré poznámky (Fabric JSON) se zobrazují jako podklad jen pro čtení.

const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
const MAX_PX = 7e6; // strop plochy jednoho plátna (iOS Safari má limit ~16,7 Mpx)
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const newId = () => Math.random().toString(36).slice(2, 10);
const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* plné/zakázané úložiště */ } };

const PEN_WIDTHS = { thin: 0.0016, medium: 0.003, thick: 0.0055 };
const HL_WIDTH = 0.022;
const INK_COLORS = ["#EE220C", "#1c1c1e", "#0066cc", "#2e7d32"];
const HL_COLORS = ["rgba(255,224,0,0.5)", "rgba(76,217,100,0.5)", "rgba(255,105,180,0.5)", "rgba(0,153,255,0.4)"];

// Hudební značky: dynamika je text, ostatní jsou křivky (viewBox 100×40)
const SYMBOLS = [
  { id: "ppp", text: "ppp" }, { id: "pp", text: "pp" }, { id: "p", text: "p" }, { id: "mp", text: "mp" },
  { id: "mf", text: "mf" }, { id: "f", text: "f" }, { id: "ff", text: "ff" }, { id: "fff", text: "fff" },
  { id: "lig", title: "Ligatura", d: "M5 32 Q50 -8 95 32", label: "⌒" },
  { id: "cresc", title: "Crescendo", d: "M5 20 L95 5 M5 20 L95 35", label: "<" },
  { id: "decresc", title: "Decrescendo", d: "M5 5 L95 20 M5 35 L95 20", label: ">" },
  { id: "ferm", title: "Koruna", d: "M18 32 A32 32 0 0 1 82 32", dot: [50, 26], label: "𝄐" }
];
const symbolById = (id) => SYMBOLS.find(s => s.id === id);

const ICON = {
  close: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  pencil: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 3l-3 2.7"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 3l3 2.7"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  hl: '<svg viewBox="0 0 24 24"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>',
  eraser: '<svg viewBox="0 0 24 24"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/></svg>',
  text: '<svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
  music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  select: '<svg viewBox="0 0 24 24"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>',
  next: '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>'
};

const CSS = `
.pdf2-root{position:fixed;inset:0;z-index:3000;background:#1c1c1e;color:#fff;display:flex;flex-direction:column;overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.pdf2-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.pdf2-root svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.pdf2-top,.pdf2-annot,.pdf2-bottom{flex-shrink:0;background:#2c2c2e;transition:margin .25s ease,opacity .25s ease}
.pdf2-top{display:flex;align-items:center;gap:8px;height:52px;padding:0 12px;padding-top:env(safe-area-inset-top);box-sizing:content-box}
.pdf2-title{flex:1;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pdf2-pageinfo{font-size:13px;color:#d1d1d6;white-space:nowrap;min-width:64px;text-align:center}
.pdf2-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:40px;height:40px;padding:0 10px;border:none;border-radius:10px;background:rgba(255,255,255,.1);color:#fff;font-size:12px;font-family:inherit;cursor:pointer;flex-shrink:0;white-space:nowrap}
.pdf2-btn:active{background:rgba(255,255,255,.22)}
.pdf2-btn.active{background:#EE220C}
.pdf2-btn:disabled{opacity:.35;cursor:default}
.pdf2-annot{display:flex;flex-direction:column;gap:6px;padding:8px 12px;border-top:1px solid rgba(255,255,255,.08)}
.pdf2-annot.hidden,.pdf2-hidden{display:none}
.pdf2-row{display:flex;align-items:center;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.pdf2-row::-webkit-scrollbar{display:none}
.pdf2-row2{min-height:40px}
.pdf2-sep{width:1px;height:24px;background:rgba(255,255,255,.15);flex-shrink:0;margin:0 4px}
.pdf2-swatch{width:30px;height:30px;border-radius:50%;border:2px solid rgba(255,255,255,.25);padding:0;cursor:pointer;flex-shrink:0}
.pdf2-swatch.active{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.35)}
.pdf2-layer{display:flex;gap:2px;padding:2px;background:rgba(255,255,255,.08);border-radius:10px;flex-shrink:0}
.pdf2-layer .pdf2-btn{height:32px;background:none;border-radius:8px}
.pdf2-layer .pdf2-btn.active.public{background:#1a7a3c}
.pdf2-status{font-size:11px;color:#8e8e93;margin-left:auto;white-space:nowrap;flex-shrink:0}
.pdf2-status.err{color:#ff9f0a}
.pdf2-viewport{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none;background:#1c1c1e;cursor:grab}
.pdf2-world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.pdf2-spread{position:absolute;perspective:3800px;perspective-origin:50% 50%;transform-style:flat}
.pdf2-slot{position:absolute;top:0;overflow:visible}
.pdf2-page{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.pdf2-pagebox{position:relative;background:#fff;box-shadow:0 2px 18px rgba(0,0,0,.45);overflow:hidden;--pw:600px}
.pdf2-pagebox canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none}
.pdf2-pagebox canvas.hl{mix-blend-mode:multiply}
.pdf2-pagebox canvas.hi{width:auto;height:auto}
.pdf2-items{position:absolute;inset:0;pointer-events:none}
.pdf2-item{position:absolute;white-space:pre;line-height:1.15;pointer-events:none}
.pdf2-item.sym-dyn{font-family:"Times New Roman",Georgia,serif;font-style:italic;font-weight:700}
.pdf2-item.selected{outline:2px dashed #0a84ff;outline-offset:3px}
.pdf2-item svg{width:100%;height:auto;stroke-width:2.4;overflow:visible}
.pdf2-leaf{position:absolute;top:0;transform-style:preserve-3d;transform-origin:left center;will-change:transform}
.pdf2-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;overflow:hidden}
.pdf2-face.back{transform:rotateY(180deg)}
.pdf2-leaf .pdf2-pagebox{isolation:isolate}
.pdf2-root input[type=range]{background:transparent!important;border:0!important;padding:0}
.pdf2-paper{background:linear-gradient(90deg,#d9d6cf,#ecebe6 40%,#e4e2dc);width:100%;height:100%}
.pdf2-shade{position:absolute;inset:0;pointer-events:none;opacity:0}
.pdf2-undershade{position:absolute;top:0;pointer-events:none;opacity:0;background:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,0))}
.pdf2-bottom{display:flex;align-items:center;gap:10px;height:44px;padding:0 16px;padding-bottom:env(safe-area-inset-bottom);box-sizing:content-box}
.pdf2-bottom input[type=range]{flex:1;accent-color:#EE220C;height:28px}
.pdf2-toast{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);background:rgba(0,0,0,.82);color:#fff;padding:9px 16px;border-radius:12px;font-size:13px;pointer-events:none;opacity:0;transition:opacity .2s;z-index:20;max-width:90%;text-align:center}
.pdf2-toast.show{opacity:1}
.pdf2-loading{position:absolute;inset:0;background:#1c1c1e;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:15;font-size:14px;text-align:center;padding:24px}
.pdf2-bar{width:min(320px,70%);height:4px;border-radius:2px;background:rgba(255,255,255,.15);overflow:hidden}
.pdf2-bar>i{display:block;height:100%;width:0;background:#EE220C;transition:width .2s}
.pdf2-panel{position:absolute;left:50%;top:12px;transform:translateX(-50%);width:min(440px,92%);background:#2c2c2e;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px;z-index:25;box-shadow:0 10px 40px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:10px}
.pdf2-panel input{width:100%;height:44px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:#1c1c1e;color:#fff;padding:0 12px;font-size:16px;font-family:inherit;-webkit-user-select:text;user-select:text}
.pdf2-panel .pdf2-row{justify-content:flex-end}
@media (max-width:560px){.pdf2-top{gap:5px;padding-left:8px;padding-right:8px}.pdf2-top .pdf2-btn{min-width:36px;height:36px;padding:0 6px}.pdf2-top [data-act="prev"],.pdf2-top [data-act="next"]{display:none}.pdf2-pageinfo{min-width:54px}}
.pdf2-root.chrome-hidden .pdf2-top{margin-top:-60px;opacity:0;pointer-events:none}
.pdf2-root.chrome-hidden .pdf2-bottom{margin-bottom:-60px;opacity:0;pointer-events:none}
.pdf2-root.hide-notes .pdf2-pagebox canvas.hl,.pdf2-root.hide-notes .pdf2-pagebox canvas.ink,.pdf2-root.hide-notes .pdf2-pagebox canvas.leg,.pdf2-root.hide-notes .pdf2-pagebox canvas.hi,.pdf2-root.hide-notes .pdf2-items{visibility:hidden}
.pdf2-root.annotating .pdf2-viewport{cursor:crosshair}
`;

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

// ────────────────────────────────────────────────────────────────────────────
// Kreslení tahů (sdílené pro obrazovku, zvětšený výřez i export)
// ────────────────────────────────────────────────────────────────────────────

// Tah: { id, t: "p"|"h", c: barva, w: šířka (zlomek šířky stránky), p: [x,y,tlak,...] (x,y 0–1), pv: proměnná šířka }
function paintStroke(ctx, s, W, H) {
  const p = s.p, n = p.length / 3;
  if (!n) return;
  ctx.save();
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = s.c; ctx.fillStyle = s.c;
  const base = Math.max(s.w * W, 0.6);
  const wAt = (i) => (s.pv ? base * (0.45 + 1.1 * p[i * 3 + 2]) : base);
  if (n === 1) {
    ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, wAt(0) / 2, 0, Math.PI * 2); ctx.fill();
  } else if (!s.pv) {
    ctx.lineWidth = base;
    ctx.beginPath(); ctx.moveTo(p[0] * W, p[1] * H);
    for (let i = 1; i < n - 1; i++) {
      const x = p[i * 3] * W, y = p[i * 3 + 1] * H;
      ctx.quadraticCurveTo(x, y, (x + p[(i + 1) * 3] * W) / 2, (y + p[(i + 1) * 3 + 1] * H) / 2);
    }
    ctx.lineTo(p[(n - 1) * 3] * W, p[(n - 1) * 3 + 1] * H);
    ctx.stroke();
  } else {
    for (let i = 1; i < n; i++) { // proměnná šířka: po úsecích
      ctx.lineWidth = (wAt(i - 1) + wAt(i)) / 2;
      ctx.beginPath(); ctx.moveTo(p[(i - 1) * 3] * W, p[(i - 1) * 3 + 1] * H); ctx.lineTo(p[i * 3] * W, p[i * 3 + 1] * H); ctx.stroke();
    }
  }
  ctx.restore();
}

function paintItem(ctx, it, W, H) {
  ctx.save();
  ctx.fillStyle = it.c; ctx.strokeStyle = it.c;
  const x = it.x * W, y = it.y * H;
  if (it.k === "text" || (it.k === "sym" && symbolById(it.sym)?.text)) {
    const dyn = it.k === "sym";
    ctx.font = `${dyn ? "italic 700" : "400"} ${it.s * W}px ${dyn ? '"Times New Roman",Georgia,serif' : "-apple-system,Helvetica,Arial,sans-serif"}`;
    ctx.textBaseline = "top";
    (dyn ? (symbolById(it.sym)?.text || "") : (it.t || "")).split("\n").forEach((line, i) => ctx.fillText(line, x, y + i * it.s * W * 1.15));
  } else if (it.k === "sym") {
    const sy = symbolById(it.sym);
    if (sy?.d) {
      const k = (it.s * W) / 100;
      ctx.translate(x, y); ctx.scale(k, k);
      ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.stroke(new Path2D(sy.d));
      if (sy.dot) { ctx.beginPath(); ctx.arc(sy.dot[0], sy.dot[1], 3, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.restore();
}

// Zjednodušení tahu (Douglas–Peucker, v pixelech stránky) — menší data, hladší čára
function simplify(points, W, H, eps) {
  const n = points.length / 3;
  if (n < 3) return points;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const px = (i) => points[i * 3] * W, py = (i) => points[i * 3 + 1] * H;
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, idx = -1;
    const ax = px(a), ay = py(a), bx = px(b), by = py(b);
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-6;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * px(i) - dx * py(i) + bx * ay - by * ax) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(Math.round(points[i * 3] * 1e4) / 1e4, Math.round(points[i * 3 + 1] * 1e4) / 1e4, Math.round(points[i * 3 + 2] * 100) / 100);
  return out;
}

function strokeHit(s, nx, ny, rx, ry) { // je bod (nx,ny) blíž než poloměr? (rx, ry = poloměr ve zlomcích stránky)
  const p = s.p, n = p.length / 3;
  const rw = rx + s.w / 2, rh = ry + (s.w / 2) * (rx ? ry / rx : 1);
  if (n === 1) return Math.abs(p[0] - nx) <= rw && Math.abs(p[1] - ny) <= rh;
  for (let i = 1; i < n; i++) {
    const ax = p[(i - 1) * 3], ay = p[(i - 1) * 3 + 1], bx = p[i * 3], by = p[i * 3 + 1];
    const k = ry / rx || 1; // převod na izotropní měřítko podle poměru stran
    const dx = (bx - ax), dy = (by - ay) / k, ex = nx - ax, ey = (ny - ay) / k;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? clamp((ex * dx + ey * dy) / l2, 0, 1) : 0;
    if (Math.hypot(ex - t * dx, ey - t * dy) <= rw) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Úložiště poznámek: načítání po stránkách, automatické ukládání, záloha v zařízení
// ────────────────────────────────────────────────────────────────────────────
const newLayer = () => ({ strokes: [], items: [], legacy: null, loaded: false, error: false });

class AnnotStore {
  constructor(env, fileId) {
    this.env = env; this.fileId = fileId;
    this.pages = {}; this.loading = {}; this.timers = {}; this.chains = {};
    this.pending = 0; this.failed = 0; this.onStatus = () => {};
    this.outboxKey = "pdf2.outbox." + env.user.uid;
  }
  layerKey(layer) { return layer === "public" ? "public" : this.env.user.uid; }

  load(page) {
    if (this.loading[page]) return this.loading[page];
    const rec = { personal: newLayer(), public: newLayer() };
    this.pages[page] = rec;
    this.loading[page] = Promise.all(["personal", "public"].map(async (layer) => {
      try {
        const r = await this.env.readAnnotPage(this.fileId, this.layerKey(layer), page);
        if (r.v2?.data) {
          try { const d = JSON.parse(r.v2.data); rec[layer].strokes = d.strokes || []; rec[layer].items = d.items || []; }
          catch { rec[layer].error = true; }
        }
        rec[layer].legacy = r.legacy || null;
        rec[layer].loaded = true;
      } catch { rec[layer].error = true; }
    })).then(() => {
      if (rec.personal.error || rec.public.error) delete this.loading[page]; // příště zkusit znovu
      return rec;
    });
    return this.loading[page];
  }
  layer(page, layer) { return this.pages[page]?.[layer]; }

  touch(page, layer) {
    const key = page + "|" + layer;
    clearTimeout(this.timers[key]);
    this.timers[key] = setTimeout(() => this.flushKey(page, layer), 700);
    this.onStatus();
  }
  payload(page, layer) {
    const L = this.layer(page, layer);
    if (!L.strokes.length && !L.items.length) return null;
    return { v: 2, data: JSON.stringify({ strokes: L.strokes, items: L.items }), updatedAt: Date.now() };
  }
  readOutbox() { try { return JSON.parse(lsGet(this.outboxKey, "{}")) || {}; } catch { return {}; } }
  writeOutbox(o) { lsSet(this.outboxKey, JSON.stringify(o)); }

  flushKey(page, layer) {
    const key = page + "|" + layer;
    clearTimeout(this.timers[key]); delete this.timers[key];
    const payload = this.payload(page, layer);
    const lk = this.layerKey(layer), ob = this.fileId + "|" + lk + "|" + page;
    const box = this.readOutbox(); box[ob] = { fileId: this.fileId, layerKey: lk, page, payload }; this.writeOutbox(box); // nejdřív do zařízení
    this.pending++; this.onStatus();
    const run = () => this.env.writeAnnotPage(this.fileId, lk, page, payload).then(() => {
      const b = this.readOutbox(); if (b[ob] && JSON.stringify(b[ob].payload) === JSON.stringify(payload)) delete b[ob]; this.writeOutbox(b); // novější zápis téže stránky zůstane v záloze
      this.failed = 0;
    }).catch((err) => { this.failed++; console.warn("PDF poznámky: uložení selhalo, zůstává v zařízení:", err?.code || err?.message || err); }).finally(() => { this.pending--; this.onStatus(); });
    this.chains[key] = (this.chains[key] || Promise.resolve()).then(run);
    return this.chains[key];
  }
  flushAll() {
    const keys = Object.keys(this.timers);
    return Promise.all(keys.map(k => { const [p, l] = k.split("|"); return this.flushKey(+p, l); }).concat(Object.values(this.chains)));
  }
  async retryOutbox() { // zbylé zápisy z minula (výpadek sítě, zavřená záložka)
    const box = this.readOutbox();
    let bad = 0;
    for (const [k, e] of Object.entries(box)) {
      if (e.layerKey === "public" && !this.env.canEditPublic) continue;
      if (e.layerKey !== "public" && e.layerKey !== this.env.user.uid) continue;
      try {
        await this.env.writeAnnotPage(e.fileId, e.layerKey, e.page, e.payload);
        const b = this.readOutbox(); delete b[k]; this.writeOutbox(b);
      } catch { bad++; }
    }
    this.failed = bad;
    this.onStatus();
  }
  status() {
    if (this.pending || Object.keys(this.timers).length) return "saving";
    if (this.failed || Object.keys(this.readOutbox()).length) return "offline";
    return "saved";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Jedna stránka: PDF bitmapa + vrstvy poznámek + zvětšený výřez
// ────────────────────────────────────────────────────────────────────────────
class PageView {
  constructor(reader, n) {
    this.r = reader; this.n = n;
    this.el = el("div", "pdf2-page");
    this.box = el("div", "pdf2-pagebox", this.el);
    this.pdfC = el("canvas", "pdf", this.box);
    this.legC = el("canvas", "leg", this.box);
    this.hlC = el("canvas", "hl", this.box);
    this.inkC = el("canvas", "ink", this.box);
    this.hiC = el("canvas", "hi", this.box); this.hiC.width = this.hiC.height = 0;
    this.itemsEl = { public: el("div", "pdf2-items", this.box), personal: el("div", "pdf2-items", this.box) };
    this.ratio = reader.ratio;
    this.slotW = 0; this.slotH = 0; this.bw = 0; this.bh = 0;
    this.baseDone = false; this.destroyed = false; this.token = 0; this.region = null; this.hiToken = 0;
    this.used = 0;
  }
  setSlot(w, h) {
    if (w === this.slotW && h === this.slotH) return;
    this.slotW = w; this.slotH = h; this.layoutBox(); this.baseDone = false;
  }
  layoutBox() {
    this.bw = Math.min(this.slotW, this.slotH * this.ratio); this.bh = this.bw / this.ratio;
    this.box.style.width = this.bw + "px"; this.box.style.height = this.bh + "px";
    this.box.style.setProperty("--pw", this.bw + "px");
    for (const l of ["public", "personal"]) for (const it of this.itemsEl[l].children) this.styleItem(it);
  }
  async ensureRendered() {
    if (this.baseDone || this.destroyed || !this.slotW) return;
    const token = ++this.token;
    let page;
    try { page = await this.r.doc.getPage(this.n); } catch { return; }
    if (this.destroyed || token !== this.token) return;
    const v1 = page.getViewport({ scale: 1 });
    const ratio = v1.width / v1.height;
    if (Math.abs(ratio - this.ratio) > 0.002) { this.ratio = ratio; this.layoutBox(); }
    const k = dpr();
    const vp = page.getViewport({ scale: (this.bw * k) / v1.width });
    this.pdfC.width = Math.round(vp.width); this.pdfC.height = Math.round(vp.height);
    try { this.task?.cancel(); } catch { /* nic */ }
    this.task = page.render({ canvasContext: this.pdfC.getContext("2d"), viewport: vp });
    try { await this.task.promise; } catch (e) { if (e?.name === "RenderingCancelledException") return; throw e; }
    if (this.destroyed || token !== this.token) return;
    this.baseDone = true;
    this.page = page;
    await this.drawAnnots();
  }
  // — poznámky —
  async drawAnnots() {
    const rec = await this.r.store.load(this.n);
    if (this.destroyed) return;
    await this.paintLegacy(rec);
    this.paintStrokesBase();
    this.renderItems();
    this.refreshRegion();
    if (this.r.annotating && !this.r.gesture) this.r.updateAnnotUi(); // nabídka „Smazat staré“ podle zobrazených stránek
  }
  async paintLegacy(rec) {
    const fabric = this.r.env.fabric;
    const have = ["public", "personal"].map(l => rec[l].legacy).filter(d => d?.json);
    if (!have.length || !fabric) { this.legC.width = 0; this.legC.height = 0; this.legacyBmp = null; return; }
    const k = dpr();
    this.legC.width = Math.round(this.bw * k); this.legC.height = Math.round(this.bh * k);
    const ctx = this.legC.getContext("2d");
    for (const d of have) {
      try {
        const sc = new fabric.StaticCanvas(null, { width: d.width || 600, height: d.height || 800 });
        await new Promise(res => sc.loadFromJSON(d.json, res));
        sc.renderAll();
        ctx.drawImage(sc.lowerCanvasEl, 0, 0, sc.width, sc.height, 0, 0, this.legC.width, this.legC.height);
        sc.dispose();
      } catch { /* poškozená stará poznámka se přeskočí */ }
    }
    this.legacyBmp = this.legC;
  }
  allStrokes() {
    const rec = this.r.store.pages[this.n];
    if (!rec) return { h: [], p: [] };
    const all = [...rec.public.strokes, ...rec.personal.strokes]; // veřejná dole, osobní nahoře
    return { h: all.filter(s => s.t === "h"), p: all.filter(s => s.t !== "h") };
  }
  paintStrokesBase() {
    const { h, p } = this.allStrokes(), k = dpr();
    for (const [c, list] of [[this.hlC, h], [this.inkC, p]]) {
      if (!list.length) { if (c.width) { c.width = 0; c.height = 0; } continue; }
      c.width = Math.round(this.bw * k); c.height = Math.round(this.bh * k);
      const ctx = c.getContext("2d");
      for (const s of list) paintStroke(ctx, s, c.width, c.height);
    }
  }
  addStrokeBase(s) { // přidání jednoho tahu bez překreslení všeho
    const c = s.t === "h" ? this.hlC : this.inkC, k = dpr();
    if (!c.width) { c.width = Math.round(this.bw * k); c.height = Math.round(this.bh * k); }
    paintStroke(c.getContext("2d"), s, c.width, c.height);
  }
  renderItems() {
    const rec = this.r.store.pages[this.n];
    for (const layer of ["public", "personal"]) {
      const host = this.itemsEl[layer]; host.replaceChildren();
      if (!rec) continue;
      for (const it of rec[layer].items) host.appendChild(this.makeItemEl(it));
    }
  }
  makeItemEl(it) {
    const d = el("div", "pdf2-item" + (it.k === "sym" && symbolById(it.sym)?.text ? " sym-dyn" : ""));
    d.dataset.id = it.id;
    const sy = it.k === "sym" ? symbolById(it.sym) : null;
    if (sy?.d) {
      d.innerHTML = `<svg viewBox="0 0 100 40" style="color:${it.c}"><path d="${sy.d}" stroke="${it.c}" fill="none"/>${sy.dot ? `<circle cx="${sy.dot[0]}" cy="${sy.dot[1]}" r="3" fill="${it.c}" stroke="none"/>` : ""}</svg>`;
    } else {
      d.textContent = sy?.text || it.t || "";
    }
    d.style.color = it.c; d.dataset.k = it.k; d.dataset.s = it.s;
    d.style.left = it.x * 100 + "%"; d.style.top = it.y * 100 + "%";
    this.styleItem(d);
    return d;
  }
  styleItem(d) {
    const s = parseFloat(d.dataset.s) || 0.02;
    if (d.querySelector("svg")) d.style.width = s * this.bw + "px";
    else d.style.fontSize = s * this.bw + "px";
  }
  // — zvětšený výřez (ostré písmo při zoomu) —
  clearRegion() {
    this.hiToken++; this.region = null; this.regionBase = null;
    this.hiC.width = 0; this.hiC.height = 0;
  }
  async renderRegion(rect, scale) { // rect v css px stránky, scale = px na css px
    if (!this.baseDone || this.destroyed || !this.page) return;
    const token = ++this.hiToken;
    const base = document.createElement("canvas");
    base.width = Math.max(1, Math.round(rect.w * scale)); base.height = Math.max(1, Math.round(rect.h * scale));
    const v1 = this.page.getViewport({ scale: 1 });
    const vp = this.page.getViewport({ scale: (this.bw * scale) / v1.width });
    try {
      this.hiTask?.cancel();
      this.hiTask = this.page.render({ canvasContext: base.getContext("2d"), viewport: vp, transform: [1, 0, 0, 1, -rect.x * scale, -rect.y * scale] });
      await this.hiTask.promise;
    } catch (e) { if (e?.name === "RenderingCancelledException") return; return; }
    if (this.destroyed || token !== this.hiToken) return;
    this.regionBase = base; this.region = { ...rect, scale };
    this.refreshRegion();
  }
  refreshRegion() { // složí výřez: PDF + staré poznámky + zvýrazňovač (multiply) + tahy
    const rg = this.region;
    if (!rg || !this.regionBase) return;
    const c = this.hiC;
    c.width = this.regionBase.width; c.height = this.regionBase.height;
    c.style.left = rg.x + "px"; c.style.top = rg.y + "px";
    c.style.width = rg.w + "px"; c.style.height = rg.h + "px";
    const ctx = c.getContext("2d"), W = this.bw * rg.scale, H = this.bh * rg.scale;
    ctx.drawImage(this.regionBase, 0, 0);
    if (this.legacyBmp && this.legC.width) ctx.drawImage(this.legC, 0, 0, this.legC.width, this.legC.height, -rg.x * rg.scale, -rg.y * rg.scale, W, H);
    const { h, p } = this.allStrokes();
    ctx.save(); ctx.translate(-rg.x * rg.scale, -rg.y * rg.scale);
    ctx.globalCompositeOperation = "multiply"; for (const s of h) paintStroke(ctx, s, W, H);
    ctx.globalCompositeOperation = "source-over"; for (const s of p) paintStroke(ctx, s, W, H);
    ctx.restore();
  }
  destroy() {
    this.destroyed = true;
    try { this.task?.cancel(); this.hiTask?.cancel(); } catch { /* nic */ }
    this.pdfC.width = this.hlC.width = this.inkC.width = this.legC.width = this.hiC.width = 0;
    this.el.remove();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Čtečka: rozložení, listování, gesta, nástroje
// ────────────────────────────────────────────────────────────────────────────
class Reader {
  constructor(env, fileId, title) {
    this.env = env; this.fileId = fileId; this.title = title || "Dokument";
    this.views = new Map(); this.cur = 0; this.z = 1; this.tx = 0; this.ty = 0;
    this.ptrs = new Map(); this.gesture = null; this.flip = null; this.flipping = false;
    this.ratio = 595 / 842; this.annotating = false; this.tool = "pen"; this.layer = "personal";
    this.penWidth = "medium"; this.history = []; this.redo = []; this.closed = false;
    this.fingerMode = lsGet("pdf2.fingerMode", "auto"); // auto | draw | nav
    this.penSeen = lsGet("pdf2.penSeen") === "1"; this.penDownUntil = 0; this.penDown = false;
    this.colors = { personal: INK_COLORS[0], public: "#1a7a3c" }; this.hlColor = HL_COLORS[0];
    this.reduceMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.lastTap = null; this.regionTimer = null;
  }

  // — start / konec —
  async start() {
    this.buildDom();
    this.store = new AnnotStore(this.env, this.fileId);
    this.store.onStatus = () => this.updateStatus();
    this.showLoading("Načítám PDF…", true);
    try {
      const buf = await this.env.getPdfBytes(this.fileId, (f) => { const b = this.loadingEl?.querySelector(".pdf2-bar>i"); if (b) b.style.width = Math.round(f * 100) + "%"; });
      this.doc = await this.env.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise; // buffer se předá čtecímu vláknu bez kopie, v paměti zůstává jediná
      this.bytes = null;
    } catch (e) {
      if (this.closed) return;
      const pw = e?.name === "PasswordException";
      this.showLoading(`<div style="color:#ff9f0a">${pw ? "PDF je chráněné heslem." : "PDF se nepodařilo načíst."}</div><div style="color:#8e8e93;font-size:12px">${(e?.message || "").slice(0, 120)}</div>`, false, true);
      return;
    }
    if (this.closed) return;
    this.numPages = this.doc.numPages;
    try { const p1 = await this.doc.getPage(1); const v = p1.getViewport({ scale: 1 }); this.ratio = v.width / v.height; } catch { /* výchozí poměr */ }
    this.hideLoading();
    this.ro = new ResizeObserver(() => { clearTimeout(this.roTimer); this.roTimer = setTimeout(() => { if (!this.flip && !this.closed) this.relayout(); }, 140); });
    this.ro.observe(this.viewport);
    this.layout();
    const last = parseInt(lsGet("pdf2.last." + this.fileId, "1"), 10);
    this.goToSpread(this.pageToSpread(clamp(last || 1, 1, this.numPages)), false);
    this.bindEvents();
    this.store.retryOutbox();
    this.updateStatus(); this.updateAnnotUi();
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    try { await this.store?.flushAll(); } catch { /* zbytek je v záloze zařízení */ }
    this.unbind();
    this.ro?.disconnect();
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    try { this.doc?.destroy(); } catch { /* nic */ }
    this.root.remove(); this.styleEl?.remove();
    this.env.onClosed?.();
  }

  // — DOM —
  buildDom() {
    if (!document.getElementById("pdf2-style")) {
      this.styleEl = el("style"); this.styleEl.id = "pdf2-style"; this.styleEl.textContent = CSS; document.head.appendChild(this.styleEl);
    }
    const root = this.root = el("div", "pdf2-root");
    root.innerHTML = `
      <div class="pdf2-top">
        <button class="pdf2-btn" data-act="close" aria-label="Zavřít">${ICON.close}</button>
        <div class="pdf2-title"></div>
        <button class="pdf2-btn" data-act="prev" aria-label="Předchozí">${ICON.prev}</button>
        <div class="pdf2-pageinfo" data-role="pageinfo">– / –</div>
        <button class="pdf2-btn" data-act="next" aria-label="Další">${ICON.next}</button>
        <button class="pdf2-btn" data-act="notes" aria-label="Skrýt/zobrazit poznámky" title="Skrýt/zobrazit poznámky">${ICON.eye}</button>
        <button class="pdf2-btn" data-act="download" aria-label="Stáhnout" title="Stáhnout">${ICON.download}</button>
        <button class="pdf2-btn" data-act="annotate" aria-label="Poznámky" title="Poznámky">${ICON.pencil}</button>
      </div>
      <div class="pdf2-annot hidden" data-role="annot"></div>
      <div class="pdf2-viewport" data-role="viewport"><div class="pdf2-world" data-role="world"><div class="pdf2-spread" data-role="spread"></div></div></div>
      <div class="pdf2-bottom"><span class="pdf2-pageinfo" data-role="bleft">1</span><input type="range" min="1" max="1" value="1" data-role="slider" aria-label="Stránka"><span class="pdf2-pageinfo" data-role="bright">1</span></div>
      <div class="pdf2-toast" data-role="toast"></div>`;
    root.querySelector(".pdf2-title").textContent = this.title;
    document.body.appendChild(root);
    this.viewport = root.querySelector('[data-role="viewport"]');
    this.world = root.querySelector('[data-role="world"]');
    this.spread = root.querySelector('[data-role="spread"]');
    this.annotBar = root.querySelector('[data-role="annot"]');
    this.slider = root.querySelector('[data-role="slider"]');
    this.slotL = el("div", "pdf2-slot", this.spread); this.slotR = el("div", "pdf2-slot", this.spread);
    this.onClickBound = (e) => this.onClick(e);
    root.addEventListener("click", this.onClickBound);
  }
  q(role) { return this.root.querySelector(`[data-role="${role}"]`); }
  toast(msg, ms = 2200) { const t = this.q("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove("show"), ms); }
  showLoading(html, bar, retry) {
    this.hideLoading();
    const d = this.loadingEl = el("div", "pdf2-loading", this.viewport);
    d.innerHTML = (bar ? `<div>${html}</div><div class="pdf2-bar"><i></i></div>` : html)
      + (retry ? `<div class="pdf2-row"><button class="pdf2-btn" data-act="close">Zavřít</button><button class="pdf2-btn" data-act="legacy">Otevřít starý prohlížeč</button></div>` : "");
  }
  hideLoading() { this.loadingEl?.remove(); this.loadingEl = null; }

  // — rozložení —
  pageToSpread(n) { return this.double ? Math.floor(n / 2) : n - 1; }
  spreadPages(s) { // [levá, pravá]
    if (!this.double) return [null, s + 1];
    if (s === 0) return [null, 1];
    const l = 2 * s, r = 2 * s + 1;
    return [l <= this.numPages ? l : null, r <= this.numPages ? r : null];
  }
  layout() {
    const r = this.viewport.getBoundingClientRect();
    this.vw = r.width; this.vh = r.height;
    const pad = 10;
    this.double = this.vw >= 820 && this.vw >= this.vh * 1.1 && this.numPages > 1;
    const availW = this.double ? (this.vw - pad * 2) / 2 : this.vw - pad * 2, availH = this.vh - pad * 2;
    this.pw = Math.min(availW, availH * this.ratio); this.ph = this.pw / this.ratio;
    this.spreadW = this.double ? this.pw * 2 : this.pw; this.spreadH = this.ph;
    this.numSpreads = this.double ? 1 + Math.ceil((this.numPages - 1) / 2) : this.numPages;
    this.world.style.width = this.vw + "px"; this.world.style.height = this.vh + "px";
    Object.assign(this.spread.style, { width: this.spreadW + "px", height: this.spreadH + "px", left: (this.vw - this.spreadW) / 2 + "px", top: (this.vh - this.spreadH) / 2 + "px" });
    for (const s of [this.slotL, this.slotR]) { s.style.width = this.pw + "px"; s.style.height = this.ph + "px"; }
    this.slotL.style.left = "0px"; this.slotL.style.display = this.double ? "" : "none";
    this.slotR.style.left = this.double ? this.pw + "px" : "0px";
    this.slider.max = String(this.numPages);
    this.applyView();
  }
  relayout() {
    this.clearSelection();
    const page = this.currentPage();
    this.z = 1; this.tx = this.ty = 0;
    this.layout();
    for (const v of this.views.values()) { v.clearRegion(); v.setSlot(this.pw, this.ph); }
    this.goToSpread(this.pageToSpread(page), false);
  }
  currentPage() { const [l, r] = this.spreadPages(this.cur); return r || l || 1; }

  // — zobrazení stránek —
  view(n) {
    if (!n || n < 1 || n > this.numPages) return null;
    let v = this.views.get(n);
    if (!v) { v = new PageView(this, n); this.views.set(n, v); v.setSlot(this.pw, this.ph); }
    v.used = performance.now();
    return v;
  }
  fillSlot(slot, n) {
    slot.replaceChildren();
    const v = this.view(n);
    if (v) { slot.appendChild(v.el); v.ensureRendered(); }
  }
  showSpread(s) {
    const [l, r] = this.spreadPages(s);
    this.fillSlot(this.slotL, l); this.fillSlot(this.slotR, r);
  }
  goToSpread(s, animate) {
    s = clamp(s, 0, this.numSpreads - 1);
    if (animate && s !== this.cur && Math.abs(s - this.cur) === 1 && !this.flipping) { this.turn(s > this.cur ? 1 : -1); return; }
    this.cur = s; this.z = 1; this.tx = this.ty = 0; this.applyView();
    for (const v of this.views.values()) v.clearRegion();
    this.showSpread(s); this.afterSpread();
  }
  afterSpread() {
    const [l, r] = this.spreadPages(this.cur);
    const info = this.double && l && r ? `${l}–${r}` : String(r || l);
    this.q("pageinfo").textContent = `${info} / ${this.numPages}`;
    this.q("bleft").textContent = String(l || r); this.q("bright").textContent = String(this.numPages);
    this.slider.value = String(r || l);
    lsSet("pdf2.last." + this.fileId, String(l || r));
    this.prefetch();
    this.evict();
    if (this.annotating) this.updateAnnotUi();
  }
  prefetch() {
    for (const s of [this.cur + 1, this.cur - 1, this.cur + 2]) {
      if (s < 0 || s >= this.numSpreads) continue;
      for (const n of this.spreadPages(s)) this.view(n)?.ensureRendered();
    }
  }
  evict() {
    const keep = new Set();
    for (const s of [this.cur - 1, this.cur, this.cur + 1, this.cur + 2]) if (s >= 0 && s < this.numSpreads) for (const n of this.spreadPages(s)) if (n) keep.add(n);
    if (this.flip) for (const n of this.flip.pages) keep.add(n);
    for (const [n, v] of [...this.views]) if (!keep.has(n) && this.views.size > 8) { v.destroy(); this.views.delete(n); }
  }

  // — zoom a posun —
  applyView() { this.world.style.transform = `translate(${this.tx}px,${this.ty}px) scale(${this.z})`; }
  clampView(soft) {
    const W = this.spreadW * this.z, H = this.spreadH * this.z;
    const sx = (this.vw - this.spreadW) / 2, sy = (this.vh - this.spreadH) / 2;
    const fit = (size, vsize, off, t) => size <= vsize ? (vsize - size) / 2 - this.z * off : clamp(t, vsize - size - this.z * off, -this.z * off);
    this.tx = fit(W, this.vw, sx, this.tx); this.ty = fit(H, this.vh, sy, this.ty);
    if (!soft) this.applyView();
  }
  zoomAt(nz, cx, cy) {
    nz = clamp(nz, 0.85, 6);
    const k = nz / this.z;
    this.tx = cx - (cx - this.tx) * k; this.ty = cy - (cy - this.ty) * k; this.z = nz;
    this.applyView();
  }
  settleZoom(animate = true) {
    if (this.z < 1.03) { this.z = 1; this.tx = this.ty = 0; }
    this.clampView(true);
    if (animate) { this.world.style.transition = "transform .2s ease"; setTimeout(() => (this.world.style.transition = ""), 220); }
    this.applyView();
    this.scheduleRegion();
  }
  endRegions() { clearTimeout(this.regionTimer); for (const v of this.views.values()) v.clearRegion(); }
  scheduleRegion() {
    clearTimeout(this.regionTimer);
    this.regionTimer = setTimeout(() => this.renderRegions(), 160);
  }
  renderRegions() {
    if (this.closed || this.flip) return;
    const vr = this.viewport.getBoundingClientRect();
    for (const v of this.visibleViews()) {
      if (this.z < 1.25) { v.clearRegion(); continue; }
      const b = v.box.getBoundingClientRect();
      const x0 = Math.max(b.left, vr.left), y0 = Math.max(b.top, vr.top), x1 = Math.min(b.right, vr.right), y1 = Math.min(b.bottom, vr.bottom);
      if (x1 <= x0 || y1 <= y0) { v.clearRegion(); continue; }
      const f = v.bw / b.width; // css px stránky na px obrazovky
      const mx = (x1 - x0) * 0.15, my = (y1 - y0) * 0.15;
      const rx = Math.max(0, (x0 - b.left - mx) * f), ry = Math.max(0, (y0 - b.top - my) * f);
      const rx1 = Math.min(v.bw, (x1 - b.left + mx) * f), ry1 = Math.min(v.bh, (y1 - b.top + my) * f);
      const rect = { x: rx, y: ry, w: rx1 - rx, h: ry1 - ry };
      const scale = Math.min(this.z * dpr(), Math.sqrt(MAX_PX / (rect.w * rect.h)));
      v.renderRegion(rect, scale);
    }
  }
  visibleViews() { return [this.slotL, this.slotR].map(s => s.firstElementChild && [...this.views.values()].find(v => v.el === s.firstElementChild)).filter(Boolean); }

  // — listování (3D otočení listu kolem hřbetu) —
  flipGeometry() { // kde leží list a co je pod ním
    return { x: this.double ? this.pw : 0, w: this.pw, h: this.ph };
  }
  startFlip(a) { // a = index spreadu, od kterého se listuje (a → a+1)
    this.endRegions();
    const [aL, aR] = this.spreadPages(a), [bL, bR] = this.spreadPages(a + 1);
    const g = this.flipGeometry();
    // pod listem: levá strana staré dvoustrany a pravá nové
    this.fillSlot(this.slotL, aL); this.fillSlot(this.slotR, bR);
    const leaf = el("div", "pdf2-leaf", this.spread);
    Object.assign(leaf.style, { left: g.x + "px", width: g.w + "px", height: g.h + "px" });
    const front = el("div", "pdf2-face front", leaf), back = el("div", "pdf2-face back", leaf);
    const fv = this.view(aR), bv = this.double ? this.view(bL) : null;
    if (fv) { front.appendChild(fv.el); fv.ensureRendered(); }
    if (bv) { back.appendChild(bv.el); bv.ensureRendered(); } else back.appendChild(el("div", "pdf2-paper"));
    const shF = el("div", "pdf2-shade", front), shB = el("div", "pdf2-shade", back);
    shF.style.background = "linear-gradient(90deg,rgba(0,0,0,.5),rgba(0,0,0,.05))";
    shB.style.background = "linear-gradient(270deg,rgba(0,0,0,.5),rgba(0,0,0,.05))";
    const under = el("div", "pdf2-undershade", this.spread);
    Object.assign(under.style, { left: g.x + "px", width: g.w + "px", height: g.h + "px" });
    this.flip = { a, leaf, front, back, shF, shB, under, p: 0, pages: [aL, aR, bL, bR].filter(Boolean) };
  }
  setFlip(p) {
    const f = this.flip; if (!f) return;
    p = clamp(p, 0, 1); f.p = p;
    f.leaf.style.transform = `rotateY(${-180 * p}deg)`;
    f.shF.style.opacity = String(Math.min(1, p * 1.4) * 0.9);
    f.shB.style.opacity = String(Math.min(1, (1 - p) * 1.4) * 0.9);
    f.under.style.opacity = String(Math.sin(p * Math.PI) * 0.9);
  }
  endFlip(toNext) {
    const f = this.flip; if (!f) return;
    const target = toNext ? f.a + 1 : f.a;
    f.leaf.remove(); f.under.remove();
    this.flip = null; this.flipping = false;
    this.cur = target; this.z = 1; this.tx = this.ty = 0; this.applyView();
    this.showSpread(target); this.afterSpread();
  }
  animateFlip(from, to, dur) {
    return new Promise((resolve) => {
      if (this.reduceMotion || dur <= 0) { this.setFlip(to); resolve(); return; }
      const t0 = performance.now();
      const step = (now) => {
        const k = clamp((now - t0) / dur, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        this.setFlip(from + (to - from) * e);
        if (k < 1 && !this.closed) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
  }
  async turn(dir) { // dir: +1 další, -1 předchozí
    if (this.flipping || this.closed) return;
    const next = this.cur + dir;
    if (next < 0 || next >= this.numSpreads) { this.toast(dir > 0 ? "Konec dokumentu" : "Začátek dokumentu", 900); return; }
    this.flipping = true;
    if (this.z !== 1) { this.z = 1; this.tx = this.ty = 0; this.applyView(); }
    const a = dir > 0 ? this.cur : this.cur - 1;
    this.startFlip(a);
    this.setFlip(dir > 0 ? 0 : 1);
    await this.animateFlip(dir > 0 ? 0 : 1, dir > 0 ? 1 : 0, 480);
    this.endFlip(dir > 0);
  }
  async finishFlip(velocity) { // po puštění prstu: dokonči nebo vrať
    const f = this.flip; if (!f) return;
    const forward = this.flipDir > 0;
    let complete = forward ? f.p > 0.35 : f.p < 0.65;
    if (Math.abs(velocity) > 0.45) complete = forward ? velocity < 0 : velocity > 0; // rychlý švih rozhoduje
    const target = forward ? (complete ? 1 : 0) : (complete ? 0 : 1);
    await this.animateFlip(f.p, target, 120 + 300 * Math.abs(target - f.p));
    this.endFlip(target === 1);
  }

  // — události —
  bindEvents() {
    const vp = this.viewport;
    this.h = {
      down: (e) => this.onDown(e), move: (e) => this.onMove(e), up: (e) => this.onUp(e),
      cancel: (e) => this.onUp(e, true), wheel: (e) => this.onWheel(e),
      key: (e) => this.onKey(e),
      hide: () => { if (document.visibilityState === "hidden") this.store.flushAll(); },
      pagehide: () => { this.store.flushAll(); }, online: () => this.store.retryOutbox(),
      ctx: (e) => e.preventDefault()
    };
    vp.addEventListener("pointerdown", this.h.down);
    vp.addEventListener("pointermove", this.h.move);
    vp.addEventListener("pointerup", this.h.up);
    vp.addEventListener("pointercancel", this.h.cancel);
    vp.addEventListener("wheel", this.h.wheel, { passive: false });
    vp.addEventListener("contextmenu", this.h.ctx);
    document.addEventListener("keydown", this.h.key);
    document.addEventListener("visibilitychange", this.h.hide);
    window.addEventListener("pagehide", this.h.pagehide);
    window.addEventListener("online", this.h.online);
    this.slider.addEventListener("input", () => { this.q("bleft").textContent = this.slider.value; });
    this.slider.addEventListener("change", () => this.goToSpread(this.pageToSpread(+this.slider.value), false));
  }
  unbind() {
    const vp = this.viewport; if (!this.h) return;
    vp.removeEventListener("pointerdown", this.h.down); vp.removeEventListener("pointermove", this.h.move);
    vp.removeEventListener("pointerup", this.h.up); vp.removeEventListener("pointercancel", this.h.cancel);
    vp.removeEventListener("wheel", this.h.wheel);
    document.removeEventListener("keydown", this.h.key); document.removeEventListener("visibilitychange", this.h.hide);
    window.removeEventListener("pagehide", this.h.pagehide); window.removeEventListener("online", this.h.online);
  }
  onKey(e) {
    if (this.panel) { if (e.key === "Escape") this.closePanel(null); return; }
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); this.turn(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); this.turn(-1); }
    else if (e.key === "Escape") this.close();
    else if (e.key === "+" || e.key === "=") { this.zoomAt(this.z * 1.25, this.vw / 2, this.vh / 2); this.settleZoom(); }
    else if (e.key === "-") { this.zoomAt(this.z / 1.25, this.vw / 2, this.vh / 2); this.settleZoom(); }
    else if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); }
  }
  onWheel(e) {
    e.preventDefault();
    const r = this.viewport.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) { this.zoomAt(this.z * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top); this.clampView(); this.scheduleRegion(); return; }
    if (this.z > 1.02) { this.tx -= e.deltaX; this.ty -= e.deltaY; this.clampView(); this.scheduleRegion(); }
    else {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(d) > 24 && !this.wheelLock) { this.wheelLock = true; setTimeout(() => (this.wheelLock = false), 550); this.turn(d > 0 ? 1 : -1); }
    }
  }

  fingerDraws() { return this.fingerMode === "draw" || (this.fingerMode === "auto" && !this.penSeen); }
  canDrawWith(type) {
    if (!this.annotating || this.tool === "none") return false;
    if (type === "pen" || type === "mouse") return true;
    return this.fingerDraws();
  }

  onDown(e) {
    if (this.panel || e.button > 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    if (e.pointerType === "pen") { this.penSeen = true; lsSet("pdf2.penSeen", "1"); this.penDown = true; if (this.fingerMode === "auto") this.updateAnnotUi(); }
    // dlaň: dokud je pero na displeji (a krátce po něm), dotyky ignoruj
    if (e.pointerType === "touch" && this.annotating && (this.penDown || performance.now() < this.penDownUntil)) return;
    if (this.flipping) return;
    try { this.viewport.setPointerCapture(e.pointerId); } catch { /* nic */ }
    const rect = this.viewport.getBoundingClientRect();
    this.ptrs.set(e.pointerId, { id: e.pointerId, type: e.pointerType, x: e.clientX - rect.left, y: e.clientY - rect.top, cx: e.clientX, cy: e.clientY, x0: e.clientX - rect.left, y0: e.clientY - rect.top, t0: performance.now(), moved: false });
    if (this.ptrs.size === 1) this.beginSingle(e);
    else if (this.ptrs.size === 2) this.beginPinch();
  }
  beginSingle(e) {
    const p = this.ptrs.get(e.pointerId);
    this.gesture = null;
    if (this.canDrawWith(e.pointerType)) {
      if (this.tool === "pen" || this.tool === "highlighter") { if (this.beginStroke(e, p)) return; }
      else if (this.tool === "eraser") { this.gesture = { kind: "erase", id: e.pointerId, removed: [] }; this.eraseAt(p, this.gesture); return; }
      else if (this.tool === "select") {
        const hit = this.itemAt(p.cx, p.cy);
        if (hit) { this.gesture = { kind: "item", id: e.pointerId, hit, moved: false, startX: p.cx, startY: p.cy, ox: hit.item.x, oy: hit.item.y }; this.selectItem(hit); return; }
      } else if (this.tool === "text") { this.gesture = { kind: "tap-text", id: e.pointerId }; return; }
    }
    this.gesture = this.z > 1.02 ? { kind: "pan", sx: p.x, sy: p.y, tx: this.tx, ty: this.ty } : { kind: "swipe", vx: 0, lastX: p.x, lastT: performance.now() };
  }
  beginPinch() {
    if (this.gesture?.kind === "stroke") this.cancelStroke();
    if (this.gesture?.kind === "erase") this.commitErase();
    if (this.flip) { this.cancelFlipImmediate(); }
    const [a, b] = [...this.ptrs.values()];
    this.gesture = {
      kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: this.z, tx0: this.tx, ty0: this.ty,
      mx0: (a.x + b.x) / 2, my0: (a.y + b.y) / 2, mode: null, ids: [a.id, b.id], s0: [[a.x, a.y], [b.x, b.y]]
    };
  }
  onMove(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const rect = this.viewport.getBoundingClientRect();
    p.x = e.clientX - rect.left; p.y = e.clientY - rect.top; p.cx = e.clientX; p.cy = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > (p.type === "touch" ? 9 : 5)) p.moved = true;
    const g = this.gesture; if (!g) return;
    if (g.kind === "stroke" && g.id === e.pointerId) { e.preventDefault(); this.moveStroke(e); }
    else if (g.kind === "erase" && g.id === e.pointerId) this.eraseAt(p, g);
    else if (g.kind === "item" && g.id === e.pointerId) this.dragItem(g, p);
    else if (g.kind === "pan") { this.tx = g.tx + (p.x - g.sx); this.ty = g.ty + (p.y - g.sy); this.clampView(); }
    else if (g.kind === "swipe") this.moveSwipe(g, p);
    else if (g.kind === "flip") this.moveFlip(g, p);
    else if (g.kind === "pinch" && this.ptrs.size >= 2) this.movePinch(g);
  }
  moveSwipe(g, p) {
    const now = performance.now(), dt = now - g.lastT;
    if (dt > 0) g.vx = 0.8 * (g.vx || 0) + 0.2 * ((p.x - g.lastX) / dt);
    g.lastX = p.x; g.lastT = now;
    const dx = p.x - p.x0, dy = p.y - p.y0;
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      const dir = dx < 0 ? 1 : -1;
      const next = this.cur + dir;
      if (next < 0 || next >= this.numSpreads) return;
      this.flipDir = dir; this.flipping = true;
      this.startFlip(dir > 0 ? this.cur : this.cur - 1);
      this.gesture = { kind: "flip", base: dir > 0 ? 0 : 1, vx: g.vx || 0, lastX: p.x, lastT: now, x0: p.x0 };
      this.moveFlip(this.gesture, p);
    }
  }
  moveFlip(g, p) {
    const now = performance.now(), dt = now - g.lastT;
    if (dt > 0) g.vx = 0.7 * g.vx + 0.3 * ((p.x - g.lastX) / dt);
    g.lastX = p.x; g.lastT = now;
    const span = Math.max(this.vw * 0.6, 240), dx = p.x - g.x0;
    this.setFlip(this.flipDir > 0 ? -dx / span : 1 - dx / span);
  }
  movePinch(g) {
    const [a, b] = [...this.ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (g.mode === null) {
      // Rozhoduje směr pohybu OBOU prstů (události prstů chodí zvlášť, vzdálenost by se na začátku krátce klamně měnila):
      // stejný směr = listování (dva prsty vodorovně), opačný = zoom.
      const pa = this.ptrs.get(g.ids[0]), pb = this.ptrs.get(g.ids[1]);
      if (pa && pb) {
        const v1 = [pa.x - g.s0[0][0], pa.y - g.s0[0][1]], v2 = [pb.x - g.s0[1][0], pb.y - g.s0[1][1]];
        const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
        if (l1 >= 12 && l2 >= 12) {
          const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
          const mvx = (v1[0] + v2[0]) / 2, mvy = (v1[1] + v2[1]) / 2;
          if (cos > 0.6 && this.z < 1.03 && Math.abs(mvx) > Math.abs(mvy) * 1.3 && Math.abs(mvx) >= 18) {
            this.flipDir = mvx < 0 ? 1 : -1;
            if (this.cur + this.flipDir < 0 || this.cur + this.flipDir >= this.numSpreads) g.mode = "zoom";
            else {
              g.mode = "flip"; this.flipping = true; this.startFlip(this.flipDir > 0 ? this.cur : this.cur - 1);
              g.fx0 = g.mx0; g.vx = 0; g.lastX = mx; g.lastT = performance.now();
            }
          } else g.mode = "zoom";
        } else if (Math.max(l1, l2) > 60) g.mode = "zoom"; // jeden prst se hýbe, druhý stojí
      }
    }
    if (g.mode === "zoom") {
      const nz = clamp(g.z0 * (d / g.d0), 0.85, 6), k = nz / g.z0;
      this.z = nz;
      this.tx = mx - (g.mx0 - g.tx0) * k; this.ty = my - (g.my0 - g.ty0) * k;
      this.applyView();
    } else if (g.mode === "flip" && this.flip) {
      const now = performance.now(), dt = now - g.lastT;
      if (dt > 0) g.vx = 0.7 * g.vx + 0.3 * ((mx - g.lastX) / dt);
      g.lastX = mx; g.lastT = now;
      const span = Math.max(this.vw * 0.6, 240), dx = mx - g.fx0;
      this.setFlip(this.flipDir > 0 ? -dx / span : 1 - dx / span);
    }
  }
  onUp(e, cancelled) {
    const p = this.ptrs.get(e.pointerId);
    if (e.pointerType === "pen") { this.penDown = false; this.penDownUntil = performance.now() + 350; }
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    try { this.viewport.releasePointerCapture(e.pointerId); } catch { /* nic */ }
    const g = this.gesture;
    const tapOk = !cancelled && !p.moved && performance.now() - p.t0 < 350;
    if (g?.kind === "stroke" && g.id === e.pointerId) { cancelled ? this.cancelStroke() : this.endStroke(); this.gesture = null; return; }
    if (g?.kind === "erase" && g.id === e.pointerId) { this.commitErase(); this.gesture = null; return; }
    if (g?.kind === "item" && g.id === e.pointerId) { this.endItemDrag(g, tapOk); this.gesture = null; return; }
    if (g?.kind === "tap-text" && g.id === e.pointerId) { this.gesture = null; if (tapOk) this.addTextAt(p); return; }
    if (g?.kind === "flip") { this.gesture = null; this.finishFlip(g.vx || 0); return; }
    if (g?.kind === "pinch") {
      if (g.mode === "flip" && this.flip) { this.gesture = null; this.ptrs.clear(); this.finishFlip(g.vx || 0); return; }
      if (this.ptrs.size < 2) {
        const rest = [...this.ptrs.values()][0];
        this.gesture = rest ? { kind: "pan", sx: rest.x, sy: rest.y, tx: this.tx, ty: this.ty } : null;
        if (g.mode === "zoom" || g.mode === null) this.settleZoom();
      }
      return;
    }
    if (g?.kind === "pan") { this.gesture = null; this.scheduleRegion(); if (tapOk) this.onTap(p); return; }
    if (g?.kind === "swipe") { this.gesture = null; if (tapOk) this.onTap(p); return; }
    if (!this.ptrs.size) this.gesture = null;
  }
  onTap(p) {
    const now = performance.now();
    if (this.lastTap && now - this.lastTap.t < 320 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 40) { // dvojité ťuknutí
      this.lastTap = null; clearTimeout(this.tapTimer);
      if (this.z > 1.2) { this.z = 1; this.tx = this.ty = 0; this.settleZoom(); } else { this.zoomAt(2.5, p.x, p.y); this.settleZoom(); }
      return;
    }
    this.lastTap = { t: now, x: p.x, y: p.y };
    clearTimeout(this.tapTimer);
    this.tapTimer = setTimeout(() => this.singleTap(p), 330);
  }
  singleTap(p) {
    if (this.closed || this.z > 1.05) return; // při přiblížení jen dvojité ťuknutí
    const rel = p.x / this.vw;
    const edgeOk = !this.annotating || !this.fingerDraws();
    if (edgeOk && rel < 0.16) this.turn(-1);
    else if (edgeOk && rel > 0.84) this.turn(1);
    else if (!this.annotating) this.root.classList.toggle("chrome-hidden"); // rozložení srovná ResizeObserver
  }
  cancelFlipImmediate() {
    const f = this.flip; if (!f) return;
    f.leaf.remove(); f.under.remove(); this.flip = null; this.flipping = false;
    this.showSpread(this.cur);
  }

  // — kreslení —
  pageAt(cx, cy) {
    for (const v of this.visibleViews()) {
      const b = v.box.getBoundingClientRect();
      if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) return { v, b, nx: (cx - b.left) / b.width, ny: (cy - b.top) / b.height };
    }
    return null;
  }
  activeLayerOk(v) {
    const L = this.store.layer(v.n, this.layer);
    if (!L || !L.loaded) { this.toast("Poznámky stránky se ještě načítají…"); return false; }
    if (L.error) { this.toast("Poznámky této stránky se nepodařilo načíst – úpravy jsou zablokovány"); return false; }
    if (this.layer === "public" && !this.env.canEditPublic) { this.toast("Veřejné poznámky může přidávat jen vedoucí"); return false; }
    return true;
  }
  beginStroke(e, p) {
    const hit = this.pageAt(p.cx, p.cy);
    if (!hit) return false;
    this.store.load(hit.v.n);
    if (!this.activeLayerOk(hit.v)) return false;
    const hl = this.tool === "highlighter";
    const color = hl ? this.hlColor : this.colors[this.layer];
    const w = hl ? HL_WIDTH : PEN_WIDTHS[this.penWidth];
    // živé plátno nad stránkou (ostré i při zoomu)
    const k = Math.min(dpr() * Math.max(this.z, 1), Math.sqrt(MAX_PX / (hit.v.bw * hit.v.bh)));
    const live = document.createElement("canvas");
    live.width = Math.round(hit.v.bw * k); live.height = Math.round(hit.v.bh * k);
    live.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none" + (hl ? ";mix-blend-mode:multiply" : "");
    hit.v.box.insertBefore(live, hit.v.itemsEl.public);
    const s = { id: newId(), t: hl ? "h" : "p", c: color, w, p: [], pv: false };
    this.gesture = { kind: "stroke", id: e.pointerId, v: hit.v, s, live, k, pen: e.pointerType === "pen", last: 0 };
    this.addPoint(this.gesture, e);
    this.paintLive();
    return true;
  }
  addPoint(g, e) {
    const b = g.v.box.getBoundingClientRect();
    const nx = clamp((e.clientX - b.left) / b.width, 0, 1), ny = clamp((e.clientY - b.top) / b.height, 0, 1);
    let pr = e.pointerType === "pen" ? (e.pressure || 0.5) : 0.5;
    if (g.pen && e.pressure > 0 && Math.abs(e.pressure - 0.5) > 0.02) g.s.pv = g.s.pv || g.s.t !== "h";
    g.s.p.push(nx, ny, pr);
  }
  moveStroke(e) {
    const g = this.gesture;
    const evs = e.getCoalescedEvents?.() || [e];
    for (const ev of evs.length ? evs : [e]) this.addPoint(g, ev);
    this.paintLive();
  }
  paintLive() { // rychlé: pero kreslí jen nové úseky, zvýrazňovač přemaže jen svůj obdélník
    const g = this.gesture; if (g?.kind !== "stroke") return;
    const ctx = g.live.getContext("2d"), W = g.live.width, H = g.live.height, s = g.s, p = s.p, n = p.length / 3;
    if (s.t === "h") { // průhledná barva: překreslit celý tah, ale jen v jeho obdélníku
      const pad = Math.ceil(s.w * W) + 2;
      let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      for (let i = 0; i < n; i++) { x0 = Math.min(x0, p[i * 3]); x1 = Math.max(x1, p[i * 3]); y0 = Math.min(y0, p[i * 3 + 1]); y1 = Math.max(y1, p[i * 3 + 1]); }
      ctx.clearRect(x0 * W - pad, y0 * H - pad, (x1 - x0) * W + pad * 2, (y1 - y0) * H + pad * 2);
      paintStroke(ctx, s, W, H);
      return;
    }
    const from = Math.max(g.drawn || 0, 1);
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = s.c; ctx.fillStyle = s.c;
    const base = Math.max(s.w * W, 0.6), wAt = (i) => (s.pv ? base * (0.45 + 1.1 * p[i * 3 + 2]) : base);
    if (n === 1) { ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, wAt(0) / 2, 0, Math.PI * 2); ctx.fill(); }
    for (let i = from; i < n; i++) {
      ctx.lineWidth = (wAt(i - 1) + wAt(i)) / 2;
      ctx.beginPath(); ctx.moveTo(p[(i - 1) * 3] * W, p[(i - 1) * 3 + 1] * H); ctx.lineTo(p[i * 3] * W, p[i * 3 + 1] * H); ctx.stroke();
    }
    ctx.restore();
    g.drawn = n;
  }
  endStroke() {
    const g = this.gesture; if (g?.kind !== "stroke") return;
    g.live.remove();
    const v = g.v, s = g.s;
    s.p = simplify(s.p, v.bw, v.bh, 0.35);
    if (!s.pv) for (let i = 2; i < s.p.length; i += 3) s.p[i] = 0.5;
    const L = this.store.layer(v.n, this.layer);
    if (!L) return;
    L.strokes.push(s);
    v.addStrokeBase(s); v.refreshRegion();
    this.pushHistory({ type: "addStroke", page: v.n, layer: this.layer, stroke: s });
    this.store.touch(v.n, this.layer);
  }
  cancelStroke() { const g = this.gesture; if (g?.kind === "stroke") { g.live.remove(); this.gesture = null; } }

  eraseAt(p, g) {
    const hit = this.pageAt(p.cx, p.cy);
    if (!hit || !this.activeLayerOk(hit.v)) return;
    const L = this.store.layer(hit.v.n, this.layer);
    const rx = 14 / hit.b.width, ry = 14 / hit.b.height;
    let changed = false;
    for (let i = L.strokes.length - 1; i >= 0; i--) {
      if (strokeHit(L.strokes[i], hit.nx, hit.ny, rx, ry)) { g.removed.push({ page: hit.v.n, stroke: L.strokes[i], index: i }); L.strokes.splice(i, 1); changed = true; }
    }
    const it = this.itemAt(p.cx, p.cy);
    if (it && it.layer === this.layer && this.activeLayerOk(hit.v)) { const li = this.store.layer(it.v.n, it.layer); const idx = li.items.indexOf(it.item); if (idx >= 0) { li.items.splice(idx, 1); g.removed.push({ page: it.v.n, item: it.item, index: idx, itemLayer: it.layer }); it.v.renderItems(); changed = true; } }
    if (changed) { hit.v.paintStrokesBase(); hit.v.refreshRegion(); g.pagesTouched = g.pagesTouched || new Set(); g.pagesTouched.add(hit.v.n); }
  }
  commitErase() {
    const g = this.gesture; if (g?.kind !== "erase" || !g.removed.length) return;
    this.pushHistory({ type: "erase", layer: this.layer, removed: g.removed });
    for (const n of new Set(g.removed.map(r => r.page))) this.store.touch(n, this.layer);
  }

  // — položky (text, značky) —
  itemAt(cx, cy) {
    for (const v of this.visibleViews()) {
      for (const layer of ["personal", "public"]) {
        const L = this.store.layer(v.n, layer); if (!L) continue;
        for (const it of L.items) {
          const d = v.itemsEl[layer].querySelector(`[data-id="${it.id}"]`); if (!d) continue;
          const b = d.getBoundingClientRect();
          if (cx >= b.left - 10 && cx <= b.right + 10 && cy >= b.top - 10 && cy <= b.bottom + 10) return { v, item: it, layer, dom: d };
        }
      }
    }
    return null;
  }
  selectItem(hit) {
    this.clearSelection(); this.selected = hit; hit.dom.classList.add("selected"); this.updateAnnotUi();
  }
  clearSelection() { this.selected?.dom?.classList.remove("selected"); this.selected = null; }
  dragItem(g, p) {
    const dx = p.cx - g.startX, dy = p.cy - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < 6) return;
    g.moved = true;
    if (g.hit.layer !== this.layer) return;
    const b = g.hit.v.box.getBoundingClientRect();
    const nx = clamp(g.ox + dx / b.width, 0, 0.98), ny = clamp(g.oy + dy / b.height, 0, 0.98);
    g.hit.item.x = nx; g.hit.item.y = ny;
    g.hit.dom.style.left = nx * 100 + "%"; g.hit.dom.style.top = ny * 100 + "%";
  }
  endItemDrag(g, tapOk) {
    if (g.moved && g.hit.layer === this.layer) {
      this.pushHistory({ type: "moveItem", page: g.hit.v.n, layer: this.layer, id: g.hit.item.id, from: { x: g.ox, y: g.oy }, to: { x: g.hit.item.x, y: g.hit.item.y } });
      this.store.touch(g.hit.v.n, this.layer);
    } else if (tapOk && g.hit.item.k === "text" && g.hit.layer === this.layer) this.editText(g.hit);
  }
  async addTextAt(p) {
    const hit = this.pageAt(p.cx, p.cy);
    if (!hit || !this.activeLayerOk(hit.v)) return;
    const text = await this.askText("Text poznámky", "", false);
    if (!text) return;
    this.addItem(hit.v, { id: newId(), k: "text", x: clamp(hit.nx, 0, 0.95), y: clamp(hit.ny, 0, 0.97), t: text, c: this.colors[this.layer], s: 0.02 });
  }
  async editText(hit) {
    const res = await this.askText("Upravit text", hit.item.t, true);
    if (res === null) return;
    const L = this.store.layer(hit.v.n, hit.layer);
    if (res === "\u0000DELETE" || !res.trim()) { this.removeItem(hit.v, hit.item); return; }
    const before = hit.item.t; hit.item.t = res; hit.v.renderItems();
    this.pushHistory({ type: "textItem", page: hit.v.n, layer: hit.layer, id: hit.item.id, from: before, to: res });
    this.store.touch(hit.v.n, hit.layer); void L;
  }
  addItem(v, item) {
    const L = this.store.layer(v.n, this.layer);
    L.items.push(item); v.renderItems();
    this.pushHistory({ type: "addItem", page: v.n, layer: this.layer, item });
    this.store.touch(v.n, this.layer);
  }
  removeItem(v, item) {
    const layer = this.layer, L = this.store.layer(v.n, layer), idx = L.items.indexOf(item);
    if (idx < 0) return;
    L.items.splice(idx, 1); v.renderItems(); this.clearSelection();
    this.pushHistory({ type: "delItem", page: v.n, layer, item, index: idx });
    this.store.touch(v.n, layer);
  }
  addSymbol(id) {
    if (!this.annotating) return;
    const vr = this.viewport.getBoundingClientRect();
    const hit = this.pageAt(vr.left + vr.width * (this.double ? 0.75 : 0.5), vr.top + vr.height * 0.5) || this.pageAt(vr.left + vr.width / 2, vr.top + vr.height / 2);
    if (!hit || !this.activeLayerOk(hit.v)) return;
    const sy = symbolById(id);
    this.addItem(hit.v, { id: newId(), k: "sym", sym: id, x: 0.4, y: 0.45, c: this.colors[this.layer], s: sy.text ? 0.035 : 0.1 });
    this.setTool("select");
    const added = this.visibleViews().find(x => x === hit.v);
    const it = this.store.layer(hit.v.n, this.layer).items.slice(-1)[0];
    const dom = added?.itemsEl[this.layer].querySelector(`[data-id="${it.id}"]`);
    if (dom) this.selectItem({ v: hit.v, item: it, layer: this.layer, dom });
  }
  askText(title, initial, allowDelete) {
    return new Promise((resolve) => {
      const d = this.panel = el("div", "pdf2-panel", this.root);
      d.innerHTML = `<div style="font-size:13px;color:#d1d1d6">${title}</div><input type="text" maxlength="200" autocomplete="off" autocapitalize="sentences"><div class="pdf2-row">${allowDelete ? '<button class="pdf2-btn" data-p="del" style="margin-right:auto;color:#ff453a">Smazat</button>' : ""}<button class="pdf2-btn" data-p="no">Zrušit</button><button class="pdf2-btn active" data-p="ok">Uložit</button></div>`;
      const input = d.querySelector("input"); input.value = initial || "";
      this.panelResolve = resolve;
      d.addEventListener("click", (ev) => { const b = ev.target.closest("[data-p]"); if (!b) return; ev.stopPropagation(); this.closePanel(b.dataset.p === "ok" ? input.value : b.dataset.p === "del" ? "\u0000DELETE" : null); });
      input.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") this.closePanel(input.value); if (ev.key === "Escape") this.closePanel(null); });
      setTimeout(() => input.focus(), 30);
    });
  }
  closePanel(val) { this.panel?.remove(); this.panel = null; const r = this.panelResolve; this.panelResolve = null; r?.(val); }

  // — historie (zpět / znovu) —
  pushHistory(op) { this.history.push(op); if (this.history.length > 120) this.history.shift(); this.redo = []; this.updateAnnotUi(); }
  viewOf(n) { return this.views.get(n); }
  refreshPage(n) { const v = this.viewOf(n); if (v) { v.paintStrokesBase(); v.renderItems(); v.refreshRegion(); } }
  apply(op, undo) {
    const S = this.store;
    const touch = (n, l) => { this.refreshPage(n); S.touch(n, l); };
    switch (op.type) {
      case "addStroke": { const L = S.layer(op.page, op.layer); if (undo) { const i = L.strokes.indexOf(op.stroke); if (i >= 0) L.strokes.splice(i, 1); } else L.strokes.push(op.stroke); touch(op.page, op.layer); break; }
      case "erase": {
        for (const r of undo ? [...op.removed].reverse() : op.removed) {
          const L = S.layer(r.page, r.itemLayer || op.layer);
          if (r.stroke) { if (undo) L.strokes.splice(Math.min(r.index, L.strokes.length), 0, r.stroke); else { const i = L.strokes.indexOf(r.stroke); if (i >= 0) L.strokes.splice(i, 1); } }
          if (r.item) { if (undo) L.items.splice(Math.min(r.index, L.items.length), 0, r.item); else { const i = L.items.indexOf(r.item); if (i >= 0) L.items.splice(i, 1); } }
          touch(r.page, r.itemLayer || op.layer);
        }
        break;
      }
      case "addItem": { const L = S.layer(op.page, op.layer); if (undo) { const i = L.items.indexOf(op.item); if (i >= 0) L.items.splice(i, 1); } else L.items.push(op.item); touch(op.page, op.layer); break; }
      case "delItem": { const L = S.layer(op.page, op.layer); if (undo) L.items.splice(Math.min(op.index, L.items.length), 0, op.item); else { const i = L.items.indexOf(op.item); if (i >= 0) L.items.splice(i, 1); } touch(op.page, op.layer); break; }
      case "moveItem": { const it = S.layer(op.page, op.layer).items.find(x => x.id === op.id); if (it) { const t = undo ? op.from : op.to; it.x = t.x; it.y = t.y; } touch(op.page, op.layer); break; }
      case "textItem": { const it = S.layer(op.page, op.layer).items.find(x => x.id === op.id); if (it) it.t = undo ? op.from : op.to; touch(op.page, op.layer); break; }
    }
  }
  doUndo() { const op = this.history.pop(); if (!op) return; this.apply(op, true); this.redo.push(op); this.clearSelection(); this.updateAnnotUi(); }
  doRedo() { const op = this.redo.pop(); if (!op) return; this.apply(op, false); this.history.push(op); this.updateAnnotUi(); }

  // — panel nástrojů —
  setTool(t) { this.tool = t; this.clearSelection(); this.updateAnnotUi(); }
  toggleAnnotate() {
    this.annotating = !this.annotating;
    this.root.classList.toggle("annotating", this.annotating);
    this.annotBar.classList.toggle("hidden", !this.annotating);
    const b = this.root.querySelector('[data-act="annotate"]');
    b.classList.toggle("active", this.annotating); b.innerHTML = this.annotating ? ICON.check : ICON.pencil;
    if (!this.annotating) { this.clearSelection(); this.store.flushAll(); }
    this.updateAnnotUi();
  }
  updateAnnotUi() {
    if (!this.annotBar) return;
    const t = this.tool, canPub = this.env.canEditPublic, colors = t === "highlighter" ? HL_COLORS : INK_COLORS;
    const cur = t === "highlighter" ? this.hlColor : this.colors[this.layer];
    const tb = (id, icon, label) => `<button class="pdf2-btn ${t === id ? "active" : ""}" data-tool="${id}">${icon}${label}</button>`;
    const fm = { auto: this.penSeen ? "Prst: listuje" : "Prst: kreslí", draw: "Prst: kreslí", nav: "Prst: listuje" }[this.fingerMode];
    let row2 = "";
    if (t === "pen") row2 = Object.keys(PEN_WIDTHS).map(k => `<button class="pdf2-btn ${this.penWidth === k ? "active" : ""}" data-width="${k}">${{ thin: "Tenké", medium: "Střední", thick: "Silné" }[k]}</button>`).join("") + `<span class="pdf2-sep"></span>`;
    if (t === "pen" || t === "highlighter" || t === "text") row2 += colors.map(c => `<button class="pdf2-swatch ${cur === c ? "active" : ""}" style="background:${c}" data-color="${c}" aria-label="Barva"></button>`).join("");
    if (t === "symbols") row2 = SYMBOLS.map(s => `<button class="pdf2-btn" data-sym="${s.id}" title="${s.title || s.text}">${s.text ? `<i style="font-family:Georgia,serif;font-weight:700">${s.text}</i>` : s.label}</button>`).join("");
    if (t === "select" && this.selected) row2 = `<button class="pdf2-btn" data-act="item-del" style="color:#ff453a">Smazat vybrané</button><button class="pdf2-btn" data-act="item-bigger">Větší</button><button class="pdf2-btn" data-act="item-smaller">Menší</button>`;
    const legacyHere = this.hasLegacyHere();
    this.annotBar.innerHTML = `
      <div class="pdf2-row">
        ${canPub ? `<div class="pdf2-layer"><button class="pdf2-btn ${this.layer === "personal" ? "active" : ""}" data-layer="personal">Osobní</button><button class="pdf2-btn public ${this.layer === "public" ? "active" : ""}" data-layer="public">Veřejné</button></div><span class="pdf2-sep"></span>` : ""}
        ${tb("pen", ICON.pen, "Pero")}${tb("highlighter", ICON.hl, "Zvýrazňovač")}${tb("eraser", ICON.eraser, "Guma")}${tb("text", ICON.text, "Text")}${tb("symbols", ICON.music, "Značky")}${tb("select", ICON.select, "Výběr")}
        <span class="pdf2-sep"></span>
        <button class="pdf2-btn" data-act="undo" ${this.history.length ? "" : "disabled"}>${ICON.undo}</button>
        <button class="pdf2-btn" data-act="redo" ${this.redo.length ? "" : "disabled"}>${ICON.redo}</button>
        <span class="pdf2-sep"></span>
        <button class="pdf2-btn" data-act="finger">${fm}</button>
        ${legacyHere ? `<button class="pdf2-btn" data-act="clear-legacy" title="Smazat poznámky ze starého prohlížeče na této stránce">Smazat staré</button>` : ""}
        <span class="pdf2-status" data-role="status"></span>
      </div>
      <div class="pdf2-row pdf2-row2">${row2}</div>`;
    this.updateStatus();
  }
  hasLegacyHere() {
    if (!this.annotating || !this.store) return false;
    return this.visibleViews().some(v => this.store.layer(v.n, this.layer)?.legacy?.json);
  }
  updateStatus() {
    const s = this.q("status"); if (!s || !this.store) return;
    const st = this.store.status();
    s.className = "pdf2-status" + (st === "offline" ? " err" : "");
    s.textContent = st === "saving" ? "Ukládám…" : st === "offline" ? "Uloženo v zařízení (offline)" : "✓ Uloženo";
  }
  onClick(e) {
    const t = e.target.closest("button"); if (!t || !this.root.contains(t)) return;
    const act = t.dataset.act;
    if (t.dataset.tool) return this.setTool(t.dataset.tool);
    if (t.dataset.layer) { this.layer = t.dataset.layer; this.clearSelection(); return this.updateAnnotUi(); }
    if (t.dataset.width) { this.penWidth = t.dataset.width; return this.updateAnnotUi(); }
    if (t.dataset.color) {
      if (this.tool === "highlighter") this.hlColor = t.dataset.color; else this.colors[this.layer] = t.dataset.color;
      if (this.selected && this.tool === "select") { /* barva vybrané položky se nemění */ }
      return this.updateAnnotUi();
    }
    if (t.dataset.sym) return this.addSymbol(t.dataset.sym);
    switch (act) {
      case "close": return this.close();
      case "legacy": return this.env.openLegacy?.(this.fileId, this.title), this.close();
      case "prev": return this.turn(-1);
      case "next": return this.turn(1);
      case "annotate": return this.toggleAnnotate();
      case "notes": this.root.classList.toggle("hide-notes"); return this.toast(this.root.classList.contains("hide-notes") ? "Poznámky skryté" : "Poznámky zobrazeny", 1200);
      case "download": return this.openDownload();
      case "undo": return this.doUndo();
      case "redo": return this.doRedo();
      case "finger": {
        this.fingerMode = this.fingerMode === "auto" ? (this.penSeen ? "draw" : "nav") : this.fingerMode === "draw" ? "nav" : "draw";
        lsSet("pdf2.fingerMode", this.fingerMode);
        this.toast(this.fingerDraws() ? "Prstem se kreslí" : "Prstem se listuje, kreslí pero", 1800);
        return this.updateAnnotUi();
      }
      case "item-del": if (this.selected) this.removeItem(this.selected.v, this.selected.item); return this.updateAnnotUi();
      case "item-bigger": case "item-smaller": {
        const s = this.selected; if (!s) return;
        s.item.s = clamp(s.item.s * (act === "item-bigger" ? 1.2 : 1 / 1.2), 0.01, 0.4);
        s.v.renderItems(); this.store.touch(s.v.n, s.layer);
        const dom = s.v.itemsEl[s.layer].querySelector(`[data-id="${s.item.id}"]`); if (dom) { s.dom = dom; dom.classList.add("selected"); }
        return;
      }
      case "clear-legacy": return this.clearLegacy();
    }
  }
  async clearLegacy() {
    const vs = this.visibleViews().filter(v => this.store.layer(v.n, this.layer)?.legacy?.json);
    if (!vs.length || !(window.tenDialog ? await window.tenDialog.confirm("Smazat poznámky vytvořené ve starém prohlížeči na zobrazených stránkách? (Nové poznámky zůstanou.)", { ok: "Smazat" }) : confirm("Smazat poznámky vytvořené ve starém prohlížeči na zobrazených stránkách? (Nové poznámky zůstanou.)"))) return;
    for (const v of vs) {
      try { await this.env.deleteLegacyPage(this.fileId, this.store.layerKey(this.layer), v.n); this.store.layer(v.n, this.layer).legacy = null; await v.paintLegacy(this.store.pages[v.n]); v.refreshRegion(); }
      catch { this.toast("Smazání se nepodařilo"); }
    }
    this.updateAnnotUi();
  }

  // — stažení —
  openDownload() {
    const d = this.panel = el("div", "pdf2-panel", this.root);
    d.innerHTML = `<div style="font-size:14px;font-weight:600">Stáhnout PDF</div><div style="font-size:13px;color:#d1d1d6">Kterou verzi chceš stáhnout?</div><div class="pdf2-row" style="flex-wrap:wrap;justify-content:flex-end"><button class="pdf2-btn" data-p="no">Zrušit</button><button class="pdf2-btn" data-p="orig">Bez poznámek (originál)</button><button class="pdf2-btn active" data-p="ann">S poznámkami</button></div>`;
    d.addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-p]"); if (!b) return; ev.stopPropagation();
      this.panel?.remove(); this.panel = null;
      if (b.dataset.p === "no") return;
      this.toast("Připravuji soubor…", 4000);
      try { await (b.dataset.p === "orig" ? this.downloadOriginal() : this.downloadAnnotated()); this.toast("Hotovo", 1200); }
      catch (e) { this.toast("Stažení se nepodařilo: " + (e?.message || ""), 4000); }
    });
  }
  saveBlob(bytes, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  baseName() { return this.title.replace(/\.pdf$/i, ""); }
  async getBytes() { return this.bytes || await this.env.getPdfBytes(this.fileId, () => {}); } // originál se čte znovu z úložiště, nedrží se v paměti
  async downloadOriginal() { this.saveBlob(await this.getBytes(), this.baseName() + ".pdf"); }
  async downloadAnnotated() {
    const PDFLib = this.env.PDFLib; if (!PDFLib) throw new Error("chybí knihovna PDF");
    await this.store.flushAll();
    const out = await PDFLib.PDFDocument.load(await this.getBytes());
    const pages = out.getPages();
    const keys = [["public", "public"], ["personal", this.env.user.uid]];
    const data = {};
    for (const [layer, lk] of keys) data[layer] = await this.env.readAllAnnot(this.fileId, lk);
    for (let i = 0; i < pages.length; i++) {
      const n = i + 1, { width, height } = pages[i].getSize();
      const W = Math.round(width * 2), H = Math.round(height * 2);
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      let drawn = false;
      for (const [layer] of keys) {
        const d = data[layer], live = this.store.pages[n]?.[layer];
        const leg = d.legacy?.[n];
        if (leg?.json && this.env.fabric) {
          try { const sc = new this.env.fabric.StaticCanvas(null, { width: leg.width, height: leg.height }); await new Promise(r => sc.loadFromJSON(leg.json, r)); sc.renderAll(); ctx.drawImage(sc.lowerCanvasEl, 0, 0, sc.width, sc.height, 0, 0, W, H); sc.dispose(); drawn = true; } catch { /* přeskočit */ }
        }
        let strokes = [], items = [];
        if (live && live.loaded) { strokes = live.strokes; items = live.items; }
        else if (d.v2?.[n]?.data) { try { const j = JSON.parse(d.v2[n].data); strokes = j.strokes || []; items = j.items || []; } catch { /* nic */ } }
        for (const s of strokes) { paintStroke(ctx, s, W, H); drawn = true; }
        for (const it of items) { paintItem(ctx, it, W, H); drawn = true; }
      }
      if (!drawn) continue;
      const png = await new Promise(r => c.toBlob(r, "image/png")).then(b => b.arrayBuffer());
      pages[i].drawImage(await out.embedPng(png), { x: 0, y: 0, width, height });
    }
    this.saveBlob(await out.save(), this.baseName() + "_anotovano.pdf");
  }
}

export function createPdfReader(env) {
  let active = null;
  return {
    async open(fileId, title) {
      if (active) await active.close();
      const r = new Reader(env, fileId, title);
      active = r;
      const done = r.env.onClosed;
      r.env = { ...env, onClosed: () => { if (active === r) active = null; done?.(); } };
      await r.start();
      return r;
    },
    close() { return active?.close(); },
    isOpen() { return !!active && !active.closed; },
    get current() { return active; }
  };
}

// exportováno pro testy
export const _internals = { paintStroke, paintItem, simplify, strokeHit, AnnotStore };
