/* 10space – Osobní desky.
   • Pevná složka „Příští akce“: noty z programu nejbližší akce (RTDB /akce + /program + /repertoar),
     počítá se živě, nic se do ní nezapisuje.
   • Moje složky: člen si zakládá složky a řadí do nich noty (RTDB /userDecks/{uid}).
   • Offline: noty pevné složky (a složek s přepínačem Offline) se při otevření aplikace stáhnou do
     zařízení spolu s anotacemi. Složka obsahuje jen ODKAZY na soubory z Drive, anotace jsou v databázi
     vedené podle souboru a uživatele, takže poznámky vytvořené před přidáním not se zobrazí samy.
   S aplikací se potkává přes window.__tenCtx a window.tenDecks (viz index.html).
   Vypnutí: odebrat <script src="decks.js"> a <link href="decks.css">. */

import { createRepertoire, fileOf } from "./repertoar.js";

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ctx = () => window.__tenCtx;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ICON = {
  folder: '<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  pdf: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M18 10a6 6 0 0 0-11.6-1.7A4.5 4.5 0 0 0 7 17h11a3.5 3.5 0 0 0 0-7z"/><path d="M9 13.5l2 2 4-4"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  move: '<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M9 14h6m-2.5-2.5L15 14l-2.5 2.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.3 6.9.9-5 4.8 1.2 6.9L12 17.8 5.9 21l1.2-6.9-5-4.8L9 8.3z"/></svg>'
};

/* ── Úložiště v zařízení: IndexedDB (přehledy, anotace) + Cache API (PDF) ─────────────── */
const DB_NAME = "10space-offline", CACHE = "10space-deck-v1", cacheUrl = (id) => `https://deck-cache.invalid/${encodeURIComponent(id)}`;
let dbp;
const idb = () => dbp ||= new Promise((res, rej) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const kv = {
  async get(k) { try { const d = await idb(); return await new Promise((res, rej) => { const q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return undefined; } },
  async set(k, v) { try { const d = await idb(); await new Promise((res, rej) => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); return true; } catch (e) { return false; } },
  async del(k) { try { const d = await idb(); await new Promise((res, rej) => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").delete(k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) { /* nic */ } },
  async keys(prefix) { try { const d = await idb(); return await new Promise((res, rej) => { const q = d.transaction("kv").objectStore("kv").getAllKeys(); q.onsuccess = () => res(q.result.filter((k) => String(k).startsWith(prefix))); q.onerror = () => rej(q.error); }); } catch (e) { return []; } }
};
const openCache = () => (window.caches ? caches.open(CACHE) : Promise.reject(new Error("Prohlížeč nepodporuje Cache API")));

/* ── Stav ────────────────────────────────────────────────────────── */
const S = {
  uid: null, started: false, area: null,
  data: { folders: {}, items: {} }, dataLive: false, dataErr: null,
  akce: null, program: null, next: null, snap: null,
  pins: {}, busy: new Set(), failed: {}, syncing: false, sync: { state: "idle", done: 0, total: 0, err: 0 },
  annot: {}, view: { type: "home" }
};
const online = () => navigator.onLine !== false;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDate = (s) => { try { return new Date(s + "T12:00:00").toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" }); } catch (e) { return s || ""; } };
const fmtMB = (n) => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1048576).toFixed(1) + " MB";
const toast = (m) => { try { if (typeof window.showToast === "function") return window.showToast(m); } catch (e) { /* bez toastu */ } alert(m); };
const newId = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ── Příští akce z programu ──────────────────────────────────────── */
function songOf(entry) { return (window.repertoar || {})[entry.song_id] || null; }
function computeNext() {
  if (!S.akce || !S.program) return null;
  const today = ymd(new Date());
  const ev = Object.entries(S.akce).map(([id, a]) => ({ id, ...a }))
    .filter((a) => a.date && a.date >= today && !["Zrušená", "Nápad", "Proběhlá"].includes(a.status) && !a.is_template)
    .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")))[0];
  if (!ev) return { event: null, items: [] };
  // doslova nejbližší akce; nemá-li program, noty se nestahují, dokud se nevyplní
  const mine = Object.values(S.program).filter((p) => p.id_akce === ev.id).sort((a, b) => (a.order || 0) - (b.order || 0));
  const items = mine.map((p, i) => { const s = songOf(p), fid = fileOf(s); return { fileId: fid, title: s?.name || (window.driveFiles?.[fid]?.name) || "Skladba", code: s?.code || "", order: i + 1 }; });
  return { event: { id: ev.id, name: ev.name || "Akce", date: ev.date, start: ev.start || "", place: ev.place || "" }, items };
}
const refreshNext = () => { const n = computeNext(); if (n) S.next = n; };

/* ── Co má být v zařízení ────────────────────────────────────────── */
function wantedPins() {
  const want = new Map();
  S.next?.items.forEach((it) => { if (it.fileId) want.set(it.fileId, { title: it.title }); });
  Object.entries(S.data.folders).forEach(([fid, f]) => { if (f.offline) Object.entries(S.data.items[fid] || {}).forEach(([id, it]) => { if (!want.has(id)) want.set(id, { title: it.title || window.driveFiles?.[id]?.name || "Noty" }); }); });
  return want;
}
const modifiedOf = (id) => window.driveFiles?.[id]?.modifiedTime || "";

/* ── Anotace v zařízení ──────────────────────────────────────────── */
function countAnn(layer) {
  if (!layer) return 0; let n = 0;
  for (const v of Object.values(layer.pagesV2 || {})) { try { const d = JSON.parse(v?.data); if ((d.strokes?.length || 0) + (d.items?.length || 0)) n++; } catch (e) { /* prázdné */ } }
  for (const v of Object.values(layer.pages || {})) { try { if (JSON.parse(v?.json).objects?.length) n++; } catch (e) { /* prázdné */ } }
  return n;
}
/* PDF reader si zápisy, které se nepodařilo odeslat (bez připojení, zavřená záložka), drží v zařízení
   (localStorage "pdf2.outbox.{uid}") a odešle je při příštím otevření nebo po obnovení připojení. Server je do té doby
   nemá, a proto je při obnově offline kopie přikládáme na stav ze serveru, jinak by se poznámky psané bez
   připojení ztratily z kopie dřív, než dorazí na server. */
function applyOutbox(rec, fileId) {
  let box = {};
  try { box = JSON.parse(localStorage.getItem("pdf2.outbox." + S.uid) || "{}") || {}; } catch (e) { return; }
  for (const e of Object.values(box)) {
    if (!e || e.fileId !== fileId) continue;
    const slot = e.layerKey === "public" ? "public" : e.layerKey === S.uid ? "own" : null; if (!slot) continue;
    rec[slot] = rec[slot] || {}; rec[slot].pagesV2 = rec[slot].pagesV2 || {};
    if (e.payload === null) delete rec[slot].pagesV2[e.page]; else rec[slot].pagesV2[e.page] = e.payload;
  }
}
async function refreshAnnot(id) {
  const { db, ref, get } = ctx();
  const [pub, own] = await Promise.all([get(ref(db, `/annotations/${id}/public`)), get(ref(db, `/annotations/${id}/${S.uid}`))]);
  const rec = { public: pub.val(), own: own.val(), savedAt: Date.now() };
  applyOutbox(rec, id);
  await kv.set(`annot:${S.uid}:${id}`, rec); S.annot[id] = { own: countAnn(rec.own), pub: countAnn(rec.public) };
}
async function annotInfo(id) { // zobrazí se jen při vykreslení, bez dotazu do sítě, když už je v zařízení
  if (S.annot[id]) return S.annot[id];
  const rec = await kv.get(`annot:${S.uid}:${id}`); if (rec) return (S.annot[id] = { own: countAnn(rec.own), pub: countAnn(rec.public) });
  if (!online() || !ctx()) return null;
  try { const { db, ref, get } = ctx(); const own = (await get(ref(db, `/annotations/${id}/${S.uid}`))).val(); return (S.annot[id] = { own: countAnn(own), pub: 0 }); } catch (e) { return null; }
}

/* ── Stahování ───────────────────────────────────────────────────── */
async function downloadPin(id, w) {
  const { auth, FUNCTIONS } = ctx(), token = await auth.currentUser.getIdToken();
  const res = await fetch(`${FUNCTIONS.getFileStream}?driveFileId=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok || !res.body) throw new Error(res.status === 403 ? "Přístup odepřen" : "Server vrátil " + res.status);
  const total = parseInt(res.headers.get("Content-Length") || "0", 10), modified = modifiedOf(id), cache = await openCache(), url = cacheUrl(id);
  // soubor teče ze sítě rovnou do úložiště, v paměti se nedrží (velké PDF jinak stránku zbytečně zatěžuje)
  await cache.put(url, new Response(res.body, { headers: { "Content-Type": "application/pdf", "X-Modified": modified } }));
  const hit = await cache.match(url); if (!hit) throw new Error("Soubor se nepodařilo uložit");
  let size = total;
  try { // kontrola, že je to skutečně PDF a že se stáhlo celé (první bloky se přečtou a stream se zruší)
    const rd = hit.body.getReader(), { value } = await rd.read(); rd.cancel();
    if (!value || String.fromCharCode(...value.slice(0, 5)) !== "%PDF-") throw new Error("Server nevrátil PDF");
    if (!size) size = (await (await cache.match(url)).blob()).size;
    if (total && (await (await cache.match(url)).blob()).size !== total) throw new Error("Soubor se nestáhl celý");
  } catch (e) { await cache.delete(url); throw e; }
  S.pins[id] = { title: w.title, modified, size, savedAt: Date.now() };
  await kv.set("pin:" + id, S.pins[id]);
}
const waitFor = async (fn, ms) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await sleep(150); return fn(); };

let syncTimer;
const scheduleSync = (delay = 1500) => { clearTimeout(syncTimer); syncTimer = setTimeout(sync, delay); };
async function sync() {
  if (!S.uid || !ctx()) return;
  if (S.syncing) { S.again = true; return; }
  if (!online()) { rerender(); return; }
  S.syncing = true; S.again = false;
  try {
    await waitFor(() => window.driveFiles, 8000);
    refreshNext(); await saveSnapshot();
    const want = wantedPins();
    const todo = [...want].filter(([id]) => { const p = S.pins[id], m = modifiedOf(id); return !p || (m && p.modified !== m); });
    S.sync = { state: todo.length ? "run" : "done", done: 0, total: todo.length, err: 0 }; S.failed = {}; rerender();
    let i = 0;
    const worker = async () => { while (i < todo.length) { const [id, w] = todo[i++]; S.busy.add(id); rerender(); try { await downloadPin(id, w); S.sync.done++; } catch (e) { S.sync.err++; S.failed[id] = e.message || "Chyba"; } S.busy.delete(id); rerender(); } };
    await Promise.all([worker(), worker()]);
    for (const [id] of want) { try { await refreshAnnot(id); } catch (e) { /* anotace se obnoví příště */ } }
    const cache = await openCache().catch(() => null);
    for (const id of Object.keys(S.pins)) if (!want.has(id)) { delete S.pins[id]; await kv.del("pin:" + id); await cache?.delete(cacheUrl(id)); }
    S.sync.state = S.sync.err ? "err" : "done"; S.sync.at = Date.now(); await saveSnapshot();
  } catch (e) { S.sync = { ...S.sync, state: "err", msg: e.message }; console.warn("Osobní desky: synchronizace selhala:", e); }
  finally { S.syncing = false; rerender(); if (S.again) scheduleSync(500); }
}

async function saveSnapshot() { await kv.set("snap:" + S.uid, { savedAt: Date.now(), next: S.next, data: S.data, pins: S.pins }); }
async function loadSnapshot() {
  const snap = await kv.get("snap:" + S.uid); S.snap = snap || null;
  if (snap) { S.next = snap.next || null; if (!S.dataLive) S.data = snap.data || S.data; }
  for (const k of await kv.keys("pin:")) { const v = await kv.get(k); if (v) S.pins[String(k).slice(4)] = v; }
}

/* ── Databáze (osobní desky) ─────────────────────────────────────── */
function norm(v) { return { folders: v?.folders || {}, items: v?.items || {} }; }
async function write(updates) {
  if (!online()) { toast("Bez připojení nejde složky upravovat."); return false; }
  try { const { db, ref, update } = ctx(); await update(ref(db, `/userDecks/${S.uid}`), updates); return true; }
  catch (e) { toast(/permission/i.test(e.message || "") ? "Ukládání složek zatím není povoleno: v databázi chybí pravidla pro osobní desky." : "Nepodařilo se uložit: " + (e.message || e)); return false; }
}
const folderList = () => Object.entries(S.data.folders).map(([id, f]) => ({ id, ...f })).sort((a, b) => (a.order || 0) - (b.order || 0));
const itemList = (fid) => Object.entries(S.data.items[fid] || {}).map(([id, it]) => ({ fileId: id, ...it })).sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
const titleFor = (id) => { const s = Object.values(window.repertoar || {}).find((x) => fileOf(x) === id); return s?.name || window.driveFiles?.[id]?.name || "Noty"; };
const createFolder = async (name) => { const id = newId(); return (await write({ [`folders/${id}`]: { name, order: Date.now(), createdAt: Date.now(), offline: false } })) ? id : null; };
const addItems = (fid, ids) => write(Object.fromEntries(ids.map((id) => [`items/${fid}/${id}`, { title: titleFor(id).slice(0, 200), addedAt: Date.now() }])));

/* ── Dialogy ─────────────────────────────────────────────────────── */
function dialog({ title, text, input, value = "", ok = "OK", danger = false, body, onMount }) {
  return new Promise((resolve) => {
    const o = document.createElement("div"); o.className = "modal-overlay active dk-ov";
    o.innerHTML = `<div class="modal dk-modal" role="dialog" aria-modal="true"><h2>${esc(title)}</h2>${text ? `<p>${text}</p>` : ""}${input ? `<input class="field" id="dk-in" maxlength="80" placeholder="${esc(input)}" value="${esc(value)}" autocomplete="off">` : ""}${body || ""}<div class="modal-footer"><button class="modal-btn" data-x="0">Zrušit</button><button class="modal-btn ${danger ? "modal-btn-danger" : "modal-btn-primary"}" data-x="1">${esc(ok)}</button></div></div>`;
    document.body.appendChild(o);
    const done = (v) => { document.removeEventListener("keydown", key, true); o.remove(); resolve(v); };
    const get = () => (input ? $("#dk-in", o).value.trim() : true);
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(null); } else if (e.key === "Enter" && input && e.target.id === "dk-in") { e.preventDefault(); const v = get(); if (v) done(v); } };
    document.addEventListener("keydown", key, true);
    o.addEventListener("click", (e) => { if (e.target === o) return done(null); const b = e.target.closest("[data-x]"); if (!b) return; if (b.dataset.x === "0") return done(null); const v = get(); if (input && !v) { $("#dk-in", o).focus(); return; } done(typeof onMount?.result === "function" ? onMount.result(o) : v); });
    onMount?.(o); (input ? $("#dk-in", o) : $("[data-x='1']", o))?.focus(); if (input) $("#dk-in", o).select();
  });
}
const confirmDlg = (title, text, ok) => dialog({ title, text, ok, danger: true });

/* Výběr not z Drive (repertoár + ostatní PDF) */
function pickerCandidates() {
  const files = window.driveFiles || {}, seen = new Set(), out = [];
  Object.values(window.repertoar || {}).forEach((s) => { const id = fileOf(s); if (id && files[id]?.mimeType === "application/pdf" && !seen.has(id)) { seen.add(id); out.push({ id, name: s.name || files[id].name, sub: [s.code, s.arranged_by].filter(Boolean).join(" · ") }); } });
  Object.entries(files).forEach(([id, f]) => { if (f.mimeType === "application/pdf" && !seen.has(id)) { seen.add(id); out.push({ id, name: f.name, sub: "" }); } });
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name), "cs", { numeric: true }));
}
async function openPicker(fid) {
  const have = new Set(Object.keys(S.data.items[fid] || {})), all = pickerCandidates(), sel = new Set();
  let q = "";
  const res = await dialog({
    title: "Přidat noty", ok: "Přidat",
    body: `<input class="field" id="dk-q" placeholder="Hledat podle názvu nebo kódu" autocomplete="off"><div class="dk-pick" id="dk-pick"></div><div class="dk-pick-n" id="dk-pn"></div>`,
    onMount: Object.assign((o) => {
      const list = $("#dk-pick", o), draw = () => {
        const f = q.toLowerCase(), rows = all.filter((x) => !have.has(x.id) && (!f || (x.name + " " + x.sub).toLowerCase().includes(f))).slice(0, 150);
        list.innerHTML = rows.length ? rows.map((x) => `<label class="dk-pick-row"><input type="checkbox" value="${esc(x.id)}" ${sel.has(x.id) ? "checked" : ""}><span class="dk-pick-t"><b>${esc(x.name)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</span></label>`).join("") : `<div class="dk-empty-s">Nic nenalezeno</div>`;
        $("#dk-pn", o).textContent = sel.size ? `Vybráno: ${sel.size}` : "";
      };
      $("#dk-q", o).oninput = (e) => { q = e.target.value; draw(); };
      list.addEventListener("change", (e) => { if (e.target.checked) sel.add(e.target.value); else sel.delete(e.target.value); $("#dk-pn", o).textContent = sel.size ? `Vybráno: ${sel.size}` : ""; });
      draw(); $("#dk-q", o).focus();
    }, { result: () => [...sel] })
  });
  if (res && res.length) { if (await addItems(fid, res)) toast(`Přidáno: ${res.length}`); }
}

/* „Přidat do osobních desek“ z kontextové nabídky souboru */
async function pick(fileId) {
  const f = window.driveFiles?.[fileId];
  if (f && f.mimeType !== "application/pdf") return toast("Do osobních desek lze přidat jen PDF s notami.");
  if (!S.uid) return toast("Osobní desky ještě nejsou připravené.");
  if (!online()) return toast("Bez připojení nejde složky upravovat.");
  const folders = folderList();
  let choice = folders[0]?.id || "__new";
  const body = `<div class="dk-choose">${folders.map((x) => `<label class="dk-pick-row"><input type="radio" name="dkf" value="${esc(x.id)}" ${x.id === choice ? "checked" : ""}><span class="dk-pick-t"><b>${esc(x.name)}</b><small>${(() => { const n = Object.keys(S.data.items[x.id] || {}).length; return n + " " + (n === 1 ? "nota" : n >= 2 && n <= 4 ? "noty" : "not"); })()}</small></span></label>`).join("")}<label class="dk-pick-row"><input type="radio" name="dkf" value="__new" ${choice === "__new" ? "checked" : ""}><span class="dk-pick-t"><b>Nová složka…</b></span></label></div><input class="field" id="dk-nn" placeholder="Název nové složky" maxlength="80" style="${choice === "__new" ? "" : "display:none"}">`;
  const res = await dialog({
    title: "Přidat do osobních desek", text: esc(titleFor(fileId)), ok: "Přidat", body,
    onMount: Object.assign((o) => { o.addEventListener("change", (e) => { if (e.target.name === "dkf") $("#dk-nn", o).style.display = e.target.value === "__new" ? "" : "none"; }); }, {
      result: (o) => ({ v: $("input[name=dkf]:checked", o)?.value, name: $("#dk-nn", o).value.trim() })
    })
  });
  if (!res) return;
  let fid = res.v;
  if (fid === "__new") { if (!res.name) return toast("Zadejte název složky."); fid = await createFolder(res.name); if (!fid) return; }
  if (Object.keys(S.data.items[fid] || {}).includes(fileId)) return toast("Tyto noty už ve složce jsou.");
  if (await addItems(fid, [fileId])) toast("Přidáno do osobních desek");
}

/* ── Vykreslení ──────────────────────────────────────────────────── */
function rerender() { if (S.area && document.contains(S.area) && $("#tab-decks")?.classList.contains("active")) draw(); }
function render(area) {
  S.area = area; S.view = S.view.type === "folder" && !S.data.folders[S.view.id] ? { type: "home" } : S.view;
  document.querySelectorAll(".bottom button").forEach((b) => b.classList.toggle("active", b.id === "mob-decks"));
  draw();
}
function pinChip(id) {
  if (S.busy.has(id)) return `<span class="dk-chip run" title="Stahuje se">Stahuje se…</span>`;
  if (S.pins[id]) return `<span class="dk-chip ok" title="Uloženo v zařízení, funguje bez internetu">${ICON.cloud}<span>Offline</span></span>`;
  if (S.failed[id]) return `<span class="dk-chip err" title="${esc(S.failed[id])}">Nestaženo</span>`;
  return "";
}
function annChip(id) { const a = S.annot[id]; return a && a.own ? `<span class="dk-chip pen" title="Máte v těchto notách poznámky">${ICON.pen}<span>${a.own}</span></span>` : ""; }
function itemRow(it, extra = "") {
  const open = it.fileId;
  return `<div class="dk-row${open ? "" : " off"}${extra ? " has-acts" : ""}" ${open ? `data-open="${esc(it.fileId)}" data-title="${esc(it.title)}" role="button" tabindex="0"` : ""}>
    <span class="dk-ic">${ICON.pdf}</span>
    <span class="dk-t"><b>${esc(it.title)}</b>${it.code ? `<small>${esc(it.code)}</small>` : ""}</span>
    <span class="dk-chips">${open ? annChip(it.fileId) + pinChip(it.fileId) : `<span class="dk-chip">Bez not</span>`}</span>${extra ? `<span class="dk-acts">${extra}</span>` : ""}</div>`;
}
function syncLine() {
  const s = S.sync, n = S.next?.items.filter((x) => x.fileId).length || 0;
  if (!online()) return `<span class="dk-sync off">Bez připojení${S.snap?.savedAt ? " · stav z " + new Date(S.snap.savedAt).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</span>`;
  if (s.state === "run") return `<span class="dk-sync run">Stahuji ${Math.min(s.done + 1, s.total)} z ${s.total}…</span>`;
  if (s.state === "err") return `<span class="dk-sync err">Část not se nestáhla <button class="dk-link" data-act="resync">Zkusit znovu</button></span>`;
  const ready = S.next?.items.filter((x) => x.fileId && S.pins[x.fileId]).length || 0;
  return n && ready === n ? `<span class="dk-sync ok">${ICON.cloud}Připraveno offline</span>` : "";
}
function drawNext() {
  const n = S.next, ev = n?.event;
  if (!n) return `<div class="dashboard-card dk-card"><div class="dashboard-card-title"><span>Příští akce</span></div><div class="dk-empty"><p>${online() ? "Načítám…" : "Bez připojení a zatím bez uložených dat."}</p></div></div>`;
  if (!ev) return `<div class="dashboard-card dk-card"><div class="dashboard-card-title"><span>Příští akce</span></div><div class="dk-empty">${ICON.star}<p><b>Žádná nadcházející akce.</b></p><p>Až se v 10base objeví další akce, uvidíte tu její noty.</p></div></div>`;
  const head = `<div class="dk-ev"><b>${esc(ev.name)}</b><small>${esc(fmtDate(ev.date))}${ev.start ? ", " + esc(ev.start) : ""}${ev.place ? " · " + esc(ev.place) : ""}</small></div>`;
  if (!n.items.length) return `<div class="dashboard-card dk-card"><div class="dashboard-card-title"><span>Příští akce</span></div>${head}<div class="dk-empty"><p><b>Program zatím není vyplněn.</b></p><p>Noty z programu se sem uloží a stáhnou do zařízení, jakmile ho vyplníte v 10base.</p></div></div>`;
  return `<div class="dashboard-card dk-card">
    <div class="dashboard-card-title"><span>Příští akce</span>${syncLine()}</div>
    ${head}
    <div class="dk-rows">${n.items.map((it) => itemRow(it)).join("")}</div></div>`;
}
function usage() { const p = Object.values(S.pins); return p.length ? `Offline v zařízení: ${p.length} ${p.length === 1 ? "soubor" : p.length < 5 ? "soubory" : "souborů"} · ${fmtMB(p.reduce((a, b) => a + (b.size || 0), 0))}` : ""; }
function drawHome() {
  const folders = folderList(), ed = online();
  return `${drawNext()}
  <div class="dashboard-card dk-card">
    <div class="dashboard-card-title"><span>Moje složky</span><button class="drive-toolbar-btn primary dk-new" data-act="newFolder" ${ed ? "" : "disabled"}>${ICON.plus}<span>Nová složka</span></button></div>
    ${S.dataErr ? `<div class="dk-empty err"><p>Složky se nepodařilo načíst: ${/permission/i.test(S.dataErr) ? "v databázi zatím chybí pravidla pro osobní desky." : esc(S.dataErr)}</p></div>` : folders.length ? `<div class="dk-rows">${folders.map((f) => { const n = Object.keys(S.data.items[f.id] || {}).length; return `<div class="dk-row dk-folder" data-folder="${esc(f.id)}" role="button" tabindex="0"><span class="dk-ic fold">${ICON.folder}</span><span class="dk-t"><b>${esc(f.name)}</b><small>${n} ${n === 1 ? "nota" : n >= 2 && n <= 4 ? "noty" : "not"}</small></span>${f.offline ? `<span class="dk-chip ok" title="Složka se stahuje do zařízení">${ICON.cloud}<span>Offline</span></span>` : ""}<span class="dk-go">${ICON.chev}</span></div>`; }).join("")}</div>` : `<div class="dk-empty"><p>Zatím nemáte žádné složky.</p><p>Založte si složku, například „Vánoce“ nebo „Na doma“, a ukládejte do ní noty.</p></div>`}
  </div>
  ${RP.card()}
  ${usage() ? `<div class="dk-foot">${usage()}</div>` : ""}${ed ? "" : `<div class="dk-foot">Bez připojení nejde složky upravovat.</div>`}`;
}
function drawFolder() {
  const f = S.data.folders[S.view.id], items = itemList(S.view.id), ed = online();
  return `<div class="dk-bar"><button class="mp-icon dk-back" data-act="home" aria-label="Zpět">${ICON.back}</button><h2>${esc(f.name)}</h2>
      <button class="drive-toolbar-btn primary" data-act="addNotes" ${ed ? "" : "disabled"}>${ICON.plus}<span>Přidat noty</span></button></div>
    <div class="dashboard-card dk-card">
      <div class="dk-opts">
        <label class="dk-switch"><input type="checkbox" data-act="offline" ${f.offline ? "checked" : ""} ${ed ? "" : "disabled"}><i></i><span>Stáhnout do zařízení (offline)</span></label>
        <span class="dk-spacer"></span>
        <button class="mp-icon" data-act="rename" aria-label="Přejmenovat" title="Přejmenovat" ${ed ? "" : "disabled"}>${ICON.edit}</button>
        <button class="mp-icon" data-act="delFolder" aria-label="Smazat složku" title="Smazat složku" ${ed ? "" : "disabled"}>${ICON.trash}</button>
      </div>
      ${items.length ? `<div class="dk-rows">${items.map((it) => itemRow({ ...it, title: it.title || titleFor(it.fileId) }, `<button class="mp-icon dk-mini" data-act="move" data-file="${esc(it.fileId)}" aria-label="Přesunout" title="Přesunout do jiné složky" ${ed ? "" : "disabled"}>${ICON.move}</button><button class="mp-icon dk-mini" data-act="remove" data-file="${esc(it.fileId)}" aria-label="Odebrat" title="Odebrat ze složky" ${ed ? "" : "disabled"}>${ICON.x}</button>`)).join("")}</div>` : `<div class="dk-empty"><p>Složka je prázdná.</p><p>Klepněte na „Přidat noty“, nebo u souboru v Drive zvolte „Přidat do osobních desek“.</p></div>`}
    </div>${usage() ? `<div class="dk-foot">${usage()}</div>` : ""}`;
}
function draw() {
  const a = S.area; if (!a) return;
  const top = a.scrollTop;
  a.innerHTML = `<div class="dk-wrap">${S.view.type === "repertoar" ? RP.page() : S.view.type === "folder" && S.data.folders[S.view.id] ? drawFolder() : drawHome()}</div>`;
  a.scrollTop = top;
  const all = [...(S.next?.items || []), ...Object.values(S.data.items).flatMap((m) => Object.keys(m).map((fileId) => ({ fileId })))];
  all.slice(0, 60).forEach((it) => { if (it.fileId && !S.annot[it.fileId]) annotInfo(it.fileId).then((r) => { if (r?.own) rerenderSoon(); }); });
}
let rrT; const rerenderSoon = () => { clearTimeout(rrT); rrT = setTimeout(rerender, 80); };

async function onAction(btn) {
  const act = btn.dataset.act, fid = S.view.id;
  if (act.startsWith("rp")) return RP.handle(act, btn);
  if (act === "newFolder") { const name = await dialog({ title: "Nová složka", input: "Název složky", ok: "Vytvořit" }); if (name) { const id = await createFolder(name); if (id) { S.view = { type: "folder", id }; draw(); } } }
  else if (act === "home") { S.view = { type: "home" }; draw(); }
  else if (act === "addNotes") openPicker(fid);
  else if (act === "rename") { const name = await dialog({ title: "Přejmenovat složku", input: "Název složky", value: S.data.folders[fid].name, ok: "Uložit" }); if (name) write({ [`folders/${fid}/name`]: name }); }
  else if (act === "delFolder") { const n = Object.keys(S.data.items[fid] || {}).length; if (await confirmDlg("Smazat složku?", `Složka „${esc(S.data.folders[fid].name)}“${n ? ` a odkazy na ${n} not v ní` : ""} se smaže. Samotné soubory na Drive zůstanou.`, "Smazat")) { if (await write({ [`folders/${fid}`]: null, [`items/${fid}`]: null })) { S.view = { type: "home" }; draw(); } } }
  else if (act === "remove") write({ [`items/${fid}/${btn.dataset.file}`]: null });
  else if (act === "move") {
    const others = folderList().filter((f) => f.id !== fid); if (!others.length) return toast("Nejdřív založte druhou složku.");
    const to = await dialog({ title: "Přesunout do složky", ok: "Přesunout", body: `<div class="dk-choose">${others.map((x, i) => `<label class="dk-pick-row"><input type="radio" name="dkm" value="${esc(x.id)}" ${i ? "" : "checked"}><span class="dk-pick-t"><b>${esc(x.name)}</b></span></label>`).join("")}</div>`, onMount: Object.assign(() => {}, { result: (o) => $("input[name=dkm]:checked", o)?.value }) });
    if (to) { const id = btn.dataset.file, it = S.data.items[fid][id]; write({ [`items/${fid}/${id}`]: null, [`items/${to}/${id}`]: { title: it.title || titleFor(id), addedAt: Date.now() } }); }
  } else if (act === "resync") scheduleSync(0);
}
function bind() {
  document.addEventListener("click", (e) => {
    if (!S.area || !S.area.contains(e.target)) return;
    const b = e.target.closest("[data-act]"); if (b && b.type !== "checkbox") { e.stopPropagation(); onAction(b); return; }
    const o = e.target.closest("[data-open]"); if (o) { window.openPdfViewer?.(o.dataset.open, o.dataset.title); return; }
    const f = e.target.closest("[data-folder]"); if (f) { S.view = { type: "folder", id: f.dataset.folder }; draw(); }
  });
  document.addEventListener("input", (e) => { if (S.area?.contains(e.target)) RP.onInput(e); });
  document.addEventListener("change", (e) => { if (S.area?.contains(e.target) && e.target.dataset?.act === "offline") write({ [`folders/${S.view.id}/offline`]: e.target.checked }); });
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && S.area?.contains(e.target) && e.target.matches("[data-open],[data-folder]")) e.target.click(); });
}

/* ── Spuštění ────────────────────────────────────────────────────── */
async function start() {
  if (S.started || !ctx()) return; S.started = true;
  const { auth, db, ref, onValue } = ctx();
  S.uid = auth.currentUser?.uid || localStorage.getItem("10space.uid"); if (!S.uid) return;
  try { localStorage.setItem("10space.uid", S.uid); } catch (e) { /* bez úložiště */ }
  await loadSnapshot();
  if (S.pendingView && S.data.folders[S.pendingView.id]) { S.view = S.pendingView; S.pendingView = null; } // bez připojení žádná živá data nedorazí, pohled se obnoví z uložených
  navigator.storage?.persist?.().catch(() => {});
  const listen = () => {
    if (S.listening || !online()) return; S.listening = true;
    onValue(ref(db, `/userDecks/${S.uid}`), (s) => { S.data = norm(s.val()); S.dataLive = true; S.dataErr = null; if (S.pendingView) { if (S.data.folders[S.pendingView.id]) S.view = S.pendingView; S.pendingView = null; } rerender(); scheduleSync(); }, (err) => { S.dataErr = err?.code || err?.message || "chyba"; rerender(); });
    onValue(ref(db, "/repertoar"), (s) => { window.repertoar = s.val() || {}; refreshNext(); RP.onData(); scheduleSync(); });
    const fk = ctx().user?.email; if (fk) onValue(ref(db, `/favorites/${fk.replace(/\./g, "_").replace(/@/g, "_at_")}`), (s) => RP.setFavorites(s.val()), () => RP.setFavorites({}));
    onValue(ref(db, "/akce"), (s) => { S.akce = s.val() || {}; refreshNext(); rerender(); scheduleSync(); });
    onValue(ref(db, "/program"), (s) => { S.program = s.val() || {}; refreshNext(); rerender(); scheduleSync(); });
  };
  listen();
  window.addEventListener("online", () => { listen(); scheduleSync(300); rerender(); });
  window.addEventListener("offline", rerender);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleSync(800); });
  bind(); rerender();
}

const RP = createRepertoire({ S, ctx, esc, $, toast, dialog, ICON, online, pinChip, rerender, draw });

/* Služby pro zbytek aplikace (PDF viewer čte offline noty a anotace přes ně) */
window.tenDecks = {
  start, render, pick, sync: () => scheduleSync(0), _state: S, _kv: kv,
  getView: () => ({ ...S.view }), setView: (v) => { if (!v) return; if (v.type === "home" || v.type === "repertoar" || (v.type === "folder" && S.data.folders[v.id])) { S.view = v; rerender(); } else if (v.type === "folder") S.pendingView = v; }, // data složek ještě nedorazila: pohled se obnoví, až budou
  async pinnedBytes(fileId, modified) { // verze uložená v zařízení; online jen pokud je aktuální
    try {
      const hit = await (await openCache()).match(cacheUrl(fileId)); if (!hit) return null;
      if (online() && modified && hit.headers.get("X-Modified") !== modified) return null;
      return await hit.arrayBuffer();
    } catch (e) { return null; }
  },
  async offlineAnnot(fileId, layerKey) { // vrací uloženou vrstvu anotací téhož tvaru jako v RTDB
    const uid = S.uid || localStorage.getItem("10space.uid"), rec = await kv.get(`annot:${uid}:${fileId}`);
    if (!rec) return null; S.stats = S.stats || {}; S.stats.annotHits = (S.stats.annotHits || 0) + 1;
    const layer = layerKey === "public" ? rec.public : layerKey === uid ? rec.own : undefined;
    return layer === undefined ? null : (layer || {}); // záznam existuje, vrstva může být prázdná
  },
  async annotWritten(fileId, layerKey, page, data) { // změna anotací se hned propíše i do offline kopie
    const uid = S.uid, key = `annot:${uid}:${fileId}`, rec = await kv.get(key); if (!rec) return;
    const slot = layerKey === "public" ? "public" : layerKey === uid ? "own" : null; if (!slot) return;
    rec[slot] = rec[slot] || {}; rec[slot].pagesV2 = rec[slot].pagesV2 || {};
    if (data === null) delete rec[slot].pagesV2[page]; else rec[slot].pagesV2[page] = data;
    await kv.set(key, rec); S.annot[fileId] = { own: countAnn(rec.own), pub: countAnn(rec.public) };
  }
};

/* Hlavní skript mohl požádat o spuštění dřív, než se tento modul načetl (start po přihlášení z úložiště) */
if (window.__tenStartRequested) { start().then(() => { const a = document.getElementById("content-area"); if (a && document.getElementById("tab-decks")?.classList.contains("active")) render(a); }); }

/* Service worker: aplikace se otevře i bez připojení */
if ("serviceWorker" in navigator) {
  const reg = () => navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("Service worker:", e.message));
  document.readyState === "complete" ? reg() : window.addEventListener("load", reg);
}
