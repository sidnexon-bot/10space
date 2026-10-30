/* 10space – kódy projektů (nákladová čísla): číslo akce E1234, jeho účetní položky E1234-001, -002 … a obecné kódy G1234 (režie).
   Čísla a položky zapisuje jen server (funkce projektKodyApi, jen administrátor), tady se čtou z /projektKody a zobrazují:
   • řádek „Interní kód“ mezi informacemi o akci v detailu projektu (kopírování; administrátor spravuje položky -002 …),
   • záložka Projekty, sekce „Kódy“: seznam všech kódů (nejdřív režijní, potom projekty) s oknem se všemi položkami,
   • karta „Otevřené kódy“ na Přehledu (jen pro čtení).
   Vypnutí: odebrat <script src="kody.js"> a <link href="kody.css"> z <head>. */
(function () {
  "use strict";
  var API = "https://us-central1-base-39f52.cloudfunctions.net/projektKodyApi";
  var S = { loaded: false, byAkce: {}, cisla: {}, polozky: {} }, started = false, sig = "";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var ctx = function () { return window.__tenCtx; };
  var isAdmin = function () { var u = ctx() && ctx().user; return !!u && (u.role === "ADMIN" || u.role === "Owner"); };
  var toast = function (m) { (window.showToast || window.alert)(m); };
  var COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>';
  var MORE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>';
  var ICON = { plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>', edit: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    lock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    unlock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-1.8"/></svg>' };

  function sorted(cislo) { return Object.keys(S.polozky[cislo] || {}).sort(); }

  function numberBlock(cislo, o) {
    var rec = S.cisla[cislo] || {}, list = sorted(cislo), admin = isAdmin();
    var items = list.map(function (k) {
      var p = S.polozky[cislo][k], closed = p.stav === "uzavrena";
      return '<li class="kd-it' + (closed ? " closed" : "") + '"><button type="button" class="kd-code sm" data-copy="' + esc(p.kod) + '" title="Kopírovat kód">' + esc(p.kod) + COPY + '</button><span class="kd-t">' + esc(p.nazev) + '</span>' +
        (closed ? '<span class="kd-st">uzavřená</span>' : "") + (admin ? '<button type="button" class="kd-more" data-more="' + esc(cislo) + "|" + k + '" aria-label="Akce položky" aria-haspopup="menu">' + MORE + "</button>" : "") + "</li>";
    }).join("");
    return '<div class="kd-num" data-cislo="' + esc(cislo) + '"><div class="kd-head"><button type="button" class="kd-code" data-copy="' + esc(cislo) + '" title="Kopírovat číslo">' + esc(cislo) + COPY + "</button>" +
      (o.title ? '<span class="kd-name">' + esc(rec.nazev || "") + "</span>" : "") +
      (o.title && admin ? '<button type="button" class="kd-more" data-grename="' + esc(cislo) + '" aria-label="Přejmenovat kód">' + MORE + "</button>" : "") + '</div><ul class="kd-list">' + items + "</ul>" +
      (admin ? '<button type="button" class="kd-add" data-add="' + esc(cislo) + '">+ Přidat položku</button>' : "") + "</div>";
  }

  // obsah řádku „Interní kód“: číslo akce, jeho položky a (administrátor) tlačítko pro správu položek
  function rowHtml(akceId) {
    var have = S.byAkce[akceId];
    if (!S.loaded) return "";
    if (!have || !have.cislo) return isAdmin() ? '<button type="button" class="kd-add" data-assign="' + esc(akceId) + '">Přidělit kód</button>' : "";
    var c = have.cislo, admin = isAdmin();
    var chips = sorted(c).map(function (k) {
      var p = S.polozky[c][k], closed = p.stav === "uzavrena";
      return '<button type="button" class="kd-code sm' + (closed ? " closed" : "") + '" data-copy="' + esc(p.kod) + '" title="' + esc(p.nazev + (closed ? " (uzavřená)" : "")) + '">' + esc(p.kod) + "</button>";
    }).join("");
    return '<button type="button" class="kd-code" data-copy="' + esc(c) + '" title="Kopírovat číslo">' + esc(c) + COPY + "</button>" + chips +
      (admin ? '<button type="button" class="kd-more" data-manage="' + esc(c) + '" aria-label="Spravovat položky kódu" aria-haspopup="menu">' + MORE + "</button>" : "");
  }

  // vykreslení do míst, která si stránka připravila; bez změny dat se DOM nepřekresluje (podpis), aby pozorovatel nezacyklil
  function fill(el, html) { var h = html.length + ":" + sig; if (el.dataset.kdSig === h) return; el.dataset.kdSig = h; el.innerHTML = html; }
  function renderAll() {
    var s = sig = JSON.stringify([S.loaded, S.byAkce, S.cisla, S.polozky, isAdmin()]);
    document.querySelectorAll("[data-kod-akce]").forEach(function (b) { var c = S.byAkce[b.dataset.kodAkce]; var t = c && c.cislo ? c.cislo : ""; if (b.textContent !== t) b.textContent = t; });
    document.querySelectorAll("[data-kod-row]").forEach(function (d) { var h = rowHtml(d.dataset.kodRow); fill(d, h); var r = d.closest(".projekt-info-row"); if (r) r.style.display = h ? "" : "none"; });
    var l = document.getElementById("kody-list"); if (l) fill(l, listHtml());
    var o = document.getElementById("kody-open"); if (o) fill(o, openCodesHtml());
    if (M.el) { if (S.cisla[M.cislo]) fill(M.el.querySelector(".kl-mc"), modalHtml(M.cislo)); else closeCode(); }
    sig = s;
  }


  // ── Sekce Kódy v záložce Projekty ──────────────────────────────────────────
  var fmtD = function (ms) { return ms ? new Date(ms).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }) : "—"; };
  // Číslo je otevřené, dokud má aspoň jednu aktivní položku; zavřené je, když jsou všechny uzavřené (datum = poslední uzavření).
  function stavOf(c) {
    var list = sorted(c).map(function (k) { return S.polozky[c][k]; });
    var open = !list.length || list.some(function (p) { return p.stav !== "uzavrena"; });
    var closedAt = open ? 0 : list.reduce(function (m, p) { return Math.max(m, p.upraveno || p.vytvoreno || 0); }, 0);
    return { open: open, closedAt: closedAt };
  }
  function rowsOf() {
    var all = Object.keys(S.cisla).map(function (c) { return { c: c, r: S.cisla[c], st: stavOf(c) }; });
    var g = all.filter(function (x) { return x.r.typ === "G"; }).sort(function (a, b) { return (a.r.nazev || "").localeCompare(b.r.nazev || "", "cs"); });
    var e = all.filter(function (x) { return x.r.typ !== "G"; }).sort(function (a, b) { return (b.r.vytvoreno || 0) - (a.r.vytvoreno || 0); });
    return g.concat(e);
  }
  var stText = function (open) { return '<span class="kl-st' + (open ? "" : " closed") + '">' + (open ? "otevřený" : "zavřený") + "</span>"; };

  function listHtml() {
    if (!S.loaded) return '<div class="kl-empty">Načítám kódy…</div>';
    var rows = rowsOf();
    var add = isAdmin() ? '<div class="kl-bar"><button type="button" class="drive-toolbar-btn" data-gnew="1">' + ICON.plus + "<span>Nový režijní kód</span></button></div>" : "";
    if (!rows.length) return add + '<div class="kl-empty">Zatím žádné kódy.</div>';
    return add + '<div class="kl-table" role="table"><div class="kl-h" role="row"><span>Kód</span><span>Název</span><span class="kl-d">Otevřeno</span><span class="kl-d">Uzavřeno</span><span>Stav</span></div>' +
      rows.map(function (x) {
        var g = x.r.typ === "G";
        return '<button type="button" class="kl-row' + (x.st.open ? "" : " is-closed") + '" role="row" data-open-code="' + esc(x.c) + '"><span class="kl-code">' + esc(x.c) + "</span>" +
          '<span class="kl-n">' + esc(x.r.nazev || "—") + (g ? ' <span class="kl-tag">(režie)</span>' : "") + '</span><span class="kl-d">' + fmtD(x.r.vytvoreno) + '</span><span class="kl-d">' + (x.st.open ? "—" : fmtD(x.st.closedAt)) + "</span>" + stText(x.st.open) + "</button>";
      }).join("") + "</div>";
  }

  // Přehled: otevřené kódy s názvem projektu, jen ke čtení
  function openCodesHtml() {
    if (!S.loaded) return '<div class="dashboard-empty">Načítám…</div>';
    var rows = rowsOf().filter(function (x) { return x.st.open; });
    if (!rows.length) return '<div class="dashboard-empty">Žádné otevřené kódy</div>';
    var MAX = 12;
    return rows.slice(0, MAX).map(function (x) { return '<div class="ko-row"><span class="ko-code">' + esc(x.c) + '</span><span class="ko-name">' + esc(x.r.nazev || "—") + "</span></div>"; }).join("") +
      (rows.length > MAX ? '<div class="ko-more">a dalších ' + (rows.length - MAX) + "</div>" : "");
  }

  // Okno s kompletním kódem: položky jako řádky tabulky; administrátor přidává a uzavírá, ostatní jen čtou
  var M = { cislo: null, el: null };
  function modalHtml(c) {
    var rec = S.cisla[c] || {}, st = stavOf(c), admin = isAdmin(), g = rec.typ === "G";
    var items = sorted(c).map(function (k) {
      var p = S.polozky[c][k], closed = p.stav === "uzavrena";
      return '<div class="kt-row' + (closed ? " is-closed" : "") + '" role="row"><button type="button" class="kt-copy kt-code" data-copy="' + esc(p.kod) + '" title="Kopírovat kód">' + esc(p.kod) + "</button>" +
        '<span class="kt-n">' + esc(p.nazev) + "</span>" + stText(!closed) +
        (admin ? '<span class="kt-acts"><button type="button" class="kd-more" data-toggle="' + esc(c) + "|" + k + '" aria-label="' + (closed ? "Znovu otevřít položku" : "Uzavřít položku") + '" title="' + (closed ? "Znovu otevřít" : "Uzavřít") + '">' + (closed ? ICON.unlock : ICON.lock) + "</button>" +
          '<button type="button" class="kd-more" data-more="' + esc(c) + "|" + k + '" aria-label="Další akce položky" aria-haspopup="menu">' + MORE + "</button></span>" : "") + "</div>";
    }).join("");
    var cols = admin ? " kt-admin" : "";
    return '<h2 class="kl-mtitle"><button type="button" class="kt-copy" data-copy="' + esc(c) + '" title="Kopírovat číslo">' + esc(c) + "</button> " + esc(rec.nazev || "—") + (g ? ' <span class="kl-tag">(režie)</span>' : "") + "</h2>" +
      '<div class="kl-meta">Stav: ' + (st.open ? "otevřený" : "zavřený") + " · otevřeno " + fmtD(rec.vytvoreno) + (st.open ? "" : " · uzavřeno " + fmtD(st.closedAt)) + "</div>" +
      '<div class="kt-table' + cols + '" role="table"><div class="kt-h" role="row"><span>Kód</span><span>Název</span><span>Stav</span>' + (admin ? "<span></span>" : "") + "</div>" +
      (items || '<div class="kt-empty">Žádné položky.</div>') + "</div>" +
      (admin ? "" : '<p class="kd-hint" style="margin-top:12px">Položky a jejich uzavírání spravuje administrátor.</p>') +
      '<div class="modal-footer kl-foot">' + (rec.akceId ? '<button type="button" class="modal-btn modal-btn-secondary" data-go-projekt="' + esc(rec.akceId) + '">Otevřít projekt</button>' : "") +
      (admin ? '<button type="button" class="modal-btn modal-btn-secondary" data-add="' + esc(c) + '">+ Přidat položku</button>' : "") +
      '<button type="button" class="modal-btn modal-btn-primary" data-close-code="1">Zavřít</button></div>';
  }
  function closeCode() {
    var el = M.el; if (!el) return; M.el = null; M.cislo = null;
    document.removeEventListener("keydown", onKey, true);
    el.classList.remove("active"); setTimeout(function () { el.remove(); }, 240);
  }
  function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); closeCode(); } }
  function openCode(c) {
    if (!S.cisla[c]) return;
    closeCode();
    var o = document.createElement("div"); o.className = "modal-overlay kl-ov";
    o.innerHTML = '<div class="modal kl-modal" role="dialog" aria-modal="true" aria-label="Kód ' + esc(c) + '"><div class="kl-mc"></div></div>';
    document.body.appendChild(o); M = { cislo: c, el: o };
    o.addEventListener("click", function (e) { if (e.target === o) closeCode(); });
    document.addEventListener("keydown", onKey, true);
    fill(o.querySelector(".kl-mc"), modalHtml(c));
    requestAnimationFrame(function () { o.classList.add("active"); });
  }

  function copy(text) {
    var done = function () { toast("Zkopírováno: " + text); };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
    function fallback() { var t = document.createElement("textarea"); t.value = text; t.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); done(); } catch (e) { toast(text); } t.remove(); }
  }

  async function call(body) {
    var c = ctx(); if (!c || !c.auth.currentUser) throw new Error("Nejste přihlášeni.");
    if (navigator.onLine === false) throw new Error("Bez připojení se kódy zakládat nedají.");
    var tok = await c.auth.currentUser.getIdToken();
    var r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify(body) });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || "Akce se nezdařila.");
    return j;
  }
  async function run(body, ok) {
    try { await call(body); if (ok) toast(ok); }
    catch (e) { window.tenDialog ? window.tenDialog.alert(e.message, { title: "Kód se nepodařilo upravit" }) : alert(e.message); }
  }
  var ask = function (title, value, ph) { return window.tenDialog.prompt(title, value || "", { title: title, ok: "Uložit", placeholder: ph || "" }); };

  function onClick(e) {
    var t = e.target.closest && e.target.closest("[data-copy],[data-more],[data-manage],[data-add],[data-assign],[data-gnew],[data-grename],[data-open-code],[data-close-code],[data-go-projekt],[data-toggle]"); if (!t) return;
    e.stopPropagation();
    if (t.dataset.copy) return copy(t.dataset.copy);
    if (t.dataset.openCode) return openCode(t.dataset.openCode);
    if (t.dataset.closeCode) return closeCode();
    if (t.dataset.goProjekt) { closeCode(); return window.otevritProjekt && window.otevritProjekt(t.dataset.goProjekt); }
    if (!isAdmin()) return;
    if (t.dataset.toggle) {
      var tp = t.dataset.toggle.split("|"), tc = tp[0], tk = tp[1], pp = (S.polozky[tc] || {})[tk]; if (!pp) return;
      if (pp.stav === "uzavrena") return run({ action: "polozka_update", cislo: tc, poradi: tk, stav: "aktivni" }, "Položka znovu otevřena.");
      return window.tenDialog.confirm("Uzavřít položku " + pp.kod + "? Kód zůstane, jen se na ni přestanou nabízet nové platby.", { title: "Uzavřít položku", ok: "Uzavřít", danger: false }).then(function (y) { if (y) return run({ action: "polozka_update", cislo: tc, poradi: tk, stav: "uzavrena" }, "Položka uzavřena."); });
    }
    if (t.dataset.assign) return run({ action: "assign", akceId: t.dataset.assign }, "Kód přidělen.");
    if (t.dataset.gnew) return ask("Nový obecný kód", "", "Např. Občerstvení").then(function (n) { if (n) return run({ action: "general_create", nazev: n }, "Obecný kód vytvořen."); });
    if (t.dataset.grename) { var gc = t.dataset.grename; return ask("Přejmenovat obecný kód", (S.cisla[gc] || {}).nazev).then(function (n) { if (n) return run({ action: "general_rename", cislo: gc, nazev: n }, "Přejmenováno."); }); }
    if (t.dataset.add) { var c1 = t.dataset.add; return ask("Nová položka kódu " + c1, "", "Např. Honoráře").then(function (n) { if (n) return run({ action: "polozka_add", cislo: c1, nazev: n }, "Položka přidána."); }); }
    if (t.dataset.manage) {
      var mc = t.dataset.manage, items = [{ label: "Přidat položku", icon: ICON.plus, onClick: function () { ask("Nová položka kódu " + mc, "", "Např. Honoráře").then(function (n) { if (n) run({ action: "polozka_add", cislo: mc, nazev: n }, "Položka přidána."); }); } }];
      sorted(mc).forEach(function (k) {
        var p = S.polozky[mc][k], closed = p.stav === "uzavrena";
        items.push({ label: "Přejmenovat " + p.kod, icon: ICON.edit, onClick: function () { ask("Přejmenovat položku " + p.kod, p.nazev).then(function (n) { if (n && n !== p.nazev) run({ action: "polozka_update", cislo: mc, poradi: k, nazev: n }, "Přejmenováno."); }); } });
        items.push(closed ? { label: "Znovu otevřít " + p.kod, icon: ICON.unlock, onClick: function () { run({ action: "polozka_update", cislo: mc, poradi: k, stav: "aktivni" }, "Položka znovu otevřena."); } }
          : { label: "Uzavřít " + p.kod, icon: ICON.lock, onClick: function () { window.tenDialog.confirm("Uzavřít položku " + p.kod + "? Kód zůstane, jen se na ni přestanou nabízet nové platby.", { title: "Uzavřít položku", ok: "Uzavřít", danger: false }).then(function (y) { if (y) run({ action: "polozka_update", cislo: mc, poradi: k, stav: "uzavrena" }, "Položka uzavřena."); }); } });
      });
      return window.openBottomSheet("Kód " + mc, items);
    }
    if (t.dataset.more) {
      var pr = t.dataset.more.split("|"), cislo = pr[0], poradi = pr[1], p = (S.polozky[cislo] || {})[poradi]; if (!p) return;
      var closed = p.stav === "uzavrena";
      return window.openBottomSheet(p.kod, [
        { label: "Přejmenovat", icon: ICON.edit, onClick: function () { ask("Přejmenovat položku " + p.kod, p.nazev).then(function (n) { if (n && n !== p.nazev) run({ action: "polozka_update", cislo: cislo, poradi: poradi, nazev: n }, "Přejmenováno."); }); } },
        closed ? { label: "Znovu otevřít", icon: ICON.unlock, onClick: function () { run({ action: "polozka_update", cislo: cislo, poradi: poradi, stav: "aktivni" }, "Položka znovu otevřena."); } }
          : { label: "Uzavřít položku", icon: ICON.lock, onClick: function () { window.tenDialog.confirm("Uzavřít položku " + p.kod + "? Kód zůstane, jen se na ni přestanou nabízet nové platby.", { title: "Uzavřít položku", ok: "Uzavřít", danger: false }).then(function (y) { if (y) run({ action: "polozka_update", cislo: cislo, poradi: poradi, stav: "uzavrena" }, "Položka uzavřena."); }); } }
      ]);
    }
  }

  function start() {
    if (started) return; var c = ctx(); if (!c || !c.onValue) return; started = true;
    c.onValue(c.ref(c.db, "/projektKody"), function (snap) {
      var v = snap.val() || {};
      S = { loaded: true, byAkce: v.byAkce || {}, cisla: v.cisla || {}, polozky: v.polozky || {} };
      renderAll();
    }, function () { /* bez oprávnění nebo připojení se kódy prostě nezobrazí */ });
    document.addEventListener("click", onClick, true);
    var pending = false;
    new MutationObserver(function () { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; renderAll(); }); }).observe(document.body, { childList: true, subtree: true });
  }

  window.tenKody = { start: start, badge: function (akceId) { return '<span class="pc-kod" data-kod-akce="' + esc(akceId) + '"></span>'; }, refresh: renderAll, openCode: openCode, _state: function () { return S; } };
})();
