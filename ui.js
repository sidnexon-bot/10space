/* 10space – společné služby aplikace (načítá se v <head> jako běžný skript, před hlavním modulem):
   • tenDialog  – modální okna místo alert/confirm/prompt prohlížeče
   • tenMenu    – kontextové menu (popover) u tlačítka
   • tenCache   – krátkodobá cache výsledků (localStorage, platnost v ms)
   • tenData    – záloha čtení z databáze: při výpadku se použijí naposledy uložená data (IndexedDB)
   • tenResume  – po výpadku, zavření nebo znovunačtení naváže tam, kde uživatel skončil (do 2 minut)
   • indikátor připojení nahoře
   Vypnutí: odebrat <script src="ui.js"> a <link href="ui.css"> z <head>. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var reduced = function () { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* plné nebo zakázané úložiště */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* nic */ } }
  };

  /* ── Cache s platností ───────────────────────────────────────────── */
  var tenCache = {
    get: function (key, ttl) { try { var o = JSON.parse(ls.get("10space.cache." + key) || "null"); if (o && Date.now() - o.t <= ttl) return o.v; } catch (e) { /* poškozený záznam */ } return undefined; },
    set: function (key, v) { ls.set("10space.cache." + key, JSON.stringify({ t: Date.now(), v: v })); },
    del: function (key) { ls.del("10space.cache." + key); }
  };

  /* ── Modální dialogy ─────────────────────────────────────────────── */
  var dq = [], dBusy = false, dSeq = 0;
  function dialog(spec) {
    return new Promise(function (resolve) { dq.push({ spec: spec, resolve: resolve }); dNext(); });
  }
  function dNext() {
    if (dBusy || !dq.length) return;
    dBusy = true;
    var job = dq.shift(), s = job.spec, id = "tn" + (++dSeq), prev = document.activeElement;
    var ov = document.createElement("div");
    ov.className = "tn-ov";
    ov.innerHTML = '<div class="tn-dlg" role="' + (s.kind === "alert" ? "alertdialog" : "dialog") + '" aria-modal="true" aria-labelledby="' + id + 't" aria-describedby="' + id + 'm">' +
      '<h2 id="' + id + 't">' + esc(s.title) + "</h2>" +
      (s.message ? '<p id="' + id + 'm">' + esc(s.message) + "</p>" : "") +
      (s.kind === "prompt" ? '<input class="tn-in" id="' + id + 'i" maxlength="200" autocomplete="off" placeholder="' + esc(s.placeholder || "") + '" value="' + esc(s.value || "") + '">' : "") +
      '<div class="tn-actions' + (s.kind === "choose" ? " tn-stack" : "") + '">' + (s.kind === "choose"
        ? s.buttons.map(function (b, i) { return '<button type="button" class="tn-btn ' + (b.primary ? "tn-primary" : "") + '" data-r="' + i + '">' + esc(b.label) + "</button>"; }).join("")
        : (s.kind === "alert" ? "" : '<button type="button" class="tn-btn" data-r="0">' + esc(s.cancel || "Zrušit") + "</button>") +
          '<button type="button" class="tn-btn ' + (s.danger ? "tn-danger" : "tn-primary") + '" data-r="1">' + esc(s.ok || "OK") + "</button>") + "</div></div>";
    document.body.appendChild(ov);
    var dlg = $(".tn-dlg", ov), input = $(".tn-in", ov), okBtn = $('[data-r="' + (s.kind === "choose" ? "0" : "1") + '"]', ov), cancelBtn = $('[data-r="0"]', ov);
    var closed = false;
    function result(yes) {
      if (s.kind === "choose") return typeof yes === "number" ? yes : -1;
      if (s.kind === "prompt") return yes ? input.value : null;
      if (s.kind === "confirm") return !!yes;
      return undefined;
    }
    function close(yes) {
      if (closed) return; closed = true;
      document.removeEventListener("keydown", key, true);
      ov.classList.add("tn-out");
      setTimeout(function () { ov.remove(); dBusy = false; try { if (prev && prev.focus && document.contains(prev)) prev.focus(); } catch (e) { /* prvek zmizel */ } job.resolve(result(yes)); dNext(); }, reduced() ? 0 : 150);
    }
    function key(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(s.kind === "alert"); }
      else if (e.key === "Enter" && s.kind === "choose") { e.preventDefault(); e.stopPropagation(); var f = document.activeElement; close(f && f.dataset && f.dataset.r != null ? +f.dataset.r : 0); }
      else if (e.key === "Enter" && !(e.target && e.target.matches && e.target.matches('[data-r="0"]'))) { e.preventDefault(); e.stopPropagation(); if (s.kind === "prompt" && !input.value.trim() && s.required !== false) { input.focus(); return; } close(true); }
      else if (e.key === "Tab") {
        var f = [].slice.call(dlg.querySelectorAll("input,button")).filter(function (x) { return !x.disabled; });
        if (!f.length) return;
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
      }
    }
    document.addEventListener("keydown", key, true);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(s.kind === "alert"); });
    ov.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-r]"); if (!b) return; if (s.kind === "choose") return close(+b.dataset.r); if (b.dataset.r === "1" && s.kind === "prompt" && !input.value.trim() && s.required !== false) { input.focus(); return; } close(b.dataset.r === "1"); });
    requestAnimationFrame(function () { ov.classList.add("tn-in-open"); });
    (input || (s.danger && cancelBtn) || okBtn).focus();
    if (input) input.select();
  }
  var tenDialog = {
    alert: function (message, o) { o = o || {}; message = String(message == null ? "" : message); return dialog({ kind: "alert", title: o.title || (/^Chyba/i.test(message) ? "Něco se nepovedlo" : "Oznámení"), message: message, ok: o.ok || "OK" }); },
    confirm: function (message, o) { o = o || {}; return dialog({ kind: "confirm", title: o.title || "Potvrďte", message: String(message), ok: o.ok || "OK", cancel: o.cancel, danger: o.danger !== false && /smaz|trval|deaktiv/i.test(String(message)) }); },
    choose: function (title, message, buttons) { return dialog({ kind: "choose", title: title, message: message, buttons: buttons }); },
    prompt: function (message, value, o) { o = o || {}; return dialog({ kind: "prompt", title: o.title || String(message).replace(/:\s*$/, ""), message: o.hint || "", value: value || "", ok: o.ok || "OK", placeholder: o.placeholder || "", required: o.required }); }
  };
  /* alert() jen oznamuje, takže ho lze nahradit bezpečně; confirm() a prompt() se záměrně nepřepisují
     (vracely by slib, který je vždy „pravda“): ta místa v aplikaci volají tenDialog přímo. */
  window.alert = function (m) { tenDialog.alert(m); };

  /* ── Kontextové menu ─────────────────────────────────────────────── */
  var menu = null;
  function menuClose(refocus) {
    if (!menu) return;
    var m = menu; menu = null;
    document.removeEventListener("pointerdown", m.onDown, true); document.removeEventListener("keydown", m.onKey, true);
    window.removeEventListener("resize", m.onAway); window.removeEventListener("scroll", m.onAway, true);
    m.el.classList.remove("open");
    setTimeout(function () { m.el.remove(); }, reduced() ? 0 : 180);
    if (refocus && m.anchor && m.anchor.focus) try { m.anchor.focus(); } catch (e) { /* nic */ }
  }
  function menuOpen(anchor, items, o) {
    menuClose();
    o = o || {};
    var el = document.createElement("div");
    el.className = "tn-menu"; el.setAttribute("role", "menu");
    el.innerHTML = items.filter(Boolean).map(function (it, i) {
      return '<button type="button" role="menuitem" class="tn-mi' + (it.danger ? " tn-mi-danger" : "") + '" style="--i:' + i + '" data-i="' + i + '"' + (it.disabled ? " disabled" : "") + '>' +
        (it.icon ? '<span class="tn-mi-ic">' + it.icon + "</span>" : "") + '<span class="tn-mi-t">' + esc(it.label) + "</span></button>";
    }).join("");
    document.body.appendChild(el);
    var list = items.filter(Boolean), r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, vw = innerWidth, vh = innerHeight;
    var left = Math.max(8, Math.min(r.right - w, vw - w - 8)), below = r.bottom + 6 + h <= vh - 8, top = below ? r.bottom + 6 : Math.max(8, r.top - h - 6);
    el.style.left = left + "px"; el.style.top = top + "px";
    el.style.transformOrigin = (r.right - left - 18) + "px " + (below ? "0" : "100%");
    var m = { el: el, anchor: anchor };
    m.onDown = function (e) { if (!el.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) menuClose(false); };
    m.onAway = function () { menuClose(false); };
    m.onKey = function (e) {
      var b = [].slice.call(el.querySelectorAll(".tn-mi:not(:disabled)")), i = b.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); menuClose(true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); b[(i + 1) % b.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); b[(i - 1 + b.length) % b.length].focus(); }
      else if (e.key === "Tab") { menuClose(false); }
    };
    el.addEventListener("click", function (e) {
      var b = e.target.closest(".tn-mi"); if (!b || b.disabled) return;
      var it = list[+b.dataset.i]; menuClose(true); if (it && it.onClick) setTimeout(function () { it.onClick(); }, 0);
    });
    document.addEventListener("pointerdown", m.onDown, true); document.addEventListener("keydown", m.onKey, true);
    window.addEventListener("resize", m.onAway); window.addEventListener("scroll", m.onAway, true);
    menu = m;
    requestAnimationFrame(function () { el.classList.add("open"); var f = el.querySelector(".tn-mi:not(:disabled)"); if (f && o.focus !== false) f.focus({ preventScroll: true }); });
  }
  var tenMenu = { open: menuOpen, close: function () { menuClose(false); } };

  /* ── Záloha čtení z databáze (IndexedDB) ─────────────────────────────
     Jen nedůvěrná data, která aplikace čte často a která se mění zřídka (soubory, složky, projekty, akce, program,
     repertoár). Nikdy členové (jsou v nich PINy a telefony) ani anotace. */
  var CACHEABLE = [/^\/slozky$/, /^\/repertoar$/, /^\/projekty(\/[^/]+)?$/, /^\/projektKody$/, /^\/akce(\/[^/]+)?$/, /^\/program$/];
  var MAX_AGE = 14 * 24 * 3600 * 1000;
  var dbp;
  function idb() { return dbp || (dbp = new Promise(function (res, rej) { var r = indexedDB.open("10space-data", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; })); }
  function idbGet(k) { return idb().then(function (d) { return new Promise(function (res) { var q = d.transaction("kv").objectStore("kv").get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(undefined); }; }); }).catch(function () { return undefined; }); }
  function idbSet(k, v) { return idb().then(function (d) { return new Promise(function (res) { var t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = res; t.onerror = res; }); }).catch(function () { /* bez úložiště */ }); }
  var timers = {}, lastJson = {};
  function save(path, val) { // zápis se odkládá, ať se velké uzly neukládají při každé drobné změně
    clearTimeout(timers[path]);
    timers[path] = setTimeout(function () { if (val == null) return; idbSet("data:" + path, { t: Date.now(), v: val }); }, 2500);
  }
  function load(path) { return idbGet("data:" + path).then(function (o) { return o && Date.now() - o.t <= MAX_AGE ? o : null; }); }
  function pathOf(r) { try { return decodeURIComponent(new URL(String(r)).pathname) || "/"; } catch (e) { return ""; } }
  function cacheable(p) { return CACHEABLE.some(function (x) { return x.test(p); }); }
  function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
  function fakeSnap(path, v) {
    return {
      key: path.split("/").filter(Boolean).pop() || null, fromCache: true,
      val: function () { return clone(v); }, exists: function () { return v != null; },
      forEach: function (fn) { var o = v || {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) { if (fn({ key: k, val: (function (x) { return function () { return clone(x); }; })(o[k]) }) === true) break; } }
    };
  }
  function withTimeout(p, ms) { return new Promise(function (res, rej) { var t = setTimeout(function () { rej(new Error("timeout")); }, ms); p.then(function (x) { clearTimeout(t); res(x); }, function (e) { clearTimeout(t); rej(e); }); }); }
  var tenData = {
    stale: {},
    get: function (_get, r) {
      var p = pathOf(r);
      if (!cacheable(p)) return _get(r);
      var fromCache = function () {
        return load(p).then(function (o) {
          if (o) { tenData.stale[p] = o.t; return fakeSnap(p, o.v); }
          var m = /^\/(projekty|akce)\/([^/]+)$/.exec(p); // jednotlivý záznam se vezme ze seznamu, který aplikace už načetla
          if (!m) return null;
          return load("/" + m[1]).then(function (all) { return all ? fakeSnap(p, (all.v || {})[m[2]]) : null; });
        });
      };
      if (navigator.onLine === false) return fromCache().then(function (s) { return s || _get(r); });
      return withTimeout(_get(r), 10000).then(function (s) { save(p, s.val()); return s; }, function (e) { return fromCache().then(function (s) { if (s) return s; throw e; }); });
    },
    onValue: function (_onValue, r, cb, err) {
      var p = pathOf(r);
      if (!cacheable(p)) return _onValue(r, cb, err);
      var live = false, gone = false, timer = 0;
      var unsub = _onValue(r, function (s) { live = true; clearTimeout(timer); delete tenData.stale[p]; save(p, s.val()); cb(s); }, err);
      // dokud nedorazí živá data (pomalá síť, výpadek), zobrazí se poslední uložená; živá je pak nahradí
      var feed = function () { if (live || gone) return; load(p).then(function (o) { if (o && !live && !gone) { tenData.stale[p] = o.t; cb(fakeSnap(p, o.v)); } }); };
      if (navigator.onLine === false) feed(); else timer = setTimeout(feed, 250);
      return function () { gone = true; clearTimeout(timer); unsub(); };
    }
  };

  /* ── Stav připojení ──────────────────────────────────────────────── */
  var netEl = null, netTimer = 0;
  function net(show, text, cls) {
    if (!document.body) return;
    if (!netEl) { netEl = document.createElement("div"); netEl.className = "tn-net"; netEl.setAttribute("role", "status"); netEl.setAttribute("aria-live", "polite"); document.body.appendChild(netEl); }
    clearTimeout(netTimer);
    netEl.textContent = text || ""; netEl.className = "tn-net" + (cls ? " " + cls : "");
    requestAnimationFrame(function () { netEl.classList.toggle("show", !!show); });
  }
  function netCheck(first) {
    if (navigator.onLine === false) net(true, "Bez připojení · zobrazuji uložená data", "off");
    else if (!first) { net(true, "Připojeno", "on"); netTimer = setTimeout(function () { net(false); }, 2200); }
  }
  window.addEventListener("offline", function () { netCheck(false); });
  window.addEventListener("online", function () { netCheck(false); });
  document.addEventListener("DOMContentLoaded", function () { netCheck(true); });

  /* ── Navázání na místo, kde uživatel skončil ─────────────────────────
     Stav se ukládá průběžně (každou vteřinu a při zavření) spolu s časem poslední aktivity; po zavření,
     výpadku nebo znovunačtení se obnoví, pokud od poslední aktivity neuplynuly víc než 2 minuty. */
  var RKEY = "10space.resume", RTTL = 120000;
  var R = { uid: null, on: false, restoring: false, pdf: null, pdfAt: 0, timer: 0 };
  var activeTab = function () { var t = $(".sidebar-tab.active"); return t && t.id ? t.id.replace(/^tab-/, "") : null; };
  var contentEl = function () { return document.getElementById("content-area"); };
  var scroller = function () {
    var m = document.querySelector(".main-content");
    // na telefonu se posouvá celá stránka (main-content nescrolluje), na počítači vnitřní panel
    if (m && getComputedStyle(m).overflowY === "visible") return document.scrollingElement || document.documentElement;
    var a = contentEl(); return a && a.scrollHeight > a.clientHeight ? a : m || a;
  };
  function viewerOpen() { return !!(document.querySelector(".pdf2-root") || document.querySelector("#pdf-overlay:not(.hidden)")); }
  function snapshot() {
    var s = { tab: activeTab(), folder: null, projekt: null, pdf: null, viewer: null, deck: null, scroll: 0 };
    if (s.tab === "folders" && window.currentFolder) s.folder = window.currentFolder;
    var h = location.hash || ""; if (h.indexOf("#/projekt/") === 0) s.projekt = h.split("/")[2] || null;
    if (R.pdf && (viewerOpen() || Date.now() - R.pdfAt < 2500)) s.pdf = R.pdf; else R.pdf = null;
    try { s.viewer = window.tenViewers && window.tenViewers.getState ? window.tenViewers.getState() : null; } catch (e) { /* nic */ }
    try { s.deck = s.tab === "decks" && window.tenDecks && window.tenDecks.getView ? window.tenDecks.getView() : null; } catch (e) { /* nic */ }
    var sc = scroller(); s.scroll = sc ? Math.round(sc.scrollTop) : 0;
    return s;
  }
  function persist() {
    if (!R.on || R.restoring || !R.uid) return;
    try { var s = snapshot(); s.uid = R.uid; s.t = Date.now(); ls.set(RKEY, JSON.stringify(s)); } catch (e) { /* nic */ }
  }
  function until(fn, ms) { return new Promise(function (res) { var t0 = Date.now(); (function tick() { var v; try { v = fn(); } catch (e) { v = null; } if (v || Date.now() - t0 > ms) res(v); else setTimeout(tick, 120); })(); }); }
  async function restore() {
    var r = null;
    try { r = JSON.parse(ls.get(RKEY) || "null"); } catch (e) { /* poškozený záznam */ }
    var h = location.hash || "";
    if (!r || r.uid !== R.uid || Date.now() - r.t > RTTL || h.indexOf("#/file/") === 0 || !r.tab) return false;
    R.restoring = true;
    try {
      window.switchTab(r.tab);
      if (r.tab === "folders" && r.folder && r.folder !== "root") {
        await until(function () { return window.driveFolders && Object.keys(window.driveFolders).length; }, 6000);
        var chain = [], cur = r.folder, guard = 0;
        while (cur && window.driveFolders && window.driveFolders[cur] && guard++ < 20) { chain.unshift({ id: cur, name: window.driveFolders[cur].name }); cur = window.driveFolders[cur].parentId; if (cur === "0B23cZAlYDWOndmtIZU45WWJrbWM") break; }
        chain.forEach(function (c) { window.navigateToDriveFolder(c.id, c.name); });
      }
      if (r.tab === "decks" && r.deck && window.tenDecks && window.tenDecks.setView) window.tenDecks.setView(r.deck);
      if (r.projekt && h.indexOf("#/projekt/") !== 0 && window.otevritProjekt) window.otevritProjekt(r.projekt);
      if (r.scroll) { var n = 0; (function sc() { var el = scroller(); if (el) el.scrollTop = r.scroll; if (++n < 6 && el && Math.abs(el.scrollTop - r.scroll) > 4) setTimeout(sc, 250); })(); }
      // přehrávač nebo dokument i PDF mohou být otevřené zároveň, obnoví se obojí
      if (r.viewer && window.tenViewers && window.tenViewers.restore) setTimeout(function () { window.tenViewers.restore(r.viewer); }, 350);
      if (r.pdf && window.openPdfViewer) {
        await until(function () { return window.driveFiles && Object.keys(window.driveFiles).length; }, 3000); // velikost souboru je potřeba pro pojistku proti pádu
        setTimeout(function () { window.openPdfViewer(r.pdf.id, r.pdf.title); }, 200);
      }
    } finally { setTimeout(function () { R.restoring = false; persist(); }, 600); }
    return true;
  }
  /* Pojistka proti cyklu pádů: otevírání velkého PDF může stránku ukončit (hlavně na iPhonu při nedostatku paměti).
     Při otevření se zapíše značka, po vykreslení první stránky se smaže. Najde-li se při startu značka, aplikace se při
     otevírání restartovala: soubor se označí a místo automatického znovuotevření (navázání na místo) se zobrazí volba. */
  var OPENKEY = "10space.pdfOpen", HEAVYKEY = "10space.heavyPdf", HEAVYTTL = 30 * 24 * 3600 * 1000;
  function heavyMap() { try { return JSON.parse(ls.get(HEAVYKEY) || "{}") || {}; } catch (e) { return {}; } }
  function sizeMB(id) { var f = (window.driveFiles || {})[id]; return f && f.size ? (+f.size / 1048576) : 0; }
  function isHeavy(id) { var t = heavyMap()[id]; return !!t && Date.now() - t < HEAVYTTL; }
  function setHeavy(id, on) { var h = heavyMap(); if (on) h[id] = Date.now(); else delete h[id]; var k = Object.keys(h); if (k.length > 60) k.sort(function (a, b) { return h[a] - h[b]; }).slice(0, k.length - 60).forEach(function (x) { delete h[x]; }); ls.set(HEAVYKEY, JSON.stringify(h)); }
  try {
    var pend = JSON.parse(ls.get(OPENKEY) || "null");
    if (pend && pend.id && Date.now() - pend.t < 180000) {
      setHeavy(pend.id, true); window.tenCrashedPdf = pend.id;
      try { var tr = JSON.parse(ls.get("10space.pdfTrace") || "null"); if (tr && tr.id === pend.id) window.tenCrashTrace = tr.lines; } catch (e2) { /* bez stopy */ }
    }
    ls.del(OPENKEY); ls.del("10space.pdfTrace");
  } catch (e) { /* poškozený záznam */ }
  // při běžném zavření nebo obnovení stránky přijde pagehide a značka se smaže; při pádu nebo ukončení procesu ne
  window.addEventListener("pagehide", function () { ls.del(OPENKEY); ls.del("10space.pdfTrace"); });
  // Stopa otevírání: pár posledních kroků a stav pláten se průběžně zapisuje do zařízení. Při pádu zůstane a po restartu se
  // ukáže ve volbě, takže je vidět, kde se otevírání zaseklo (načítání, rozbor souboru, vykreslování).
  var TRACEKEY = "10space.pdfTrace", traceBuf = [];
  function trace(step, extra) {
    var t0 = R.opening ? R.opening.t : Date.now();
    traceBuf.push(Math.round((Date.now() - t0) / 100) / 10 + " s: " + step + (extra ? " " + extra : ""));
    if (traceBuf.length > 14) traceBuf.shift();
    ls.set(TRACEKEY, JSON.stringify({ id: R.opening && R.opening.id, lines: traceBuf }));
  }
  function sampleCanvases() {
    var cs = [].slice.call(document.querySelectorAll(".pdf2-root canvas, #pdf-stage canvas")), px = 0;
    cs.forEach(function (c) { px += c.width * c.height; });
    var info = document.querySelector('.pdf2-root [data-role="pageinfo"]'), bar = document.querySelector(".pdf2-root .pdf2-bar>i");
    var heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + " MB heap" : "";
    return "plátna " + cs.length + " (" + (px / 1e6).toFixed(1) + " Mpx)" + (info ? ", " + info.textContent : "") + (bar && !cs.length ? ", načteno " + bar.style.width : "") + (heap ? ", " + heap : "");
  }
  var lastSample = "";
  function traceTick() {
    try { if (!R.opening) return; var smp = sampleCanvases(); if (smp !== lastSample) { lastSample = smp; trace("stav", smp); } } catch (e) { /* diagnostika je jen pomůcka */ }
  }
  function pdfLoaded() { return !!(document.querySelector(".pdf2-root canvas") || document.querySelector("#pdf-stage canvas")); }
  function checkOpening() {
    if (!R.opening) return;
    var age = Date.now() - R.opening.t;
    if ((pdfLoaded() && age > 1500) || (!viewerOpen() && age > 1500) || age > 120000) { R.opening = null; ls.del(OPENKEY); }
  }
  async function heavyChoice(id, title, orig) {
    var mb = sizeMB(id), what = mb ? " (" + (mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)) + " MB)" : "";
    var detail = window.tenCrashTrace && window.tenCrashedPdf === id ? "\n\nPodrobnosti pro opravu:\n" + window.tenCrashTrace.slice(-6).join("\n") : "";
    var c = await tenDialog.choose("Tyto noty se nepodařilo otevřít", "Při otevírání not „" + (title || "soubor") + "“" + what + " se aplikace restartovala, nejspíš kvůli nedostatku paměti zařízení. Jak je chcete otevřít?" + detail, [
      { label: "Otevřít v prohlížeči PDF v zařízení", primary: true }, { label: "Úsporné zobrazení (bez poznámek)" }, { label: "Stáhnout soubor" }, { label: "Zkusit znovu normálně" }, { label: "Zrušit" }]);
    if (c === 0) { var w = null; try { w = window.open("", "_blank"); } catch (e) { /* zablokováno */ } if (window.tenViewers && window.tenViewers.openNative) return window.tenViewers.openNative(id, (title || "noty").replace(/\.pdf$/i, "") + ".pdf", w); }
    if (c === 1 && window.openPdfViewerLegacy) { R.opening = { id: id, t: Date.now() }; ls.set(OPENKEY, JSON.stringify({ id: id, t: Date.now() })); R.pdf = null; return window.openPdfViewerLegacy(id, title); }
    if (c === 2 && window.tenViewers && window.tenViewers.download) return window.tenViewers.download(id, (title || "noty").replace(/\.pdf$/i, "") + ".pdf");
    if (c === 3) { setHeavy(id, false); return window.openPdfViewer(id, title); }
  }

  /* Kontrola před otevřením: sken, jehož stránky jsou jediný obří obrázek (stovky megapixelů), čtečka po rozbalení do paměti
     nemusí unést a na telefonu ukončí stránku. Rozměry obrázků se přečtou přímo z bajtů souboru (bez rozbalování). */
  var HUGEPX = 50e6;
  function scanImages(buf) {
    var u8 = new Uint8Array(buf), dec = new TextDecoder("latin1"), CH = 4 * 1048576, out = [];
    for (var o = 0; o < u8.length; o += CH) {
      var txt = dec.decode(u8.subarray(o, Math.min(u8.length, o + CH + 1024))), re = /\/Subtype\s*\/Image/g, m;
      while ((m = re.exec(txt))) {
        if (m.index >= CH) break; // přesah patří další části
        var a = txt.lastIndexOf("obj", m.index), b = txt.indexOf("stream", m.index), d = txt.slice(a < 0 ? 0 : a, b < 0 ? m.index + 600 : b);
        var w = /\/Width\s+(\d+)/.exec(d), h = /\/Height\s+(\d+)/.exec(d);
        if (w && h) out.push({ w: +w[1], h: +h[1] });
      }
    }
    return out;
  }
  async function hugeCheck(buf, id, title) {
    var imgs;
    try { imgs = scanImages(buf); } catch (e) { return false; /* kontrola je jen pojistka */ }
    var big = imgs.filter(function (i) { return i.w * i.h > HUGEPX; });
    if (!big.length) return false;
    var m = big.reduce(function (a, i) { return i.w * i.h > a.w * a.h ? i : a; });
    try { trace("obří obrázek " + m.w + "×" + m.h + " (" + (m.w * m.h / 1e6).toFixed(0) + " Mpx), stran s ním " + big.length); } catch (e) { /* bez stopy */ }
    var name = (title || "noty").replace(/\.pdf$/i, "") + ".pdf";
    var c = await tenDialog.choose("Tyto noty jsou příliš velký sken", "Stránky not „" + (title || "soubor") + "“ jsou obrázky o velikosti asi " + m.w + "×" + m.h + " bodů (" + (m.w * m.h / 1e6).toFixed(0) + " megapixelů). Naše čtečka je do paměti zařízení nemusí unést a aplikace by se mohla restartovat. Poznámky se v prohlížeči PDF v zařízení psát nedají.", [
      { label: "Otevřít v prohlížeči PDF v zařízení", primary: true }, { label: "Stáhnout soubor" }, { label: "Přesto otevřít v čtečce" }, { label: "Zrušit" }]);
    if (c === 2) return false;
    R.opening = null; ls.del(OPENKEY); R.pdf = null;
    if (c === 0) { var w = null; try { w = window.open("", "_blank"); } catch (e) { /* zablokováno */ } if (window.tenViewers && window.tenViewers.openNative) window.tenViewers.openNative(id, name, w); }
    else if (c === 1 && window.tenViewers && window.tenViewers.download) window.tenViewers.download(id, name);
    return true;
  }
  window.tenPdfGuard = { check: hugeCheck, scan: scanImages };

  var tenResume = {
    init: function (uid) {
      if (R.on) return; R.uid = uid; R.on = true;
      var o = window.openPdfViewer;
      if (typeof o === "function") window.openPdfViewer = function (id, title) {
        if (isHeavy(id)) return heavyChoice(id, title, o);
        try { R.pdf = { id: id, title: title }; R.pdfAt = Date.now(); R.opening = { id: id, t: Date.now() }; ls.set(OPENKEY, JSON.stringify({ id: id, t: Date.now() })); } catch (e) { /* bez značky se jen vypne pojistka */ }
        try { traceBuf = []; lastSample = ""; trace("otevírání začalo", (sizeMB(id) ? sizeMB(id).toFixed(1) + " MB" : "velikost neznámá") + ", okno " + innerWidth + "×" + innerHeight + " @" + (window.devicePixelRatio || 1) + "x"); } catch (e) { /* diagnostika nesmí zabránit otevření */ }
        return o.apply(this, arguments);
      };
      R.timer = setInterval(function () { checkOpening(); if (!document.hidden) persist(); }, 1000);
      R.traceTimer = setInterval(traceTick, 250);
      document.addEventListener("visibilitychange", persist); window.addEventListener("pagehide", persist); window.addEventListener("hashchange", persist);
    },
    restore: restore,
    flush: persist, // uloží stav hned (pro testy)
    clear: function () { ls.del(RKEY); }
  };

  /* Krátké oznámení, které se samo skryje (potvrzení úspěchu), na rozdíl od dialogu nic neblokuje */
  var toastEl = null, toastT = 0;
  function tenToast(msg) {
    if (!document.body) return;
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "tn-toast"; toastEl.setAttribute("role", "status"); toastEl.setAttribute("aria-live", "polite"); document.body.appendChild(toastEl); }
    clearTimeout(toastT); toastEl.textContent = String(msg == null ? "" : msg);
    requestAnimationFrame(function () { toastEl.classList.add("show"); });
    toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 2800);
  }
  window.showToast = tenToast;

  /* ── Nabídka akcí: na telefonu bottom sheet, na tabletu a počítači modální okno ───────────
     Položky mají tvar { label, icon, danger, action (text s JS jako dřív) | onClick (funkce) }. */
  var sheetFns = [], sheetModal = null;
  function isPhone() {
    try { return matchMedia("(max-width: 599px)").matches || (matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600); } catch (e) { return innerWidth < 600; }
  }
  function sheetClose() {
    if (!sheetModal) return;
    var m = sheetModal; sheetModal = null;
    document.removeEventListener("keydown", m.onKey, true);
    m.ov.classList.add("tn-out");
    setTimeout(function () { m.ov.remove(); try { if (m.prev && m.prev.focus && document.contains(m.prev)) m.prev.focus(); } catch (e) { /* prvek zmizel */ } }, reduced() ? 0 : 150);
  }
  function sheetAct(it) { // text pro onclick položky; funkce se uloží a zavolá se po zavření nabídky
    if (!it.onClick) return it.action || "";
    sheetFns.push(it.onClick); return "tenSheet.run(" + (sheetFns.length - 1) + ")";
  }
  function sheetOpen(title, items) {
    sheetFns = []; sheetClose();
    items = (items || []).filter(Boolean);
    if (isPhone()) return false; // bottom sheet vykreslí hlavní skript stejně jako dřív
    var prev = document.activeElement, ov = document.createElement("div");
    ov.className = "tn-ov";
    ov.innerHTML = '<div class="tn-dlg tn-sheetdlg" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><h2>' + esc(title) + '</h2><div class="tn-list" role="menu">' +
      items.map(function (it) { return '<button type="button" role="menuitem" class="tn-mi' + (it.danger ? " tn-mi-danger" : "") + '"' + (it.icon ? "" : " data-noicon") + '>' + (it.icon ? '<span class="tn-mi-ic">' + it.icon + "</span>" : "") + '<span class="tn-mi-t">' + esc(it.label) + "</span></button>"; }).join("") +
      "</div></div>";
    document.body.appendChild(ov);
    var btns = [].slice.call(ov.querySelectorAll(".tn-mi"));
    btns.forEach(function (b, i) {
      var it = items[i], act = sheetAct(it);
      b.addEventListener("click", function () {
        sheetClose();
        if (it.onClick) setTimeout(function () { it.onClick(); }, 0);
        else if (act) setTimeout(function () { try { (new Function(act))(); } catch (e) { console.error("Akce nabídky selhala:", e); } }, 0);
      });
    });
    var m = { ov: ov, prev: prev };
    m.onKey = function (e) {
      var i = btns.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); sheetClose(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
      else if (e.key === "Tab") { e.preventDefault(); btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus(); }
    };
    document.addEventListener("keydown", m.onKey, true);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) sheetClose(); });
    sheetModal = m;
    requestAnimationFrame(function () { ov.classList.add("tn-in-open"); if (btns[0]) btns[0].focus({ preventScroll: true }); });
    return true;
  }
  var tenSheet = { open: sheetOpen, close: sheetClose, act: sheetAct, esc: esc, isPhone: isPhone, run: function (i) { var f = sheetFns[i]; if (typeof window.closeBottomSheet === "function") window.closeBottomSheet(); if (f) setTimeout(f, 0); } };

  /* Menu karty projektu (tři tečky vpravo nahoře) */
  var IC = {
    open: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    folder: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    share: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    trash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>'
  };
  window.openProjektMenu = function (btn, id) {
    var p = (window.__projektyMap || {})[id]; if (!p) return;
    var c = window.__tenCtx, admin = !!(c && c.user && c.user.role === "ADMIN");
    var items = [
      { label: "Otevřít projekt", icon: IC.open, onClick: function () { window.otevritProjekt(id); } },
      p.driveFolderId ? { label: "Drive složka", icon: IC.folder, onClick: function () { window.switchTab("folders"); setTimeout(function () { window.navigateToDriveFolder(p.driveFolderId, p.nazev || ""); }, 300); } } : null,
      { label: "Sdílet projekt", icon: IC.share, onClick: function () { window.shareProjekt(id); } },
      admin ? { label: "Smazat projekt", icon: IC.trash, danger: true, onClick: function () { window.smazatProjekt(id); } } : null
    ].filter(Boolean);
    window.openBottomSheet(p.nazev || "Projekt", items); // telefon: bottom sheet, tablet a počítač: modální okno
  };

  window.tenCache = tenCache; window.tenDialog = tenDialog; window.tenMenu = tenMenu; window.tenSheet = tenSheet; window.tenData = tenData; window.tenResume = tenResume;
})();
