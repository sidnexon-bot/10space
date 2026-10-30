/* 10space – Repertoár (správa not).
   Karta „Repertoár“ v Osobních deskách pod kartou „Moje složky“: hledání, filtry, oblíbené, otevření not
   v našem PDF vieweru a (pro role ADMIN, ART a Owner) přidání, úprava a smazání skladby.
   Data jsou stejná jako dřív v 10base (RTDB /repertoar, /favorites/{e-mail}), takže se obě aplikace
   shodují. Modul dostane služby z decks.js, sám nic nenačítá. */

/* ID souboru na Disku z odkazu (…/d/ID/…, …?id=ID) nebo holé ID; jiný text (např. „doplnit“) nic nedá */
export function driveIdOf(v) {
  const t = String(v ?? "").trim();
  return (t.match(/\/d\/([\w-]{20,})/) || t.match(/[?&]id=([\w-]{20,})/) || t.match(/^([\w-]{20,})$/) || [])[1] || null;
}
export const fileOf = (s) => s?.driveFileId || driveIdOf(s?.pdf) || null;

const STATUSES = ["Aktivní", "Neaktuální", "Mimo repertoár"];
const VERSIONS = ["", "TTBB", "SATB"];
const EDIT_ROLES = ["ADMIN", "ART", "Owner"];
const HEART_SM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
const DOTS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>';
const FILTER_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>';
/* ikony položek nabídky u skladby (20 px, jako ve zbytku aplikace) */
const sheetIc = (paths, fill) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const IC_HEART = '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>';
const IC_FOLDER_PLUS = '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>';
const IC_EDIT = '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>';
const MUSIC = '<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plural = (n) => (n === 1 ? "skladba" : n >= 2 && n <= 4 ? "skladby" : "skladeb");

export function createRepertoire({ S, ctx, esc, $, toast, dialog, ICON, online, pinChip, rerender, draw }) {
  const R = { q: "", status: "Vše", version: "Vše", fav: {}, favKey: null };

  const songs = () => Object.values(window.repertoar || {}).filter((s) => s && s.id);
  const canEdit = () => EDIT_ROLES.includes(ctx()?.user?.role);
  const favKey = () => { const e = ctx()?.user?.email; return e ? e.replace(/\./g, "_").replace(/@/g, "_at_") : null; };

  function visible() {
    const q = fold(R.q.trim());
    return songs().filter((s) => {
      if (R.status === "Oblíbené" ? !R.fav[s.id] : R.status !== "Vše" && s.status !== R.status) return false;
      if (R.version !== "Vše" && String(s.version || "").toLowerCase() !== R.version.toLowerCase()) return false;
      return !q || [s.name, s.author, s.text_by, s.arranged_by, s.code].some((f) => fold(f).includes(q));
    }).sort((a, b) => (R.fav[b.id] ? 1 : 0) - (R.fav[a.id] ? 1 : 0) || String(a.name).localeCompare(String(b.name), "cs", { numeric: true }));
  }

  /* karta na úvodní stránce osobních desek */
  function card() {
    const n = songs().length, act = songs().filter((s) => s.status === "Aktivní").length;
    return `<div class="dashboard-card dk-card">
    <div class="dashboard-card-title"><span>Repertoár</span></div>
    <div class="dk-rows"><div class="dk-row dk-folder" data-act="rpOpen" role="button" tabindex="0"><span class="dk-ic fold">${MUSIC}</span><span class="dk-t"><b>Všechny skladby</b><small>${n ? `${n} ${plural(n)}, z toho ${act} aktivních` : "Načítám…"}</small></span><span class="dk-go">${ICON.chev}</span></div></div>
  </div>`;
  }

  function row(s) {
    const fid = fileOf(s);
    const meta = [s.author, s.arranged_by && `aranž. ${s.arranged_by}`, s.text_by && s.text_by !== "---" && `text ${s.text_by}`].filter(Boolean).join(" · ");
    const sub = [s.code, s.length].filter(Boolean).join(" · ");
    const chip = s.status === "Aktivní" ? "ok" : s.status === "Mimo repertoár" ? "err" : "pen";
    const acts = `<button class="mp-icon dk-mini rp-more" data-act="rpMenu" data-id="${esc(s.id)}" aria-label="Akce skladby" aria-haspopup="menu" title="Akce">${DOTS}</button>`;
    return `<div class="dk-row has-acts${fid ? "" : " off"}" ${fid ? `data-open="${esc(fid)}" data-title="${esc(s.name || "Noty")}" role="button" tabindex="0"` : ""}>
    <span class="dk-ic">${ICON.pdf}</span>
    <span class="dk-t"><b>${esc(s.name || "Bez názvu")}${R.fav[s.id] ? `<span class="rp-heart" role="img" aria-label="Oblíbená" title="Oblíbená">${HEART_SM}</span>` : ""}${s.version ? ` <em class="rp-ver">${esc(s.version)}</em>` : ""}</b>${meta ? `<small>${esc(meta)}</small>` : ""}${sub ? `<small>${esc(sub)}</small>` : ""}</span>
    <span class="dk-chips"><span class="dk-chip ${chip}">${esc(s.status || "—")}</span>${fid ? pinChip(fid) : `<span class="dk-chip">Bez not</span>`}</span><span class="dk-acts">${acts}</span></div>`;
  }

  function listHtml() {
    const list = visible();
    if (!songs().length) return `<div class="dk-empty"><p>${online() ? "Načítám repertoár…" : "Bez připojení a zatím bez uložených dat."}</p></div>`;
    if (!list.length) return `<div class="dk-empty"><p><b>Nic nenalezeno.</b></p><p>Zkuste upravit hledání nebo filtr.</p></div>`;
    return `<div class="dk-rows">${list.slice(0, 300).map(row).join("")}</div>${list.length > 300 ? `<div class="dk-foot">Zobrazeno 300 z ${list.length}, zpřesněte hledání.</div>` : ""}`;
  }
  const activeFilters = () => [R.status !== "Vše" ? R.status : null, R.version !== "Vše" ? R.version : null].filter(Boolean);
  const countText = () => { const n = visible().length; return [`${n} ${plural(n)}`, ...activeFilters()].join(" · "); };

  /* stránka s celým repertoárem */
  function page() {
    const n = activeFilters().length;
    return `<div class="dk-bar"><button class="mp-icon dk-back" data-act="home" aria-label="Zpět">${ICON.back}</button><h2>Repertoár</h2>
      ${canEdit() ? `<button class="drive-toolbar-btn primary" data-act="rpAdd" ${online() ? "" : "disabled"}>${ICON.plus}<span>Přidat skladbu</span></button>` : ""}</div>
    <div class="dashboard-card dk-card">
      <div class="rp-bar">
        <input class="field" id="rp-q" type="search" placeholder="Hledat skladbu, skladatele, kód…" autocomplete="off" value="${esc(R.q)}">
        <button type="button" class="rp-filter-btn${n ? " on" : ""}" data-act="rpFilterOpen" aria-haspopup="dialog" aria-label="Filtr${n ? `, aktivních ${n}` : ""}">${FILTER_IC}<span>Filtr</span>${n ? `<b>${n}</b>` : ""}</button>
      </div>
      <div class="rp-count" id="rp-count">${countText()}</div>
      <div id="rp-list">${listHtml()}</div>
    </div>`;
  }
  function refreshList() {
    const l = $("#rp-list"); if (!l) return draw();
    l.innerHTML = listHtml(); const c = $("#rp-count"); if (c) c.textContent = countText();
  }

  /* data z databáze se změnila */
  function onData() { if (S.view.type === "repertoar") refreshList(); else rerender(); }
  function setFavorites(v) { R.fav = v || {}; R.favKey = favKey(); onData(); }

  async function writeRoot(path, updates) {
    if (!online()) { toast("Bez připojení nejde repertoár upravovat."); return false; }
    try { const { db, ref, update } = ctx(); await update(ref(db, path), updates); return true; }
    catch (e) { toast(/permission/i.test(e.message || "") ? "Nemáte oprávnění upravovat repertoár." : "Nepodařilo se uložit: " + (e.message || e)); return false; }
  }

  const field = (id, label, value = "", type = "text") => `<label class="rp-f"><span>${label}</span>${type === "area" ? `<textarea class="field" id="${id}" rows="3">${esc(value)}</textarea>` : `<input class="field" id="${id}" value="${esc(value)}" autocomplete="off">`}</label>`;
  const select = (id, label, opts, value) => `<label class="rp-f"><span>${label}</span><select class="field" id="${id}">${opts.map((o) => `<option value="${esc(o)}" ${o === value ? "selected" : ""}>${esc(o || "—")}</option>`).join("")}</select></label>`;

  async function form(title, v, ok, canDelete) {
    const body = `<div class="rp-form">${field("rp-name", "Název", v.name)}${field("rp-author", "Skladatel", v.author)}${field("rp-arr", "Aranžmá", v.arranged_by)}${field("rp-text", "Text", v.text_by)}
      <div class="rp-two">${select("rp-status", "Stav", STATUSES, v.status)}${select("rp-ver", "Verze", VERSIONS, v.version)}</div>
      <div class="rp-two">${field("rp-code", "Kód", v.code)}${field("rp-len", "Délka", v.length)}</div>
      ${field("rp-pdf", "Noty (odkaz z Disku nebo ID souboru)", v.pdf)}${field("rp-note", "Poznámka", v.note, "area")}
      ${canDelete ? `<button type="button" class="dk-link rp-del" id="rp-del">Smazat skladbu</button>` : ""}</div>`;
    const val = (o, id) => $(id, o).value.trim();
    let del = false;
    return dialog({
      title, ok, body,
      onMount: Object.assign((o) => { $("#rp-del", o)?.addEventListener("click", () => { del = true; $("[data-x='1']", o).click(); }); }, {
        result: (o) => del ? { __del: true } : { name: val(o, "#rp-name"), author: val(o, "#rp-author"), arranged_by: val(o, "#rp-arr"), text_by: val(o, "#rp-text"), status: val(o, "#rp-status"), version: val(o, "#rp-ver"), code: val(o, "#rp-code"), length: val(o, "#rp-len"), pdf: val(o, "#rp-pdf"), note: val(o, "#rp-note") }
      })
    });
  }

  async function edit(id) {
    const old = id ? (window.repertoar || {})[id] : null;
    const start = old ? { ...old, pdf: old.pdf || (old.driveFileId ? `https://drive.google.com/file/d/${old.driveFileId}/view` : "") } : { status: "Aktivní" };
    let v = start;
    for (;;) {
      v = await form(old ? "Upravit skladbu" : "Nová skladba", v, "Uložit", !!old);
      if (!v) return;
      if (v.__del) return remove(id);
      if (!v.name) { toast("Zadejte název skladby."); continue; }
      break;
    }
    const sid = id || "r" + Date.now();
    const keep = old && v.pdf === start.pdf;
    const rec = { id: sid, name: v.name, author: v.author, arranged_by: v.arranged_by, text_by: v.text_by, length: v.length, status: v.status || "Aktivní", pdf: v.pdf, code: v.code, note: v.note, version: v.version,
      driveFileId: keep ? old.driveFileId || driveIdOf(v.pdf) : driveIdOf(v.pdf) };
    const updates = {};
    for (const [k, x] of Object.entries(rec)) updates[`${sid}/${k}`] = x === "" || x === undefined ? null : x;
    updates[`${sid}/id`] = sid; // ID zůstává vždy
    if (await writeRoot("/repertoar", updates)) toast(old ? "Skladba upravena" : "Skladba přidána");
  }

  async function remove(id) {
    const s = (window.repertoar || {})[id]; if (!s) return;
    if (await dialog({ title: "Smazat skladbu?", text: `Skladba „${esc(s.name)}“ se smaže z repertoáru. Soubor s notami na Disku zůstane.`, ok: "Smazat", danger: true }))
      if (await writeRoot("/repertoar", { [id]: null })) toast("Skladba smazána");
  }

  async function toggleFav(id) {
    const key = R.favKey || favKey(); if (!key) return;
    const on = !R.fav[id];
    R.fav = { ...R.fav, [id]: on ? true : undefined }; refreshList(); // hned, potvrdí až databáze
    await writeRoot(`/favorites/${key}`, { [id]: on ? true : null });
  }

  /* filtr: jedno okno se stavem i verzí */
  async function openFilter() {
    const chips = (key, vals, cur) => vals.map((v) => `<button type="button" class="rp-pill${cur === v ? " on" : ""}" data-key="${key}" data-val="${esc(v)}">${esc(v)}</button>`).join("");
    const body = `<div class="rp-fgroup"><div class="rp-flabel">Stav</div><div class="rp-pills">${chips("status", ["Vše", ...STATUSES, "Oblíbené"], R.status)}</div></div>
      <div class="rp-fgroup"><div class="rp-flabel">Verze</div><div class="rp-pills">${chips("version", VERSIONS.filter(Boolean).reduce((a, v) => [...a, v], ["Vše"]), R.version)}</div></div>
      <button type="button" class="dk-link" data-reset>Zrušit filtr</button>`;
    const sel = { status: R.status, version: R.version };
    const mark = (o) => o.querySelectorAll(".rp-pill").forEach((b) => b.classList.toggle("on", sel[b.dataset.key] === b.dataset.val));
    const res = await dialog({
      title: "Filtrovat repertoár", ok: "Použít", body,
      onMount: Object.assign((o) => {
        o.addEventListener("click", (e) => {
          if (e.target.closest("[data-reset]")) { sel.status = "Vše"; sel.version = "Vše"; return mark(o); }
          const b = e.target.closest(".rp-pill"); if (!b) return;
          sel[b.dataset.key] = b.dataset.val; mark(o);
        });
      }, { result: () => ({ ...sel }) })
    });
    if (res) { R.status = res.status; R.version = res.version; draw(); }
  }

  /* tři tečky u skladby: oblíbené, přidání do složky, úprava (na telefonu spodní lišta, jinde modální okno) */
  function openRowMenu(id) {
    const s = (window.repertoar || {})[id]; if (!s) return;
    const fid = fileOf(s), ed = online(), fav = !!R.fav[id];
    const items = [
      R.favKey ? { label: fav ? "Odebrat z oblíbených" : "Přidat do oblíbených", icon: sheetIc(IC_HEART, fav), onClick: () => toggleFav(id) } : null,
      fid && ed ? { label: "Přidat do mé složky", icon: sheetIc(IC_FOLDER_PLUS), onClick: () => window.tenDecks?.pick(fid) } : null,
      canEdit() && ed ? { label: "Upravit skladbu", icon: sheetIc(IC_EDIT), onClick: () => edit(id) } : null
    ].filter(Boolean);
    if (!items.length) return toast(ed ? "U této skladby teď nejsou žádné akce." : "Bez připojení nejde skladbu upravovat.");
    window.openBottomSheet(s.name || "Skladba", items);
  }

  /* akce z decks.js */
  async function handle(act, btn) {
    if (act === "rpOpen") { S.view = { type: "repertoar" }; draw(); }
    else if (act === "rpFilterOpen") openFilter();
    else if (act === "rpMenu") openRowMenu(btn.dataset.id);
    else if (act === "rpAdd") edit(null);
  }
  function onInput(e) { if (e.target.id === "rp-q") { R.q = e.target.value; refreshList(); } }

  return { card, page, handle, onInput, onData, setFavorites };
}
