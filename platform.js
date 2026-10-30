/* 10space – rozpoznání platformy pro spodní plovoucí lištu (stejné jako v 10base).
   Apple (iPhone, iPad, Mac) a vše ostatní → "liquid glass"; Android → styl Samsung One UI.
   Pro vyzkoušení: přidej ?platform=apple nebo ?platform=android do adresy. */
(function () {
  var q = new URLSearchParams(location.search).get('platform');
  var android = q === 'android' || (q !== 'apple' && /Android/i.test(navigator.userAgent || ''));
  document.documentElement.setAttribute('data-platform', android ? 'android' : 'apple');
})();

/* Barva lišty prohlížeče a stavového řádku (theme-color, color-scheme, pozadí html) sleduje režim aplikace:
   černá v tmavém režimu (OLED), jinak světlá. Zůstává jediný tag a jen se mění jeho obsah (nemaže se a nevytváří znovu,
   iOS Safari to jinak nepřebírá). Tagy s media="(prefers-color-scheme…)" se odstraní, protože by přebíjely ruční přepnutí
   režimu, když se liší od nastavení systému. Volá se i z aplikace: window.tenChrome(true|false). */
(function () {
  var LIGHT = '#f2f2f7', DARK = '#000000';
  function one(name) {
    var all = document.querySelectorAll('meta[name="' + name + '"]'), keep = null, i;
    for (i = 0; i < all.length; i++) { if (!keep && !all[i].hasAttribute('media')) keep = all[i]; }
    for (i = 0; i < all.length; i++) { if (all[i] !== keep) all[i].remove(); }
    if (!keep) { keep = document.createElement('meta'); keep.setAttribute('name', name); document.head.appendChild(keep); }
    return keep;
  }
  window.tenChrome = function (dark) {
    var bg = dark ? DARK : LIGHT, root = document.documentElement;
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.style.backgroundColor = bg;
    one('theme-color').setAttribute('content', bg);
    // iOS 26 ignoruje theme-color a barvu horní lišty bere z prvku těsně u horního okraje: pevný proužek se barví s režimem
    var t = document.getElementById('ten-tint');
    if (!t) {
      t = document.createElement('div'); t.id = 'ten-tint'; t.setAttribute('aria-hidden', 'true');
      t.style.cssText = 'position:fixed;top:0;left:0;right:0;height:max(env(safe-area-inset-top),6px);pointer-events:none;z-index:0';
      (document.body || document.documentElement).appendChild(t);
    }
    t.style.backgroundColor = bg;
    one('color-scheme').setAttribute('content', dark ? 'dark' : 'light');
  };
  function sync() { window.tenChrome(document.body.classList.contains('dark')); }
  document.addEventListener('DOMContentLoaded', function () {
    sync();
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  });
})();
