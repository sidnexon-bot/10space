/* Verze aplikace (MAJOR.MINOR.PATCH). Při každém vydání:
   1) zvýšit číslo a datum níže, 2) doplnit CHANGELOG.md, 3) po nasazení označit commit tagem vX.Y.Z (git tag -a vX.Y.Z -m "…").
   Aplikace si tento soubor čas od času stáhne ze serveru; je-li tam vyšší verze než ta, která právě běží, nabídne obnovení. */
globalThis.TEN_VERSION = { app: "10space", version: "1.0.0", date: "2026-10-30" };

(function () {
  if (typeof window === "undefined" || !window.document) return;   // v service workeru se jen nastaví číslo verze
  var V = globalThis.TEN_VERSION, last = 0, shown = false;
  var cmp = function (a, b) { a = String(a).split(".").map(Number); b = String(b).split(".").map(Number); for (var i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) ? 1 : -1; } return 0; };
  function banner(newV) {
    if (shown) return; shown = true;
    var el = document.createElement("div"); el.setAttribute("role", "status");
    el.style.cssText = "position:fixed;left:50%;bottom:calc(96px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:6000;max-width:calc(100vw - 24px);display:flex;align-items:center;gap:12px;padding:10px 12px 10px 16px;border-radius:16px;background:#1c1c1e;color:#fff;font:500 14px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)";
    el.innerHTML = '<span>Je dostupná nová verze ' + newV + '</span><button type="button" style="border:0;border-radius:10px;padding:8px 14px;background:#EE220C;color:#fff;font:600 14px inherit;font-family:inherit;cursor:pointer">Obnovit</button>';
    el.querySelector("button").onclick = function () { location.reload(); };
    document.body.appendChild(el);
  }
  // true = nová verze je venku; false = aktuální; null = nepodařilo se zjistit
  function check(force) {
    if (!force && Date.now() - last < 30 * 60 * 1000) return Promise.resolve(null);
    if (navigator.onLine === false) return Promise.resolve(null);
    last = Date.now();
    return fetch("version.js?_=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
      var m = /version:\s*"(\d+\.\d+\.\d+)"/.exec(t); if (!m) return null;
      var newer = cmp(m[1], V.version) > 0; if (newer) banner(m[1]); return newer ? m[1] : false;
    }).catch(function () { return null; });
  }
  window.tenVersionCheck = check;
  setTimeout(function () { check(true); }, 8000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") check(false); });
})();
