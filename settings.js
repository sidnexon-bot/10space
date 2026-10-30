/* 10space – Nastavení člena (stránka Nastavení z profilového menu).
   Ukládá se do /userActivity/{e-mail}/settings (smí číst a zapisovat jen sám člen) a do localStorage, takže se režim použije hned
   při startu a nastavení putuje mezi zařízeními.
   • Vzhled: světlý / tmavý / podle systému,
   • Přehled: které karty se zobrazují a v jakém pořadí.
   Rozhraní pro aplikaci: tenSettings.boot() (hned při startu), start() (po přihlášení), render(el) (stránka), setTheme(mode), dashboardCards(). */
(function () {
  "use strict";
  var LS = "10space-theme", LSS = "10space-settings";
  var CARDS = [
    { id: "projekty", title: "Nadcházející projekty", desc: "Nejbližší akce s počtem dní do konání" },
    { id: "recent", title: "Nedávno otevřeno", desc: "Soubory, které jsi naposledy otevřel" },
    { id: "notes", title: "Mé poznámky", desc: "Osobní poznámka, ukládá se průběžně" },
    { id: "todo", title: "To-do z projektů", desc: "Nedokončené úkoly z riderů projektů" },
    { id: "kody", title: "Otevřené kódy", desc: "Otevřené kódy projektů a režie (jen pro čtení)" },
    { id: "shares", title: "Sdílené odkazy", desc: "Aktivní odkazy sdílené mimo 10men" }
  ];
  var THEMES = [["light", "Světlý"], ["dark", "Tmavý"], ["system", "Podle systému"]];
  var S = { theme: null, dashboard: { order: CARDS.map(function (c) { return c.id; }), hidden: [] } };
  var started = false, saveTimer = 0, mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var ctx = function () { return window.__tenCtx; };
  var key = function () { var u = ctx() && ctx().user; return u && u.email ? u.email.replace(/\./g, "_").replace(/@/g, "_") : ""; };
  var ids = CARDS.map(function (c) { return c.id; });
  var card = function (id) { return CARDS.filter(function (c) { return c.id === id; })[0]; };

  // ── data ──
  function cleanDash(d) {
    d = d || {};
    var order = (Array.isArray(d.order) ? d.order : []).filter(function (i, p, a) { return ids.indexOf(i) >= 0 && a.indexOf(i) === p; });
    var hidden = (Array.isArray(d.hidden) ? d.hidden : []).filter(function (i, p, a) { return ids.indexOf(i) >= 0 && a.indexOf(i) === p; });
    ids.forEach(function (i) { if (order.indexOf(i) < 0) order.push(i); }); // nová karta se objeví na konci
    return { order: order, hidden: hidden };
  }
  function legacyTheme() { try { return localStorage.getItem("darkMode") === "1" ? "dark" : "light"; } catch (e) { return "light"; } }
  function savedTheme() { try { var t = localStorage.getItem(LS); if (t === "light" || t === "dark" || t === "system") return t; } catch (e) { /* bez uložení */ } return legacyTheme(); }
  function loadLocal() {
    S.theme = savedTheme();
    try { var raw = localStorage.getItem(LSS + ":" + key()); if (raw) S.dashboard = cleanDash(JSON.parse(raw).dashboard); } catch (e) { /* výchozí */ }
  }
  function persist() {
    try { localStorage.setItem(LS, S.theme); localStorage.setItem("darkMode", isDark() ? "1" : "0"); if (key()) localStorage.setItem(LSS + ":" + key(), JSON.stringify({ dashboard: S.dashboard })); } catch (e) { /* bez uložení */ }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var c = ctx(); if (!c || !c.set || !key() || navigator.onLine === false) return;
      try { Promise.resolve(c.set(c.ref(c.db, "/userActivity/" + key() + "/settings"), { theme: S.theme, dashboard: S.dashboard })).catch(function () { /* zkusí se příště */ }); } catch (e) { /* offline */ }
    }, 600);
  }

  // ── vzhled ──
  function isDark() { return S.theme === "dark" || (S.theme === "system" && !!mq && mq.matches); }
  function applyTheme() {
    var d = isDark();
    document.body.classList.toggle("dark", d); document.documentElement.classList.toggle("dark", d);
    if (window.tenChrome) window.tenChrome(d);
  }
  function setTheme(mode) {
    if (mode !== "light" && mode !== "dark" && mode !== "system") return;
    S.theme = mode; applyTheme(); persist(); refreshPage();
  }
  if (mq) (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(function () { if (S.theme === "system") applyTheme(); });

  // ── karty Přehledu ──
  function dashboardCards() { return S.dashboard.order.filter(function (i) { return S.dashboard.hidden.indexOf(i) < 0; }); }
  function setDash(next) { S.dashboard = cleanDash(next); persist(); refreshPage(); }
  function move(id, dir) {
    var vis = dashboardCards(), i = vis.indexOf(id), j = i + dir; if (i < 0 || j < 0 || j >= vis.length) return;
    var order = S.dashboard.order.slice(), a = order.indexOf(vis[i]), b = order.indexOf(vis[j]);
    order[a] = vis[j]; order[b] = vis[i]; setDash({ order: order, hidden: S.dashboard.hidden });
  }
  function hide(id) { setDash({ order: S.dashboard.order, hidden: S.dashboard.hidden.concat(id) }); }
  function show(id) { setDash({ order: S.dashboard.order.filter(function (i) { return i !== id; }).concat(id), hidden: S.dashboard.hidden.filter(function (i) { return i !== id; }) }); }

  // ── stránka ──
  var area = null;
  var ICON = {
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 15 12 9 18 15"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };
  function pageHtml() {
    var vis = dashboardCards(), hidden = S.dashboard.hidden;
    var shown = vis.map(function (id, i) {
      var c = card(id);
      return '<div class="st-row" data-card="' + id + '"><div class="st-t"><div class="st-name">' + esc(c.title) + '</div><div class="st-desc">' + esc(c.desc) + '</div></div><div class="st-acts">' +
        '<button type="button" class="st-ic" data-up="' + id + '" aria-label="Posunout výš: ' + esc(c.title) + '" title="Výš"' + (i === 0 ? " disabled" : "") + ">" + ICON.up + "</button>" +
        '<button type="button" class="st-ic" data-down="' + id + '" aria-label="Posunout níž: ' + esc(c.title) + '" title="Níž"' + (i === vis.length - 1 ? " disabled" : "") + ">" + ICON.down + "</button>" +
        '<button type="button" class="st-ic" data-hide="' + id + '" aria-label="Odebrat z Přehledu: ' + esc(c.title) + '" title="Odebrat">' + ICON.minus + "</button></div></div>";
    }).join("") || '<div class="st-empty">Přehled je prázdný. Přidej karty níže.</div>';
    var more = hidden.map(function (id) {
      var c = card(id);
      return '<div class="st-row" data-card="' + id + '"><div class="st-t"><div class="st-name">' + esc(c.title) + '</div><div class="st-desc">' + esc(c.desc) + '</div></div><div class="st-acts"><button type="button" class="drive-toolbar-btn" data-show="' + id + '">' + ICON.plus + "<span>Přidat</span></button></div></div>";
    }).join("");
    var seg = THEMES.map(function (t) { return '<button type="button" role="radio" aria-checked="' + (S.theme === t[0]) + '" class="' + (S.theme === t[0] ? "on" : "") + '" data-theme="' + t[0] + '">' + t[1] + "</button>"; }).join("");
    var isDefault = JSON.stringify(S.dashboard) === JSON.stringify(cleanDash(null));
    return '<div class="st-wrap"><h1 class="st-title">Nastavení</h1><h2 class="st-h">Přizpůsobit</h2>' +
      '<div class="dashboard-card st-card"><div class="dashboard-card-title">Vzhled</div><div class="st-row st-row-seg"><div class="st-t"><div class="st-name">Výchozí režim</div><div class="st-desc">Světlý, tmavý, nebo podle nastavení telefonu či počítače. Platí na všech tvých zařízeních.</div></div>' +
      '<div class="st-seg" role="radiogroup" aria-label="Výchozí režim">' + seg + "</div></div></div>" +
      '<div class="dashboard-card st-card"><div class="dashboard-card-title">Přehled</div><p class="st-hint">Vyber, které karty se na Přehledu zobrazují, a nastav jejich pořadí.</p>' + shown + "</div>" +
      (more ? '<div class="dashboard-card st-card"><div class="dashboard-card-title">Další karty</div>' + more + "</div>" : "") +
      '<div class="st-foot"><button type="button" class="drive-toolbar-btn" data-reset="1"' + (isDefault ? " disabled" : "") + "><span>Obnovit výchozí Přehled</span></button></div></div>";
  }
  function refreshPage() {
    if (!area || !area.isConnected || !area.querySelector(".st-wrap")) return;
    var top = document.scrollingElement ? document.scrollingElement.scrollTop : 0, mt = area.scrollTop;
    area.innerHTML = pageHtml(); area.scrollTop = mt; if (document.scrollingElement) document.scrollingElement.scrollTop = top;
  }
  function onClick(e) {
    var t = e.target.closest && e.target.closest("[data-theme],[data-up],[data-down],[data-hide],[data-show],[data-reset]");
    if (!t || !area || !area.contains(t)) return;
    if (t.dataset.theme) return setTheme(t.dataset.theme);
    if (t.dataset.up) return move(t.dataset.up, -1);
    if (t.dataset.down) return move(t.dataset.down, 1);
    if (t.dataset.hide) return hide(t.dataset.hide);
    if (t.dataset.show) return show(t.dataset.show);
    if (t.dataset.reset) return setDash(null);
  }
  function render(el) {
    area = el; area.innerHTML = pageHtml();
    if (!area.__stBound) { area.__stBound = true; area.addEventListener("click", onClick); }
  }

  // ── start ──
  function boot() { loadLocal(); applyTheme(); }
  function start() {
    if (started) return; var c = ctx(); if (!c || !c.get || !key()) return; started = true;
    loadLocal(); applyTheme();
    Promise.resolve(c.get(c.ref(c.db, "/userActivity/" + key() + "/settings"))).then(function (snap) {
      var v = snap && snap.val && snap.val(); if (!v) { persist(); return; }
      if (v.theme === "light" || v.theme === "dark" || v.theme === "system") S.theme = v.theme;
      if (v.dashboard) S.dashboard = cleanDash(v.dashboard);
      applyTheme();
      try { localStorage.setItem(LS, S.theme); localStorage.setItem(LSS + ":" + key(), JSON.stringify({ dashboard: S.dashboard })); } catch (e) { /* bez uložení */ }
      refreshPage();
      if (typeof window.__tenSettingsChanged === "function") window.__tenSettingsChanged();
    }).catch(function () { /* bez připojení platí místní nastavení */ });
  }

  window.tenSettings = { boot: boot, start: start, render: render, setTheme: setTheme, dashboardCards: dashboardCards, theme: function () { return S.theme; }, isDark: isDark, _state: function () { return S; } };
})();
