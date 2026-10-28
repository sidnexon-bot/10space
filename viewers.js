/* 10space – přehrávač médií a prohlížeče dokumentů.
   Načítá se jako samostatný modul za hlavním skriptem; s aplikací se potkává přes
   window.__tenCtx (auth, FUNCTIONS) a window.driveFiles. Do hlavního skriptu zasahuje
   jediným voláním window.tenViewers.open(...) v handleDriveNameClick.
   Vypnutí: odebrat <script src="viewers.js"> a <link href="viewers.css">, aplikace se
   vrátí k původnímu otevírání (PDF viewer / Google Drive). */

const CDN = {
  mammoth: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js",
  xlsx: "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  tone: "https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js",
  midi: "https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/build/Midi.js",
  jszip: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.2/jszip.min.js"
};
const loaded = {};
const loadScript = (key) => loaded[key] ||= new Promise((resolve, reject) => {
  const s = document.createElement("script");
  s.src = CDN[key]; s.onload = resolve; s.onerror = () => { delete loaded[key]; reject(new Error("Nepodařilo se načíst knihovnu (" + key + ")")); };
  document.head.appendChild(s);
});

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 5v14M19 5v14L8.5 12z" fill="currentColor"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M18 5v14M5 5v14l10.5-7z" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><text x="12" y="15.5" font-size="7.5" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">10</text></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/><text x="12" y="15.5" font-size="7.5" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">10</text></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
  loop: '<svg viewBox="0 0 24 24"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M16 9l6 6M22 9l-6 6"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
};

/* ── Rozpoznání typu ─────────────────────────────────────────────── */
const EXT = {
  audio: ["mp3", "wav", "m4a", "aac", "ogg", "oga", "opus", "flac", "weba", "wma"],
  midi: ["mid", "midi", "kar"],
  video: ["mp4", "m4v", "mov", "webm", "ogv", "ts", "mkv", "avi"],
  word: ["docx", "doc", "odt", "rtf"],
  sheet: ["xlsx", "xls", "ods", "csv"],
  slides: ["pptx", "ppt", "odp"],
  text: ["txt", "md", "json", "log"]
};
const extOf = (name) => (String(name || "").split(".").pop() || "").toLowerCase();
function kindOf(mime, name) {
  const m = String(mime || "").toLowerCase(), e = extOf(name);
  if (m === "application/pdf" || e === "pdf") return "pdf";
  if (m === "audio/mid" || m === "audio/midi" || m === "audio/x-midi" || EXT.midi.includes(e)) return "midi";
  if (m.startsWith("audio/") || (m === "application/octet-stream" && EXT.audio.includes(e))) return "audio";
  if (m.startsWith("video/") || (m === "application/octet-stream" && EXT.video.includes(e))) return "video";
  if (m === "application/vnd.google-apps.document" || m.includes("wordprocessingml") || m === "application/msword" || m.includes("opendocument.text") || m === "application/rtf" || (m === "application/octet-stream" && EXT.word.includes(e))) return "word";
  if (m === "application/vnd.google-apps.spreadsheet" || m.includes("spreadsheetml") || m.includes("ms-excel") || m.includes("opendocument.spreadsheet") || (m === "application/octet-stream" && EXT.sheet.includes(e))) return "sheet";
  if (m === "application/vnd.google-apps.presentation" || m.includes("presentationml") || m.includes("ms-powerpoint") || m.includes("opendocument.presentation") || (m === "application/octet-stream" && EXT.slides.includes(e))) return "slides";
  if (m === "text/csv" || e === "csv") return "sheet";
  if (m.startsWith("text/") || m === "application/json" || EXT.text.includes(e)) return "text";
  return "other";
}
const isNative = (mime) => String(mime || "").startsWith("application/vnd.google-apps.");
const DOC = {
  word: { app: "Word", ext: "docx", google: "Dokumentech", viewable: (m, e) => isNative(m) || e === "docx" },
  sheet: { app: "Excel", ext: "xlsx", google: "Tabulkách", viewable: (m, e) => isNative(m) || ["xlsx", "xls", "ods", "csv"].includes(e) || m === "text/csv" },
  slides: { app: "PowerPoint", ext: "pptx", google: "Prezentacích", viewable: (m, e) => isNative(m) || e === "pptx" }
};
const MEDIA_MIME = { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", weba: "audio/webm", mp4: "video/mp4", m4v: "video/mp4", mov: "video/mp4", webm: "video/webm", ogv: "video/ogg" };

/* ── Stahování souborů z backendu ────────────────────────────────── */
const cache = new Map(); // id → Blob, posledních pár souborů, ať se nestahuje dvakrát
function remember(id, blob) { if (blob.size > 12 * 1048576) return; /* velké soubory se v paměti nedrží */ cache.set(id, blob); while (cache.size > 4) cache.delete(cache.keys().next().value); }
async function fetchFile(id, { onProgress, signal } = {}) {
  if (cache.has(id)) { const b = cache.get(id); onProgress?.(1, b.size); return b; }
  const { auth, FUNCTIONS } = window.__tenCtx;
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(`${FUNCTIONS.getFileStream}?driveFileId=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!res.ok) { let msg = res.status === 403 ? "Přístup odepřen" : "Soubor se nepodařilo načíst (" + res.status + ")"; try { msg = (await res.json()).error || msg; } catch (e) { /* bez JSON */ } throw new Error(msg); }
  const total = +res.headers.get("Content-Length") || 0, type = res.headers.get("Content-Type") || "";
  if (!res.body || !res.body.getReader) { const b = await res.blob(); remember(id, b); return b; }
  const reader = res.body.getReader(), chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress?.(total ? got / total : null, got); }
  const blob = new Blob(chunks, { type });
  remember(id, blob); return blob;
}
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const fmtSize = (n) => !n ? "" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB";
const fmtTime = (t) => { if (!isFinite(t)) return "0:00"; t = Math.max(0, Math.floor(t)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); };
const toast = (msg) => { try { if (typeof window.showToast === "function") return window.showToast(msg); } catch (e) { /* bez toastu */ } alert(msg); };

/* ════════════════════════════════════════════════════════════════════
   PŘEHRÁVAČ
   ════════════════════════════════════════════════════════════════════ */
const SPEEDS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2];
const mp = { el: null, eng: null, queue: [], idx: -1, loop: "off", a: null, b: null, token: 0, raf: 0, abort: null, urls: [] };

function htmlEngine(blob, kind, mime, ext, host) {
  const el = document.createElement(kind === "video" ? "video" : "audio");
  el.playsInline = true; el.preload = "auto";
  host.appendChild(el);
  let type = MEDIA_MIME[ext] || mime || blob.type;
  const typed = new Blob([blob], { type });
  const url = URL.createObjectURL(typed); mp.urls.push(url); el.src = url;
  const e = {
    el, kind, canRate: true,
    ready: new Promise((res, rej) => { el.addEventListener("loadedmetadata", res, { once: true }); el.addEventListener("error", () => rej(new Error("Prohlížeč tento formát nepřehraje")), { once: true }); }),
    play: () => el.play(), pause: () => el.pause(),
    get t() { return el.currentTime; }, set t(v) { el.currentTime = v; },
    get dur() { return el.duration; }, get paused() { return el.paused; },
    set rate(v) { el.playbackRate = v; }, set vol(v) { el.volume = v; el.muted = v === 0; },
    onEnd: (cb) => el.addEventListener("ended", cb), destroy: () => { el.pause(); el.removeAttribute("src"); el.load(); el.remove(); }
  };
  return e;
}

/* MIDI: prohlížeče ho nepřehrají, hraje ho jednoduchý syntetizér (Tone.js). Noty se plánují po
   vteřinách dopředu, takže přetáčení a změna rychlosti fungují stejně jako u zvuku. */
async function midiEngine(blob) {
  await Promise.all([loadScript("tone"), loadScript("midi")]);
  const Tone = window.Tone, midi = new window.Midi(await blob.arrayBuffer());
  const notes = [];
  midi.tracks.forEach((tr) => { if (tr.instrument?.percussion) return; tr.notes.forEach((n) => notes.push({ t: n.time, d: Math.max(0.05, n.duration), name: n.name, v: n.velocity })); });
  notes.sort((x, y) => x.t - y.t);
  const synth = new Tone.PolySynth(Tone.Synth, { maxPolyphony: 48, oscillator: { type: "triangle" }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.5 } });
  const gain = new Tone.Gain(0.7).toDestination(); synth.connect(gain);
  let playing = false, pos = 0, startedAt = 0, rate = 1, next = 0, timer = 0, endCb = null;
  const cur = () => playing ? Math.min(midi.duration, pos + (Tone.now() - startedAt) * rate) : pos;
  const pump = () => {
    const now = cur(), horizon = now + 1.2 * rate;
    while (next < notes.length && notes[next].t < horizon) {
      const n = notes[next++]; if (n.t < now - 0.05) continue;
      try { synth.triggerAttackRelease(n.name, n.d / rate, startedAt + (n.t - pos) / rate, n.v); } catch (e) { /* přeplněná polyfonie */ }
    }
    if (now >= midi.duration) { stop(); pos = 0; endCb?.(); }
  };
  const stop = () => { if (playing) pos = cur(); playing = false; clearInterval(timer); synth.releaseAll(); };
  const start = async () => { await Tone.start(); pos = Math.min(pos, midi.duration); startedAt = Tone.now() + 0.05; next = notes.findIndex((n) => n.t >= pos - 0.05); if (next < 0) next = notes.length; playing = true; timer = setInterval(pump, 150); pump(); };
  return {
    kind: "midi", canRate: true, ready: Promise.resolve(),
    play: start, pause: stop,
    get t() { return cur(); }, set t(v) { const was = playing; stop(); pos = Math.max(0, Math.min(v, midi.duration)); if (was) start(); },
    get dur() { return midi.duration; }, get paused() { return !playing; },
    set rate(v) { const was = playing; stop(); rate = v; if (was) start(); }, set vol(v) { gain.gain.value = 0.7 * v; },
    onEnd: (cb) => { endCb = cb; }, destroy: () => { stop(); synth.dispose(); gain.dispose(); }
  };
}

function mediaQueueFor(id) {
  const files = window.driveFiles || {}, me = files[id];
  const same = Object.entries(files).filter(([, f]) => f.parentId === me?.parentId && ["audio", "midi", "video"].includes(kindOf(f.mimeType, f.name)));
  same.sort(([, a], [, b]) => String(a.name).localeCompare(String(b.name), "cs", { numeric: true }));
  const q = same.map(([fid, f]) => ({ id: fid, name: f.name, mime: f.mimeType, size: +f.size || 0 }));
  return q.some((x) => x.id === id) ? q : [{ id, name: me?.name || "Soubor", mime: me?.mimeType, size: +me?.size || 0 }];
}

function ensurePlayerDom() {
  if ($("#mp-overlay")) return;
  const d = document.createElement("div");
  d.id = "mp-overlay"; d.className = "mp-overlay";
  d.innerHTML = `
    <div class="mp-card" role="dialog" aria-modal="true" aria-label="Přehrávač">
      <div class="mp-head"><div class="mp-head-text"><div class="mp-title" id="mp-title"></div><div class="mp-sub" id="mp-sub"></div></div>
        <button class="mp-icon" id="mp-dl" title="Stáhnout" aria-label="Stáhnout">${ICON.down}</button>
        <button class="mp-icon" id="mp-close" title="Zavřít" aria-label="Zavřít">${ICON.close}</button></div>
      <div class="mp-stage" id="mp-stage"></div>
      <div class="mp-status" id="mp-status"></div>
      <div class="mp-seek"><span id="mp-cur">0:00</span><div class="mp-track"><div class="mp-ab" id="mp-ab"></div><input type="range" id="mp-range" min="0" max="1000" value="0" aria-label="Pozice"></div><span id="mp-dur">0:00</span></div>
      <div class="mp-controls">
        <button class="mp-icon" id="mp-prev" aria-label="Předchozí">${ICON.prev}</button>
        <button class="mp-icon" id="mp-back" aria-label="Zpět o 10 s">${ICON.back}</button>
        <button class="mp-play" id="mp-play" aria-label="Přehrát">${ICON.play}</button>
        <button class="mp-icon" id="mp-fwd" aria-label="Vpřed o 10 s">${ICON.fwd}</button>
        <button class="mp-icon" id="mp-next" aria-label="Další">${ICON.next}</button>
      </div>
      <div class="mp-row">
        <button class="mp-chip" id="mp-speed" title="Rychlost">1×</button>
        <button class="mp-chip" id="mp-loop" title="Opakování">${ICON.loop}<span>Vyp.</span></button>
        <button class="mp-chip" id="mp-ab-btn" title="Smyčka A–B: nastaví začátek, konec a zruší">A–B</button>
        <div class="mp-vol"><button class="mp-icon" id="mp-mute" aria-label="Ztlumit">${ICON.vol}</button><input type="range" id="mp-vol" min="0" max="100" value="100" aria-label="Hlasitost"></div>
      </div>
      <div class="mp-queue" id="mp-queue"></div>
    </div>`;
  document.body.appendChild(d);
  d.addEventListener("click", (e) => { if (e.target === d) closePlayer(); });
  $("#mp-close").onclick = closePlayer;
  $("#mp-play").onclick = () => togglePlay();
  $("#mp-back").onclick = () => seekBy(-10);
  $("#mp-fwd").onclick = () => seekBy(10);
  $("#mp-prev").onclick = () => step(-1);
  $("#mp-next").onclick = () => step(1);
  $("#mp-speed").onclick = cycleSpeed;
  $("#mp-loop").onclick = cycleLoop;
  $("#mp-ab-btn").onclick = cycleAB;
  $("#mp-dl").onclick = downloadCurrent;
  $("#mp-mute").onclick = () => { const v = $("#mp-vol"); v.value = +v.value ? 0 : 100; applyVolume(); };
  $("#mp-vol").oninput = applyVolume;
  const range = $("#mp-range");
  range.addEventListener("input", () => { if (mp.eng && isFinite(mp.eng.dur)) { mp.eng.t = range.value / 1000 * mp.eng.dur; paint(); } });
}

const cur = () => mp.queue[mp.idx];
const applyVolume = () => { const v = $("#mp-vol").value / 100; if (mp.eng) mp.eng.vol = v; $("#mp-mute").innerHTML = v ? ICON.vol : ICON.mute; };
function togglePlay() { if (!mp.eng) return; if (mp.eng.paused) Promise.resolve(mp.eng.play()).catch(() => {}); else mp.eng.pause(); paint(); }
function seekBy(s) { if (mp.eng) { mp.eng.t = Math.max(0, Math.min(mp.eng.dur || 0, mp.eng.t + s)); paint(); } }
function step(dir) { if (mp.queue.length < 2) return; loadTrack((mp.idx + dir + mp.queue.length) % mp.queue.length, true); }
function cycleSpeed() { const b = $("#mp-speed"), cur = parseFloat(b.dataset.v || "1"), n = SPEEDS[(SPEEDS.indexOf(cur) + 1) % SPEEDS.length]; setSpeed(n); }
function setSpeed(n) { const b = $("#mp-speed"); b.dataset.v = n; b.textContent = n + "×"; if (mp.eng) mp.eng.rate = n; }
function cycleLoop() { mp.loop = { off: "all", all: "one", one: "off" }[mp.loop]; $("#mp-loop span").textContent = { off: "Vyp.", all: "Vše", one: "Jedna" }[mp.loop]; $("#mp-loop").classList.toggle("on", mp.loop !== "off"); }
function cycleAB() {
  if (!mp.eng) return;
  if (mp.a == null) mp.a = mp.eng.t; else if (mp.b == null) { mp.b = mp.eng.t; if (mp.b <= mp.a + 0.3) { mp.a = mp.b = null; } } else { mp.a = mp.b = null; }
  paint();
}
async function downloadCurrent() { const c = cur(); if (!c) return; try { saveBlob(await fetchFile(c.id), c.name); } catch (e) { toast(e.message); } }

function paint() {
  const e = mp.eng; if (!e) return;
  const dur = e.dur, t = e.t, ok = isFinite(dur) && dur > 0;
  $("#mp-cur").textContent = fmtTime(t); $("#mp-dur").textContent = ok ? fmtTime(dur) : "0:00";
  const r = $("#mp-range"); if (document.activeElement !== r) r.value = ok ? Math.round(t / dur * 1000) : 0;
  $("#mp-play").innerHTML = e.paused ? ICON.play : ICON.pause; $("#mp-play").setAttribute("aria-label", e.paused ? "Přehrát" : "Pozastavit");
  const ab = $("#mp-ab"), btn = $("#mp-ab-btn");
  if (ok && mp.a != null) { ab.style.display = "block"; ab.style.left = mp.a / dur * 100 + "%"; ab.style.width = ((mp.b ?? mp.a) - mp.a) / dur * 100 + "%"; } else ab.style.display = "none";
  btn.textContent = mp.a == null ? "A–B" : mp.b == null ? "A → B?" : "A–B ✕"; btn.classList.toggle("on", mp.a != null);
  if (mp.a != null && mp.b != null && t >= mp.b) e.t = mp.a;
}
const tick = () => { paint(); mp.raf = requestAnimationFrame(tick); };

function renderQueue() {
  const q = $("#mp-queue"); q.style.display = mp.queue.length > 1 ? "" : "none";
  q.innerHTML = mp.queue.map((x, i) => `<button class="mp-q${i === mp.idx ? " cur" : ""}" data-i="${i}"><span class="mp-q-ic">${ICON.note}</span><span class="mp-q-name">${esc(x.name)}</span><span class="mp-q-size">${fmtSize(x.size)}</span></button>`).join("");
  q.querySelectorAll(".mp-q").forEach((b) => b.onclick = () => loadTrack(+b.dataset.i, true));
  $(".mp-q.cur", q)?.scrollIntoView({ block: "nearest" });
}

async function loadTrack(i, autoplay) {
  const my = ++mp.token; mp.idx = i; const c = cur();
  mp.abort?.abort(); mp.abort = new AbortController();
  if (mp.eng) { try { mp.eng.destroy(); } catch (e) { /* už zničeno */ } mp.eng = null; }
  mp.urls.forEach((u) => URL.revokeObjectURL(u)); mp.urls = []; mp.a = mp.b = null;
  const kind = kindOf(c.mime, c.name), stage = $("#mp-stage"), status = $("#mp-status");
  stage.innerHTML = ""; stage.className = "mp-stage " + kind;
  if (kind !== "video") stage.innerHTML = `<div class="mp-art">${ICON.note}</div>`;
  $("#mp-title").textContent = c.name; $("#mp-sub").textContent = (kind === "midi" ? "MIDI" : kind === "video" ? "Video" : "Audio") + (c.size ? " · " + fmtSize(c.size) : "") + (mp.queue.length > 1 ? ` · ${i + 1} z ${mp.queue.length}` : "");
  $("#mp-speed").disabled = false; paint0();
  renderQueue();
  status.className = "mp-status"; status.innerHTML = `<div class="mp-bar"><i style="width:0%"></i></div><span>Načítání…</span>`;
  const bar = $("i", status), label = $("span", status);
  try {
    const blob = await fetchFile(c.id, { signal: mp.abort.signal, onProgress: (f, got) => { if (my !== mp.token) return; if (f != null) { bar.style.width = Math.round(f * 100) + "%"; label.textContent = `Načítání ${Math.round(f * 100)} %`; } else label.textContent = `Načítání ${fmtSize(got)}`; } });
    if (my !== mp.token) return;
    let eng;
    if (kind === "midi") eng = await midiEngine(blob); else eng = htmlEngine(blob, kind, c.mime, extOf(c.name), stage);
    if (my !== mp.token) { eng.destroy(); return; }
    await eng.ready; if (my !== mp.token) { eng.destroy(); return; }
    mp.eng = eng; status.className = "mp-status hidden";
    eng.onEnd(() => { if (my !== mp.token) return; if (mp.loop === "one") { eng.t = 0; eng.play(); } else if (mp.queue.length > 1 && (mp.loop === "all" || mp.idx < mp.queue.length - 1)) step(1); else paint(); });
    applyVolume(); setSpeed(parseFloat($("#mp-speed").dataset.v || "1"));
    setMediaSession(c);
    if (mp.startAt) { try { eng.t = mp.startAt; } catch (e) { /* nelze přetočit */ } mp.startAt = 0; }
    if (autoplay) { try { await eng.play(); } catch (e) { /* prohlížeč vyžaduje klepnutí */ } }
  } catch (err) {
    if (my !== mp.token || err.name === "AbortError") return;
    status.className = "mp-status err";
    status.innerHTML = `<span>${esc(err.message || "Nelze přehrát")}</span><button class="mp-chip" id="mp-err-dl">Stáhnout soubor</button>`;
    $("#mp-err-dl").onclick = downloadCurrent;
  }
}
function paint0() { $("#mp-cur").textContent = "0:00"; $("#mp-dur").textContent = "0:00"; $("#mp-range").value = 0; $("#mp-play").innerHTML = ICON.play; $("#mp-ab").style.display = "none"; }

function setMediaSession(c) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: c.name.replace(/\.[^.]+$/, ""), artist: "10space" });
    const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { /* nepodporováno */ } };
    h("play", togglePlay); h("pause", togglePlay); h("previoustrack", () => step(-1)); h("nexttrack", () => step(1));
    h("seekbackward", () => seekBy(-10)); h("seekforward", () => seekBy(10));
  } catch (e) { /* bez Media Session */ }
}

function onKey(e) {
  if (!$("#mp-overlay")?.classList.contains("open")) return;
  if (e.target.matches?.("input[type=text], textarea")) return;
  if (e.key === "Escape") { e.preventDefault(); closePlayer(); }
  else if (e.key === " " && !e.target.matches?.("button")) { e.preventDefault(); togglePlay(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); seekBy(e.shiftKey ? -30 : -5); }
  else if (e.key === "ArrowRight") { e.preventDefault(); seekBy(e.shiftKey ? 30 : 5); }
  else if (e.key.toLowerCase() === "n") step(1); else if (e.key.toLowerCase() === "p") step(-1);
}

function openPlayer(id, opt) {
  ensurePlayerDom(); mp.startAt = (opt && opt.startAt) || 0; mp.autoplayFirst = !(opt && opt.autoplay === false);
  mp.queue = mediaQueueFor(id); mp.loop = "off"; $("#mp-loop span").textContent = "Vyp."; $("#mp-loop").classList.remove("on");
  $("#mp-speed").dataset.v = "1"; $("#mp-speed").textContent = "1×";
  $("#mp-overlay").classList.add("open"); document.body.classList.add("mp-lock");
  document.addEventListener("keydown", onKey); cancelAnimationFrame(mp.raf); tick();
  loadTrack(mp.queue.findIndex((x) => x.id === id), mp.autoplayFirst);
}
function closePlayer() {
  mp.token++; mp.abort?.abort(); cancelAnimationFrame(mp.raf);
  if (mp.eng) { try { mp.eng.destroy(); } catch (e) { /* už zničeno */ } mp.eng = null; }
  mp.urls.forEach((u) => URL.revokeObjectURL(u)); mp.urls = [];
  $("#mp-overlay")?.classList.remove("open"); document.body.classList.remove("mp-lock");
  document.removeEventListener("keydown", onKey);
  if ("mediaSession" in navigator) { try { navigator.mediaSession.metadata = null; } catch (e) { /* nic */ } }
}

/* ════════════════════════════════════════════════════════════════════
   DOKUMENTY: volba, stažení, náhled přímo v 10space
   ════════════════════════════════════════════════════════════════════ */
function downloadName(file, kind) {
  const d = DOC[kind], base = String(file.name || "dokument");
  return isNative(file.mime) ? base.replace(/\.[^.]+$/, "") + "." + d.ext : base;
}
async function downloadDoc(file, kind) {
  const spinner = window.showSpinner; try { spinner?.("Stahování…"); saveBlob(await fetchFile(file.id), downloadName(file, kind)); } catch (e) { toast("Chyba: " + e.message); } finally { try { window.hideSpinner?.(); } catch (e) { /* bez spinneru */ } }
}
function openInGoogle(file) { window.openDriveFile ? window.openDriveFile(file.id) : toast("Otevření v Google není dostupné"); }

function openChooser(file, kind) {
  const d = DOC[kind], e = extOf(file.name), view = d.viewable(file.mime, e);
  const legacy = !isNative(file.mime) && !view;
  $("#vw-choice")?.remove();
  const o = document.createElement("div");
  o.id = "vw-choice"; o.className = "modal-overlay active vw-choice";
  const label = isNative(file.mime) ? `Stáhnout jako ${d.app} (.${d.ext})` : `Stáhnout (${d.app}, .${e || d.ext})`;
  o.innerHTML = `<div class="modal vw-modal" role="dialog" aria-modal="true">
    <h2>${esc(file.name)}</h2>
    <p>Jak chcete dokument otevřít?</p>
    <button class="vw-opt${view ? "" : " off"}" data-act="view" ${view ? "" : "disabled"}><span class="vw-opt-ic">${ICON.eye}</span><span class="vw-opt-t"><b>Otevřít v 10space</b><small>${view ? "Náhled přímo v aplikaci, bez přesměrování" : "Starý formát ." + esc(e) + " se v aplikaci zobrazit nedá"}</small></span></button>
    <button class="vw-opt" data-act="dl"><span class="vw-opt-ic">${ICON.down}</span><span class="vw-opt-t"><b>${esc(label)}</b><small>Uloží soubor do zařízení${isNative(file.mime) ? ", Google dokument se převede" : ""}</small></span></button>
    <button class="vw-opt" data-act="g"><span class="vw-opt-ic">${ICON.ext}</span><span class="vw-opt-t"><b>${isNative(file.mime) ? "Otevřít v Google " + d.google : "Otevřít v Google Drive"}</b><small>Otevře se nová karta v prostředí Google</small></span></button>
    <div class="modal-footer"><button class="modal-btn" data-act="x">Zrušit</button></div></div>`;
  document.body.appendChild(o);
  const close = () => { o.remove(); document.removeEventListener("keydown", esc2); };
  const esc2 = (ev) => { if (ev.key === "Escape") close(); };
  document.addEventListener("keydown", esc2);
  o.addEventListener("click", (ev) => {
    if (ev.target === o) return close();
    const b = ev.target.closest("[data-act]"); if (!b || b.disabled) return;
    close();
    if (b.dataset.act === "view") openDocViewer(file, kind);
    else if (b.dataset.act === "dl") downloadDoc(file, kind);
    else if (b.dataset.act === "g") openInGoogle(file);
  });
}

const dv = { token: 0, abort: null, file: null, kind: null };
function ensureDocDom() {
  if ($("#dv-overlay")) return;
  const d = document.createElement("div");
  d.id = "dv-overlay"; d.className = "dv-overlay";
  d.innerHTML = `<div class="dv-bar"><div class="dv-title" id="dv-title"></div>
      <button class="mp-chip" id="dv-dl">${ICON.down}<span>Stáhnout</span></button>
      <button class="mp-chip" id="dv-g">${ICON.ext}<span>Google</span></button>
      <button class="mp-icon" id="dv-close" aria-label="Zavřít">${ICON.close}</button></div>
    <div class="dv-body" id="dv-body"></div>`;
  document.body.appendChild(d);
  $("#dv-close").onclick = closeDocViewer;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && d.classList.contains("open") && !$("#vw-choice")) closeDocViewer(); });
}
function closeDocViewer() { dv.token++; dv.abort?.abort(); const o = $("#dv-overlay"); if (!o) return; o.classList.remove("open"); document.body.classList.remove("mp-lock"); $("#dv-body").innerHTML = ""; }

async function openDocViewer(file, kind) {
  ensureDocDom(); const my = ++dv.token; dv.abort?.abort(); dv.abort = new AbortController();
  const o = $("#dv-overlay"), body = $("#dv-body"); dv.file = file; dv.kind = kind;
  o.classList.add("open"); document.body.classList.add("mp-lock"); $("#dv-title").textContent = file.name;
  $("#dv-dl").onclick = () => kind === "text" ? downloadBlobOf(file) : downloadDoc(file, kind);
  $("#dv-g").onclick = () => openInGoogle(file); $("#dv-g").style.display = kind === "text" ? "none" : "";
  body.innerHTML = `<div class="dv-center"><div class="mp-bar"><i style="width:0%"></i></div><span id="dv-prog">Načítání…</span></div>`;
  try {
    const blob = await fetchFile(file.id, { signal: dv.abort.signal, onProgress: (f, got) => { if (my !== dv.token) return; const s = $("#dv-prog"), i = $("#dv-body .mp-bar i"); if (!s) return; if (f != null) { i.style.width = Math.round(f * 100) + "%"; s.textContent = `Načítání ${Math.round(f * 100)} %`; } else s.textContent = `Načítání ${fmtSize(got)}`; } });
    if (my !== dv.token) return;
    body.innerHTML = `<div class="dv-center"><span>Zpracování dokumentu…</span></div>`;
    const e = extOf(file.name);
    if (kind === "word") await renderWord(blob, body, my);
    else if (kind === "sheet") await renderSheet(blob, body, my, e === "csv" || file.mime === "text/csv");
    else if (kind === "slides") await renderSlides(blob, body, my);
    else await renderText(blob, body);
  } catch (err) {
    if (my !== dv.token || err.name === "AbortError") return;
    body.innerHTML = `<div class="dv-center err"><span>Dokument se nepodařilo zobrazit: ${esc(err.message)}</span><button class="mp-chip" id="dv-err-dl">Stáhnout soubor</button></div>`;
    $("#dv-err-dl").onclick = () => $("#dv-dl").click();
  }
}
async function downloadBlobOf(file) { try { saveBlob(await fetchFile(file.id), file.name); } catch (e) { toast(e.message); } }

const PAPER_CSS = `body{margin:0;background:#fff;color:#1c1c1e;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:36px 44px 80px;word-wrap:break-word}
h1,h2,h3,h4{line-height:1.25;margin:1.3em 0 .5em}h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.2em}p{margin:.6em 0}
table{border-collapse:collapse;margin:1em 0;max-width:100%}td,th{border:1px solid #c7c7cc;padding:6px 10px;vertical-align:top}
img{max-width:100%;height:auto}a{color:#EE220C}ul,ol{padding-left:1.6em}blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #d1d1d6;color:#555}
@media(max-width:600px){body{padding:20px 16px 80px;font-size:15px}}`;

async function renderWord(blob, body, my) {
  await loadScript("mammoth"); if (my !== dv.token) return;
  const out = await window.mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
  const doc = new DOMParser().parseFromString(out.value || "<p><i>Dokument je prázdný.</i></p>", "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,link,meta,form").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((n) => { [...n.attributes].forEach((a) => { if (/^on/i.test(a.name)) n.removeAttribute(a.name); }); });
  doc.querySelectorAll("a[href]").forEach((a) => { if (!/^(https?:|mailto:|#)/i.test(a.getAttribute("href"))) a.removeAttribute("href"); else { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); } });
  const f = document.createElement("iframe");
  f.className = "dv-frame"; f.title = "Dokument"; f.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
  f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${PAPER_CSS}</style></head><body>${doc.body.innerHTML}</body></html>`;
  body.innerHTML = ""; const wrap = document.createElement("div"); wrap.className = "dv-paper"; wrap.appendChild(f); body.appendChild(wrap);
}

async function renderSheet(blob, body, my, isCsv) {
  await loadScript("xlsx"); if (my !== dv.token) return;
  const X = window.XLSX, wb = isCsv ? X.read(await blob.text(), { type: "string" }) : X.read(await blob.arrayBuffer(), { type: "array", cellDates: true });
  const MAXR = 1500, MAXC = 40, col = (i) => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const sheets = wb.SheetNames.map((name) => {
    const rows = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "", blankrows: true });
    const nC = Math.min(MAXC, rows.reduce((m, r) => Math.max(m, r.length), 0)), cut = rows.length > MAXR || rows.some((r) => r.length > MAXC);
    const trs = rows.slice(0, MAXR).map((r, i) => `<tr><th class="rn">${i + 1}</th>${Array.from({ length: nC }, (_, c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`).join("");
    return { name, html: `<table class="dv-table"><thead><tr><th class="rn"></th>${Array.from({ length: nC }, (_, c) => `<th>${col(c)}</th>`).join("")}</tr></thead><tbody>${trs}</tbody></table>${cut ? `<div class="dv-note">Zobrazeno prvních ${Math.min(rows.length, MAXR)} řádků a ${nC} sloupců. Celý soubor si stáhněte.</div>` : ""}` };
  });
  body.innerHTML = `<div class="dv-sheet"><div class="dv-grid" id="dv-grid"></div>${sheets.length > 1 ? `<div class="dv-tabs" role="tablist">${sheets.map((s, i) => `<button class="dv-tab${i ? "" : " on"}" data-i="${i}" role="tab">${esc(s.name)}</button>`).join("")}</div>` : ""}</div>`;
  const show = (i) => { $("#dv-grid").innerHTML = sheets[i].html; $("#dv-grid").scrollTo(0, 0); body.querySelectorAll(".dv-tab").forEach((t) => t.classList.toggle("on", +t.dataset.i === i)); };
  body.querySelectorAll(".dv-tab").forEach((t) => t.onclick = () => show(+t.dataset.i)); show(0);
}

/* PPTX: vlastní lehký vykreslovač (JSZip). Zvládá pozadí, textová pole s formátováním a odrážkami,
   obrázky, základní tvary a tabulky; grafy, animace a přechody ne (zobrazí se zástupný text). */
const NS = { a: "http://schemas.openxmlformats.org/drawingml/2006/main", p: "http://schemas.openxmlformats.org/presentationml/2006/main", r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships" };
const kids = (n, ns, name) => [...n.children].filter((c) => c.localName === name && (!ns || c.namespaceURI === NS[ns]));
const kid = (n, ns, name) => n && kids(n, ns, name)[0];
const desc = (n, name) => n ? [...n.getElementsByTagNameNS("*", name)] : [];
const attrNum = (n, a, d = 0) => n && n.getAttribute(a) != null ? +n.getAttribute(a) : d;

async function renderSlides(blob, body, my) {
  await loadScript("jszip"); if (my !== dv.token) return;
  const zip = await window.JSZip.loadAsync(await blob.arrayBuffer());
  const text = async (p) => { const f = zip.file(p); return f ? f.async("string") : null; };
  const xml = async (p) => { const t = await text(p); return t ? new DOMParser().parseFromString(t, "application/xml") : null; };
  const dirOf = (p) => p.slice(0, p.lastIndexOf("/") + 1);
  const resolve = (base, t) => { const parts = (t.startsWith("/") ? t.slice(1) : dirOf(base) + t).split("/"), out = []; parts.forEach((x) => { if (x === "..") out.pop(); else if (x && x !== ".") out.push(x); }); return out.join("/"); };
  const rels = async (p) => { const d = await xml(dirOf(p) + "_rels/" + p.split("/").pop() + ".rels"), m = {}; desc(d, "Relationship").forEach((r) => m[r.getAttribute("Id")] = { target: resolve(p, r.getAttribute("Target")), type: r.getAttribute("Type") || "" }); return m; };

  const pres = await xml("ppt/presentation.xml"); if (!pres) throw new Error("Neplatný soubor PPTX");
  const sz = desc(pres, "sldSz")[0], SW = attrNum(sz, "cx", 9144000), SH = attrNum(sz, "cy", 6858000);
  const presRels = await rels("ppt/presentation.xml");
  const slidePaths = desc(pres, "sldId").map((s) => presRels[s.getAttributeNS(NS.r, "id")]?.target).filter(Boolean);
  if (!slidePaths.length) throw new Error("Prezentace neobsahuje žádné snímky");

  const theme = {}; const th = await xml("ppt/theme/theme1.xml");
  desc(th, "clrScheme")[0] && [...desc(th, "clrScheme")[0].children].forEach((c) => { const v = c.firstElementChild; theme[c.localName] = v?.getAttribute("val") || v?.getAttribute("lastClr") || "000000"; });
  const SCHEME = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };
  const colorOf = (n) => {
    if (!n) return null; const c = n.firstElementChild; if (!c) return null;
    let hex = c.localName === "srgbClr" ? c.getAttribute("val") : c.localName === "schemeClr" ? theme[SCHEME[c.getAttribute("val")] || c.getAttribute("val")] : c.localName === "sysClr" ? c.getAttribute("lastClr") : null;
    if (!hex) return null; const lum = kid(c, "a", "lumMod"), off = kid(c, "a", "lumOff");
    if (lum || off) { const k = (lum ? +lum.getAttribute("val") : 100000) / 100000, o = (off ? +off.getAttribute("val") : 0) / 100000, ch = [0, 2, 4].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.substr(i, 2), 16) * k + 255 * o)))); hex = ch.map((x) => x.toString(16).padStart(2, "0")).join(""); }
    return "#" + hex;
  };
  const fillOf = (spPr) => { const sf = kid(spPr, "a", "solidFill"); return sf ? colorOf(sf) : null; };

  const mediaUrls = {}; const mediaUrl = async (p) => { if (mediaUrls[p]) return mediaUrls[p]; const f = zip.file(p); if (!f) return null; const ext = p.split(".").pop().toLowerCase(), b = await f.async("blob"); const t = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", bmp: "image/bmp" }[ext]; return (mediaUrls[p] = t ? URL.createObjectURL(new Blob([b], { type: t })) : null); };

  const layoutCache = {};
  const phLookup = async (layoutPath, ph) => {
    if (!ph || !layoutPath) return null;
    const find = async (p) => { if (!p) return null; const d = layoutCache[p] ||= await xml(p); const idx = ph.getAttribute("idx"), type = ph.getAttribute("type");
      for (const sp of desc(d, "sp")) { const q = desc(sp, "ph")[0]; if (!q) continue; if ((idx != null && q.getAttribute("idx") === idx) || (type && q.getAttribute("type") === type)) { const x = desc(sp, "xfrm")[0]; if (x) return sp; } } return null; };
    const sp = await find(layoutPath); if (sp) return sp;
    const lr = await rels(layoutPath), master = Object.values(lr).find((r) => /slideMaster$/.test(r.type));
    return master ? find(master.target) : null;
  };

  body.innerHTML = `<div class="dv-slides" id="dv-slides"></div>`;
  const wrap = $("#dv-slides"), W = Math.max(280, Math.min(1100, wrap.clientWidth - 24)), K = W / SW, pt = K * 12700; // px na EMU, px na bod

  for (let si = 0; si < slidePaths.length; si++) {
    if (my !== dv.token) return;
    const sp = slidePaths[si], sd = await xml(sp); if (!sd) continue;
    const sr = await rels(sp), layoutPath = Object.values(sr).find((r) => /slideLayout$/.test(r.type))?.target;
    const slide = document.createElement("div"); slide.className = "dv-slide"; slide.style.cssText = `width:${W}px;height:${Math.round(SH * K)}px`;
    let bg = colorOf(desc(sd, "bg")[0] && desc(desc(sd, "bg")[0], "solidFill")[0]); if (!bg && layoutPath) { const ld = await xml(layoutPath); bg = colorOf(desc(ld, "bg")[0] && desc(desc(ld, "bg")[0], "solidFill")[0]); }
    slide.style.background = bg || "#fff";
    const tree = desc(sd, "spTree")[0];
    const place = (el, x) => { const off = kid(x, "a", "off"), ext = kid(x, "a", "ext"); if (!off || !ext) return false; el.style.left = attrNum(off, "x") * K + "px"; el.style.top = attrNum(off, "y") * K + "px"; el.style.width = attrNum(ext, "cx") * K + "px"; el.style.height = attrNum(ext, "cy") * K + "px"; const rot = attrNum(x, "rot"); if (rot) el.style.transform = `rotate(${rot / 60000}deg)`; return true; };
    const paragraphs = (tx, el, phType) => {
      const defPt = /title/i.test(phType || "") ? 32 : phType === "subTitle" ? 22 : 18;
      kids(tx, "a", "p").forEach((p) => {
        const pPr = kid(p, "a", "pPr"), d = document.createElement("div"), algn = pPr?.getAttribute("algn"), lvl = attrNum(pPr, "lvl");
        d.style.textAlign = { ctr: "center", r: "right", just: "justify" }[algn] || "left"; if (lvl) d.style.marginLeft = lvl * 24 * (W / 960) + "px";
        const bu = kid(pPr, "a", "buChar"), num = kid(pPr, "a", "buAutoNum"); if (bu || num) { d.style.display = "list-item"; d.style.listStyle = bu ? "disc" : "decimal"; d.style.marginLeft = (parseFloat(d.style.marginLeft) || 0) + 22 * (W / 960) + "px"; }
        let any = false;
        [...p.children].forEach((r) => {
          if (r.localName === "br") { d.appendChild(document.createElement("br")); return; }
          if (r.localName !== "r" && r.localName !== "fld") return;
          const rp = kid(r, "a", "rPr"), t = kid(r, "a", "t"); if (!t) return; any = true;
          const span = document.createElement("span"); span.textContent = t.textContent;
          const size = rp?.getAttribute("sz") ? +rp.getAttribute("sz") / 100 : defPt; span.style.fontSize = size * pt + "px";
          if (rp?.getAttribute("b") === "1" || /title/i.test(phType || "")) span.style.fontWeight = "700"; if (rp?.getAttribute("i") === "1") span.style.fontStyle = "italic"; if (rp?.getAttribute("u") && rp.getAttribute("u") !== "none") span.style.textDecoration = "underline";
          const col = colorOf(kid(rp, "a", "solidFill")); if (col) span.style.color = col;
          d.appendChild(span);
        });
        if (!any) { d.innerHTML = "&nbsp;"; const e = kid(p, "a", "endParaRPr"); d.style.fontSize = (e?.getAttribute("sz") ? +e.getAttribute("sz") / 100 : defPt) * pt + "px"; }
        el.appendChild(d);
      });
    };
    const drawNode = async (n, container) => {
      const ln = n.localName;
      if (ln === "grpSp") { for (const c of n.children) if (["sp", "pic", "grpSp", "graphicFrame", "cxnSp"].includes(c.localName)) await drawNode(c, container); return; }
      const el = document.createElement("div"); el.className = "dv-shape";
      if (ln === "sp" || ln === "cxnSp") {
        const spPr = kid(n, "p", "spPr"), xf = kid(spPr, "a", "xfrm"), phEl = desc(n, "ph")[0];
        let placed = xf && place(el, xf);
        if (!placed && phEl) { const src = await phLookup(layoutPath, phEl); if (src) placed = place(el, desc(src, "xfrm")[0]); }
        if (!placed) return;
        const geom = kid(spPr, "a", "prstGeom")?.getAttribute("prst"), f = fillOf(spPr); if (f) el.style.background = f;
        if (geom === "ellipse") el.style.borderRadius = "50%"; else if (geom === "roundRect") el.style.borderRadius = "12px";
        const lnN = kid(spPr, "a", "ln"), lc = lnN && colorOf(kid(lnN, "a", "solidFill")); if (lc) el.style.border = `${Math.max(1, attrNum(lnN, "w", 12700) * K)}px solid ${lc}`;
        const tx = kid(n, "p", "txBody"); if (tx) { const bp = kid(tx, "a", "bodyPr"), anchor = bp?.getAttribute("anchor"); el.style.display = "flex"; el.style.flexDirection = "column"; el.style.justifyContent = { ctr: "center", b: "flex-end" }[anchor] || "flex-start"; el.style.padding = `${attrNum(bp, "tIns", 45720) * K}px ${attrNum(bp, "rIns", 91440) * K}px ${attrNum(bp, "bIns", 45720) * K}px ${attrNum(bp, "lIns", 91440) * K}px`; paragraphs(tx, el, phEl?.getAttribute("type")); }
      } else if (ln === "pic") {
        const xf = desc(n, "xfrm")[0]; if (!xf || !place(el, xf)) return;
        const rid = desc(n, "blip")[0]?.getAttributeNS(NS.r, "embed"), url = rid && sr[rid] && await mediaUrl(sr[rid].target);
        if (url) { const im = document.createElement("img"); im.src = url; im.alt = ""; im.style.cssText = "width:100%;height:100%;object-fit:fill;display:block"; el.appendChild(im); } else return;
      } else if (ln === "graphicFrame") {
        const xf = kid(n, "p", "xfrm"); if (!xf || !place(el, xf)) return;
        const tbl = desc(n, "tbl")[0];
        if (tbl) { const t = document.createElement("table"); t.className = "dv-pt"; kids(tbl, "a", "tr").forEach((tr) => { const row = t.insertRow(); kids(tr, "a", "tc").forEach((tc) => { const c = row.insertCell(); const tx = kid(tc, "a", "txBody"); if (tx) paragraphs(tx, c, ""); const f = fillOf(kid(tc, "a", "tcPr")); if (f) c.style.background = f; }); }); el.appendChild(t); }
        else { el.className += " dv-ph"; el.textContent = desc(n, "chart")[0] ? "[graf]" : "[objekt]"; }
      } else return;
      container.appendChild(el);
    };
    for (const n of tree.children) if (["sp", "pic", "grpSp", "graphicFrame", "cxnSp"].includes(n.localName)) await drawNode(n, slide);
    const cap = document.createElement("div"); cap.className = "dv-slide-no"; cap.textContent = `${si + 1} / ${slidePaths.length}`;
    const box = document.createElement("div"); box.className = "dv-slide-box"; box.append(slide, cap); wrap.appendChild(box);
  }
}

async function renderText(blob, body) {
  const t = await blob.text(), cut = t.length > 500000;
  body.innerHTML = `<pre class="dv-text">${esc(cut ? t.slice(0, 500000) : t)}</pre>${cut ? `<div class="dv-note">Zobrazeno prvních 500 000 znaků. Celý soubor si stáhněte.</div>` : ""}`;
}

/* ── Veřejné rozhraní ────────────────────────────────────────────── */
/* Stav pro navázání po výpadku (ui.js ho čte každou vteřinu a po znovuotevření ho obnoví) */
function viewerState() {
  if ($("#mp-overlay")?.classList.contains("open") && mp.eng && cur()) return { type: "media", id: cur().id, t: Math.floor(mp.eng.t || 0) };
  if ($("#dv-overlay")?.classList.contains("open") && dv.file) return { type: "doc", file: dv.file, kind: dv.kind };
  return null;
}
function viewerRestore(s) {
  if (!s) return;
  if (s.type === "media" && (window.driveFiles || {})[s.id]) { openPlayer(s.id, { startAt: s.t || 0, autoplay: false }); }
  else if (s.type === "doc" && s.file) openDocViewer(s.file, s.kind);
}

window.tenViewers = {
  /* Vrací true, když soubor obslouží přehrávač nebo prohlížeč; PDF a ostatní nechává původnímu kódu. */
  open(id, mime, name) {
    const f = (window.driveFiles || {})[id] || {}, file = { id, mime: mime || f.mimeType || "", name: name || f.name || "" };
    const kind = kindOf(file.mime, file.name);
    if (kind === "audio" || kind === "midi" || kind === "video") { openPlayer(id); return true; }
    if (kind === "word" || kind === "sheet" || kind === "slides") { openChooser(file, kind); return true; }
    if (kind === "text") { openDocViewer(file, "text"); return true; }
    return false;
  },
  kindOf, getState: viewerState, restore: viewerRestore,
  async download(id, name) { // velké PDF se nestahuje po blocích do paměti, ale jako jeden proud do souboru
    try {
      window.showSpinner?.("Stahování…");
      const { auth, FUNCTIONS } = window.__tenCtx, token = await auth.currentUser.getIdToken();
      const res = await fetch(`${FUNCTIONS.getFileStream}?driveFileId=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Server vrátil " + res.status);
      saveBlob(await res.blob(), name);
    } catch (e) { toast("Chyba: " + e.message); } finally { try { window.hideSpinner?.(); } catch (e) { /* bez spinneru */ } }
  }
};
