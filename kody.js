/* 10space – kódy projektů (nákladová čísla): číslo akce E1234, jeho účetní položky E1234-001, -002 … a obecné kódy G1234 (režie).
   Čísla a položky zapisuje jen server (funkce projektKodyApi, jen administrátor), tady se čtou z /projektKody a zobrazují:
   • štítek s číslem na kartě projektu,
   • řádek „Interní kód“ mezi informacemi o akci v detailu projektu (kopírování; administrátor spravuje položky -002 …),
   • sekce „Obecné kódy (režie)“ pod seznamem projektů.
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

  function generalHtml() {
    if (!S.loaded) return "";
    var nums = Object.keys(S.cisla).filter(function (c) { return S.cisla[c].typ === "G"; }).sort(function (a, b) { return (S.cisla[a].nazev || "").localeCompare(S.cisla[b].nazev || "", "cs"); });
    if (!nums.length && !isAdmin()) return "";
    return '<div class="kd-general"><div class="kd-gtitle">Obecné kódy (režie)</div><p class="kd-hint">Náklady a příjmy, které nepatří k žádné akci (např. občerstvení, nájem zkušebny), a také zkoušky a soustředění.</p>' +
      (nums.map(function (c) { return numberBlock(c, { title: true }); }).join("") || '<p class="kd-hint">Zatím žádné obecné kódy.</p>') +
      (isAdmin() ? '<button type="button" class="kd-add" data-gnew="1">+ Nový obecný kód</button>' : "") + "</div>";
  }

  // vykreslení do míst, která si stránka připravila; bez změny dat se DOM nepřekresluje (podpis), aby pozorovatel nezacyklil
  function fill(el, html) { var h = html.length + ":" + sig; if (el.dataset.kdSig === h) return; el.dataset.kdSig = h; el.innerHTML = html; }
  function renderAll() {
    var s = sig = JSON.stringify([S.loaded, S.byAkce, S.cisla, S.polozky, isAdmin()]);
    document.querySelectorAll("[data-kod-akce]").forEach(function (b) { var c = S.byAkce[b.dataset.kodAkce]; var t = c && c.cislo ? c.cislo : ""; if (b.textContent !== t) b.textContent = t; });
    document.querySelectorAll("[data-kod-row]").forEach(function (d) { var h = rowHtml(d.dataset.kodRow); fill(d, h); var r = d.closest(".projekt-info-row"); if (r) r.style.display = h ? "" : "none"; });
    var g = document.getElementById("kody-general"); if (g) fill(g, generalHtml());
    sig = s;
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
    var t = e.target.closest && e.target.closest("[data-copy],[data-more],[data-manage],[data-add],[data-assign],[data-gnew],[data-grename]"); if (!t) return;
    e.stopPropagation();
    if (t.dataset.copy) return copy(t.dataset.copy);
    if (!isAdmin()) return;
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

  window.tenKody = { start: start, badge: function (akceId) { return '<span class="pc-kod" data-kod-akce="' + esc(akceId) + '"></span>'; }, refresh: renderAll, _state: function () { return S; } };
})();
