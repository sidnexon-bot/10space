/* 10space – indikátor čekání (loading bar).
   Tenký pruh nahoře ukazuje, že aplikace na něco čeká, a po chvíli i co (štítek pod pruhem).
   • Každé volání Cloud Functions / Storage přes fetch se sleduje samo (okno fetch je obalené), takže pruh běží u všeho,
     co čeká na server: otevření souboru, sdílení, oprávnění, verze, přejmenování, mazání, nahrávání…
   • tenBusy.start(štítek) vrací funkci, která čekání ukončí; tenBusy.wrap(promise, štítek) to udělá za volajícího.
   • tenBusy.hold(klíč, štítek) ukáže navíc krycí kartu přes celou aplikaci (odkaz na soubor při startu), tenBusy.release(klíč) ji skryje.
   • Krátké operace (do ~150 ms) nic neblikne; zapomenutá operace se po 60 s ukončí sama, pruh nezůstane viset. */
(function () {
  "use strict";
  if (window.tenBusy) return;
  var SHOW_AFTER = 150, LABEL_AFTER = 700, MAX_AGE = 60000, SLOW_AFTER = 12000;
  var seq = 0, ops = {}, holds = {}, showT = 0, labelT = 0, slowT = 0, pillT = 0, bar, pill, cover, coverText, shown = false;

  var css = ".ten-busy-bar{position:fixed;left:0;right:0;top:env(safe-area-inset-top,0px);height:3px;z-index:5200;pointer-events:none;overflow:hidden;opacity:0;transition:opacity .25s}" +
    ".ten-busy-bar.on{opacity:1}" +
    ".ten-busy-bar i{position:absolute;top:0;bottom:0;left:0;width:40%;border-radius:0 3px 3px 0;background:#EE220C;box-shadow:0 0 8px rgba(238,34,12,.55);animation:tenBusySlide 1.25s ease-in-out infinite}" +
    "body.dark .ten-busy-bar i{background:#ff453a;box-shadow:0 0 8px rgba(255,69,58,.6)}" +
    "@keyframes tenBusySlide{0%{transform:translateX(-100%)}60%{transform:translateX(160%)}100%{transform:translateX(260%)}}" +
    ".ten-busy-pill{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 12px);transform:translate(-50%,-8px);z-index:5201;pointer-events:none;opacity:0;transition:opacity .25s,transform .25s;" +
    "background:rgba(28,28,30,.88);color:#fff;font:500 13px/1.2 -apple-system,system-ui,sans-serif;padding:7px 14px;border-radius:999px;max-width:86vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;gap:8px;align-items:center}" +
    ".ten-busy-pill.on{opacity:1;transform:translate(-50%,0)}" +
    "body.dark .ten-busy-pill{background:rgba(242,242,247,.92);color:#111}" +
    "body:has(.impersonate-banner:not(.hidden)) .ten-busy-pill{top:calc(env(safe-area-inset-top,0px) + 50px)}" +
    "body:has(.impersonate-banner:not(.hidden)) .ten-busy-bar i{background:#fff;box-shadow:none}" +
    ".ten-busy-pill b{width:12px;height:12px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:tenBusySpin .7s linear infinite;flex:none;opacity:.8}" +
    "@keyframes tenBusySpin{to{transform:rotate(360deg)}}" +
    ".ten-busy-cover{position:fixed;inset:0;z-index:2999;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(242,242,247,.94);color:#1c1c1e;" +
    "font:500 15px/1.35 -apple-system,system-ui,sans-serif;text-align:center;padding:24px;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}" +
    ".ten-busy-cover.on{display:flex}" +
    "body.dark .ten-busy-cover{background:rgba(0,0,0,.94);color:#f2f2f7}" +
    ".ten-busy-cover .tbc-sp{width:36px;height:36px;border:3px solid #e5e5ea;border-top-color:#EE220C;border-radius:50%;animation:tenBusySpin .8s linear infinite}" +
    "body.dark .ten-busy-cover .tbc-sp{border-color:#3a3a3c;border-top-color:#ff453a}" +
    ".ten-busy-cover small{display:block;color:#8e8e93;font-weight:400;font-size:13px;min-height:18px}" +
    ".ten-busy-cover button{margin-top:4px;background:none;border:none;color:#007aff;font:500 14px -apple-system,system-ui,sans-serif;cursor:pointer;padding:8px 12px;display:none}" +
    "@media (prefers-reduced-motion:reduce){.ten-busy-bar i{animation:none;width:100%;opacity:.7}.ten-busy-pill b,.ten-busy-cover .tbc-sp{animation-duration:2s}}";

  function build() {
    if (bar || !document.body) return;
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    bar = document.createElement("div"); bar.className = "ten-busy-bar"; bar.setAttribute("role", "progressbar"); bar.setAttribute("aria-label", "Načítání"); bar.setAttribute("aria-hidden", "true"); bar.innerHTML = "<i></i>";
    pill = document.createElement("div"); pill.className = "ten-busy-pill"; pill.setAttribute("role", "status"); pill.setAttribute("aria-live", "polite"); pill.innerHTML = "<b></b><span></span>";
    cover = document.createElement("div"); cover.className = "ten-busy-cover"; cover.setAttribute("role", "status");
    cover.innerHTML = '<div class="tbc-sp"></div><div><span class="tbc-t"></span><small class="tbc-s"></small></div><button type="button">Skrýt</button>';
    coverText = cover.querySelector(".tbc-t");
    cover.querySelector("button").addEventListener("click", function () { holds = {}; refresh(); });
    document.body.appendChild(bar); document.body.appendChild(pill); document.body.appendChild(cover);
    refresh();
  }

  // jiný ukazatel už říká totéž (spinner přes obrazovku, skeleton seznamu, načítání ve čtečce, panel nahrávání, stav připojení): štítek se vynechá, pruh zůstává
  var COVERED = "#spinner.active, .skeleton-row, .pdf2-loading, #upload-progress-panel:not(.hidden), .tn-net.show, .ten-busy-cover.on";
  function covered() { try { return !!document.querySelector(COVERED); } catch (e) { return false; } }
  function showPill() {
    var cur = newest(ops);
    if (cur && !covered()) { pill.querySelector("span").textContent = cur.label; pill.classList.add("on"); } else pill.classList.remove("on");
  }
  function newest(map) { var best = null; for (var k in map) if (map[k].label && (!best || map[k].t >= best.t)) best = map[k]; return best; }
  function refresh() {
    var n = Object.keys(ops).length, h = Object.keys(holds).length;
    clearTimeout(showT); clearTimeout(labelT); clearTimeout(slowT); clearInterval(pillT);
    if (!bar) { if (n || h) document.addEventListener("DOMContentLoaded", build, { once: true }); return; }
    // krycí karta (odkaz na soubor při startu): hned
    var hh = newest(holds);
    cover.classList.toggle("on", h > 0);
    if (h) {
      coverText.textContent = hh ? hh.label : "Načítám…";
      var small = cover.querySelector(".tbc-s"), btn = cover.querySelector("button"); small.textContent = ""; btn.style.display = "none";
      slowT = setTimeout(function () { small.textContent = "Trvá to déle než obvykle…"; btn.style.display = "inline-block"; }, SLOW_AFTER);
    }
    if (n || h) {
      if (shown) { bar.classList.add("on"); } else showT = setTimeout(function () { shown = true; bar.classList.add("on"); }, h ? 0 : SHOW_AFTER);
      var o = newest(ops);
      if (o && !h) labelT = setTimeout(function () { showPill(); pillT = setInterval(showPill, 400); }, Math.max(0, LABEL_AFTER - (Date.now() - o.t)));
      else pill.classList.remove("on");
    } else { shown = false; bar.classList.remove("on"); pill.classList.remove("on"); }
  }

  function start(label) {
    var id = ++seq, done = false, timer;
    ops[id] = { label: label || "", t: Date.now() };
    refresh();
    function end() { if (done) return; done = true; clearTimeout(timer); delete ops[id]; refresh(); }
    timer = setTimeout(end, MAX_AGE);
    return end;
  }
  function wrap(p, label) { var end = start(label); return Promise.resolve(p).then(function (v) { end(); return v; }, function (e) { end(); throw e; }); }
  function hold(key, label) {
    holds[key] = { label: label || "", t: Date.now() };
    refresh();
    setTimeout(function () { release(key); }, MAX_AGE);
  }
  function release(key) { if (holds[key]) { delete holds[key]; refresh(); } }

  // ── sledování fetch: volání serveru a Storage; pozadí (náhledy, předehřátí) se nepočítá ──
  var TRACK = /(cloudfunctions\.net|\.run\.app|firebasestorage\.googleapis\.com|storage\.googleapis\.com|googleapis\.com\/upload)/i;
  var SKIP = /(getThumbnail|listShareTokens|identitytoolkit|securetoken|accounts\.google|\.woff2?(\?|$))/i; // adresy funkcí jsou malými písmeny (getthumbnail-….run.app)
  var LABELS = [
    [/getFileStream/i, "Stahuji soubor…"], [/getFileUrl/i, "Otevírám dokument…"], [/getDriveTree/i, "Načítám soubory…"],
    [/uploadFileVersion/i, "Nahrávám novou verzi…"], [/uploadFile|startResumable|finishResumable/i, "Nahrávám soubor…"],
    [/deleteFile/i, "Mažu…"], [/renameFile/i, "Přejmenovávám…"], [/moveFile/i, "Přesouvám…"],
    [/listFileRevisions/i, "Načítám verze…"], [/restoreFileRevision/i, "Obnovuji verzi…"],
    [/ShareToken|SharePin/i, "Pracuji se sdíleným odkazem…"], [/getFileAcl|setDriveAcl/i, "Načítám oprávnění…"],
    [/generateProjektWiki/i, "Generuji text…"], [/indexDrive/i, "Prohledávám Disk…"], [/EvidCislo/i, "Přiděluji číslo…"],
    [/migrateAnnotations/i, "Převádím poznámky…"], [/kody|Kod/i, "Načítám kódy…"]
  ];
  function labelFor(url) { for (var i = 0; i < LABELS.length; i++) if (LABELS[i][0].test(url)) return LABELS[i][1]; return "Načítám…"; }

  var nativeFetch = window.fetch && window.fetch.bind(window);
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var url = "";
      try { url = typeof input === "string" ? input : (input && input.url) || String(input); } catch (e) { /* bez adresy */ }
      if (!TRACK.test(url) || SKIP.test(url) || (init && (init.keepalive || init.priority === "low" || init.noBusy))) return nativeFetch(input, init);
      var end = start(labelFor(url)), bodyUsed = false;
      return nativeFetch(input, init).then(function (res) {
        // čekání trvá, dokud se nepřečte tělo odpovědi (JSON, PDF…); čtení po proudech si řídí volající sám (má vlastní průběh)
        ["arrayBuffer", "blob", "json", "text", "formData"].forEach(function (m) {
          var orig = res[m]; if (typeof orig !== "function") return;
          res[m] = function () { bodyUsed = true; return orig.apply(res, arguments).then(function (v) { end(); return v; }, function (e) { end(); throw e; }); };
        });
        setTimeout(function () { if (!bodyUsed) end(); }, 60);
        return res;
      }, function (e) { end(); throw e; });
    };
  }

  window.tenBusy = { start: start, wrap: wrap, hold: hold, release: release };

  // odkaz na soubor nebo projekt otevřený při startu: hned ukázat, že se něco děje (přihlášení, data, čtečka)
  var h = location.hash || "";
  if (h.indexOf("#/file/") === 0) hold("deeplink", "Otevírám dokument…");
  else if (h.indexOf("#/projekt/") === 0) hold("deeplink", "Otevírám projekt…");

  if (document.body) build(); else document.addEventListener("DOMContentLoaded", build, { once: true });
})();
