/* 10space – rozpoznání platformy pro spodní plovoucí lištu (stejné jako v 10base).
   Apple (iPhone, iPad, Mac) a vše ostatní → "liquid glass"; Android → styl Samsung One UI.
   Pro vyzkoušení: přidej ?platform=apple nebo ?platform=android do adresy. */
(function () {
  var q = new URLSearchParams(location.search).get('platform');
  var android = q === 'android' || (q !== 'apple' && /Android/i.test(navigator.userAgent || ''));
  document.documentElement.setAttribute('data-platform', android ? 'android' : 'apple');
  if (android) {   // Google Sans Flex se načte předem, ať se při prvním zobrazení nepřeblikne ze záložního písma
    ['latin', 'latin-ext'].forEach(function (s) {
      var l = document.createElement('link'); l.rel = 'preload'; l.as = 'font'; l.type = 'font/woff2'; l.crossOrigin = 'anonymous';
      l.href = 'fonts/google-sans-flex-' + s + '.woff2'; document.head.appendChild(l);
    });
  }
})();

/* Barva lišty prohlížeče a stavového řádku (theme-color, color-scheme, pozadí html) sleduje režim aplikace:
   černá v tmavém režimu (OLED), jinak světlá. Zůstává jediný tag a jen se mění jeho obsah (nemaže se a nevytváří znovu,
   iOS Safari to jinak nepřebírá). Tagy s media="(prefers-color-scheme…)" se odstraní, protože by přebíjely ruční přepnutí
   režimu, když se liší od nastavení systému. Volá se i z aplikace: window.tenChrome(true|false). */
(function () {
  var AND = document.documentElement.getAttribute('data-platform') === 'android';
  var LIGHT = AND ? '#ffffff' : '#f2f2f7', DARK = AND ? '#131314' : '#000000';
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

/* Spodní lišta (Apple, iOS 26 „Liquid Glass“): vrstvy skla a vybraná záložka jako kapka, která se mezi záložkami přesouvá.
   Vrstvy se vkládají sem, aby nebylo nutné měnit značení lišty; na Androidu se nic nevkládá (jiný styl, viz redesign.css). */
document.addEventListener('DOMContentLoaded', function () {
  var bar = document.querySelector('.bottom');
  if (!bar || document.documentElement.getAttribute('data-platform') === 'android' || bar.querySelector('.lg-blur')) return;
  bar.insertAdjacentHTML('afterbegin', '<i class="lg lg-blur" aria-hidden="true"></i><i class="lg lg-edge" aria-hidden="true"></i><i class="lg lg-spec" aria-hidden="true"></i><i class="lg-pill" aria-hidden="true"></i>');
  var pill = bar.querySelector('.lg-pill');
  function place(animate) {
    if (bar.classList.contains('lg-drag')) return;
    var b = bar.querySelector('button.active');
    if (!b || !b.offsetWidth) { pill.style.opacity = 0; return; }
    pill.style.opacity = 1;
    if (!animate) pill.style.transition = 'none';
    pill.style.transform = 'translateX(' + b.offsetLeft + 'px)'; pill.style.width = b.offsetWidth + 'px';
    if (!animate) { void pill.offsetWidth; pill.style.transition = ''; }
  }
  bar._lgPlace = place;
  place(false);
  new MutationObserver(function () { place(true); }).observe(bar, { subtree: true, attributes: true, attributeFilter: ['class'] });
  if (window.ResizeObserver) new ResizeObserver(function () { place(false); }).observe(bar); else window.addEventListener('resize', function () { place(false); });
});

/* Android (Material 3): formuláře v oknech. Nadpis pole se stane zástupným textem uvnitř pole a před něj přijde ikona;
   za sebou jdoucí textová pole tvoří jeden souvislý blok bez dělicích čar (čára se objeví až po ťuknutí do pole),
   výběry a soubory jsou samostatné „pilulky“. Na Applu se nic nemění. Popisek zůstává jako aria-label. */
(function () {
  if (document.documentElement.getAttribute('data-platform') !== 'android') return;
  var P = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  var ICONS = {
    cal: P('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    clock: P('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    note: P('<path d="M5 6h14M5 12h14M5 18h9"/>'),
    cash: P('<rect x="3" y="6.5" width="18" height="11" rx="3"/><circle cx="12" cy="12" r="2.5"/>'),
    tag: P('<path d="M3.5 12.2V5.5a2 2 0 0 1 2-2h6.7l8.3 8.3a2 2 0 0 1 0 2.8l-6.4 6.4a2 2 0 0 1-2.8 0z"/><circle cx="8.3" cy="8.3" r="1.2"/>'),
    folder: P('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
    person: P('<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.7-3.6 3.6-5.4 7-5.4s6.3 1.8 7 5.4"/>'),
    pin: P('<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
    flag: P('<path d="M5.5 21V4M5.5 5h11l-2.2 3.5 2.2 3.5h-11"/>'),
    route: P('<circle cx="6.5" cy="17.5" r="2.3"/><circle cx="17.5" cy="6.5" r="2.3"/><path d="M8.8 17.5H15a3 3 0 0 0 0-6h-6a3 3 0 0 1 0-6h6.2"/>'),
    gauge: P('<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M12 13l3.5-4"/>'),
    fuel: P('<path d="M5 20.5V5.5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v15M4 20.5h11M14 9h2.2a1.8 1.8 0 0 1 1.8 1.8v5a1.4 1.4 0 0 0 2.8 0V8.5L18.5 6"/>'),
    clip: P('<path d="M20 11.5l-7.6 7.6a4.6 4.6 0 0 1-6.5-6.5l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.5 1.5 0 0 1-2.1-2.1L16 7.8"/>'),
    mail: P('<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M4 7.5l8 6 8-6"/>'),
    phone: P('<path d="M6.5 3.5h3l1.5 4-2 1.3a10 10 0 0 0 5.2 5.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>'),
    build: P('<path d="M4.5 20.5v-15a1.5 1.5 0 0 1 1.5-1.5h7a1.5 1.5 0 0 1 1.5 1.5v15M14.5 9.5H18a1.5 1.5 0 0 1 1.5 1.5v9.5M3 20.5h18M8 8h2M8 12h2M8 16h2"/>'),
    hash: P('<path d="M9 4L7.5 20M16.5 4L15 20M4.5 9h15.5M4 15h15.5"/>'),
    pen: P('<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/>')
  };
  var MAP = [[/datum|termin|splatn|vystaven|narozen/, 'cal'], [/cas |cas$|zacat|konec|od$|do$|hodin/, 'clock'], [/popis|poznamk|text|nazev|poznam|zprav|komentar|duvod/, 'note'],
    [/misto|adres|mesto|ulice/, 'pin'], [/projekt|kod\b|slozk/, 'folder'], [/spotreb/, 'gauge'], [/castk|cena|platb|kc\b|sazb|odmen|zaloh/, 'cash'], [/kategor|typ |druh|stav|skupin|akce$/, 'tag'], [/cislo|symbol|variabil|cis\./, 'hash'], [/protistran|dodavat|odberat|jmeno|ridic|clen|osoba|kontakt/, 'person'],
    [/ucel/, 'flag'], [/\bkm\b|ujet|vzdalen/, 'route'], [/palivo/, 'fuel'], [/uctenk|soubor|priloh|foto|pdf/, 'clip'],
    [/mail/, 'mail'], [/telefon|mobil/, 'phone'], [/ico|dic|firma|organiz|spolek/, 'build']];
  function iconFor(t) {
    var s = (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + ' ';
    for (var i = 0; i < MAP.length; i++) if (MAP[i][0].test(s)) return ICONS[MAP[i][1]];
    return ICONS.pen;
  }
  var ROOTS = '.modal, .modal-content, .acct-form, #formModalBody, #eventFormModalBody, #programEditorModalBody';
  var SKIP_TYPES = /^(checkbox|radio|hidden|range|button|submit|color)$/;
  function ctrlOf(unit) {
    var c = unit.querySelector('input, select, textarea');
    return c && !SKIP_TYPES.test(c.type || '') ? c : null;
  }
  function labelText(unit) {
    var l = unit.tagName === 'LABEL' ? unit : unit.querySelector(':scope > label, :scope > .detail-label');
    if (!l) return '';
    var t = '';
    l.childNodes.forEach(function (n) { if (n.nodeType === 3) t += n.textContent; else if (n.nodeType === 1 && !/^(INPUT|SELECT|TEXTAREA|BR|SVG)$/i.test(n.tagName) && !n.classList.contains('and-ico') && !n.classList.contains('and-cap')) t += n.textContent; });
    return t.replace(/\s+/g, ' ').trim();
  }
  function build(unit) {
    if (unit.classList.contains('and-unit') || unit.dataset.andSkip) return;
    var c = ctrlOf(unit); if (!c) return;
    // jedna jednotka = jedno pole
    if (unit.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea').length !== 1) return;
    var txt = labelText(unit); if (!txt) return;
    var type = (c.type || '').toLowerCase(), tag = c.tagName;
    var pill = tag === 'SELECT' || type === 'file', floating = pill || c.readOnly || /^(date|time|datetime-local|month|week)$/.test(type);
    if (!c.getAttribute('aria-label')) c.setAttribute('aria-label', txt);
    if (!floating) { if (c.placeholder && c.placeholder !== txt) c.setAttribute('title', c.placeholder); c.placeholder = txt; }
    unit.classList.add('and-unit', pill ? 'and-pill' : 'and-text'); if (floating) unit.classList.add('and-float');
    if (tag === 'TEXTAREA') unit.classList.add('and-area');
    var ico = document.createElement('i'); ico.className = 'and-ico'; ico.innerHTML = iconFor(txt); unit.insertBefore(ico, unit.firstChild);
    if (floating) { var cap = document.createElement('span'); cap.className = 'and-cap'; cap.textContent = txt; unit.insertBefore(cap, ico.nextSibling); }
  }
  function group(parent) {
    var kids = Array.prototype.slice.call(parent.children), i = 0;
    kids.forEach(function (k) { k.classList.remove('and-g1', 'and-gf', 'and-gm', 'and-gl'); });
    while (i < kids.length) {
      if (!kids[i].classList.contains('and-text') || kids[i].offsetParent === null && getComputedStyle(kids[i]).display === 'none') { i++; continue; }
      var j = i; while (j + 1 < kids.length && kids[j + 1].classList.contains('and-text')) j++;
      if (i === j) kids[i].classList.add('and-g1');
      else for (var k = i; k <= j; k++) kids[k].classList.add(k === i ? 'and-gf' : k === j ? 'and-gl' : 'and-gm');
      i = j + 1;
    }
  }
  function run() {
    document.querySelectorAll(ROOTS).forEach(function (root) {
      root.querySelectorAll('.field, label, .detail-field').forEach(build);
    });
    var parents = new Set();
    document.querySelectorAll('.and-unit').forEach(function (u) { parents.add(u.parentElement); });
    parents.forEach(group);
  }
  var t = 0;
  function sched() { if (t) return; t = requestAnimationFrame(function () { t = 0; run(); }); }
  document.addEventListener('DOMContentLoaded', function () {
    run(); new MutationObserver(sched).observe(document.body, { childList: true, subtree: true });
  });
})();

/* Tlačítka akcí na mobilu (do 768 px) – jednotná mřížka ve všech aplikacích 10men:
   1 tlačítko = celá šířka, 2 = vedle sebe, 3 = hlavní přes celou šířku a pod ním dvě vedle sebe,
   4 = dvě a dvě, 5 = hlavní přes celou šířku a pod ním dvě a dvě (dál stejně: sudý počet po dvojicích, lichý s hlavním nahoře).
   Hlavní je tlačítko s třídou *primary*, jinak první, které není nebezpečné (Smazat, Stornovat…).
   Tlačítka se nepřesouvají ani neskrývají, mění se jen jejich rozložení (CSS, atribut data-ar-n a data-ar-main).
   Výjimka jen na Apple: Zavřít / Hotovo se skryje a okno dostane kulaté tlačítko ✕ (klikne původní tlačítko).
   Skupinu, která je přepínačem voleb (např. Přijdu / Možná / Nepřijdu), vyloučí atribut data-ar-skip. */
(function () {
  var SEL = '.modal-footer, .tn-actions, .projekt-wiki-actions, .st-foot, .dk-foot';
  var mq = window.matchMedia('(max-width: 768px)');
  var BTN = 'button, a.btn, a[class*="btn"], input[type="button"], input[type="submit"]';
  var busy = false, queued = false, mo = null, ft = null, follow = false;

  function hiddenByApp(el) {
    if (el.hidden || el.style.display === 'none' || el.classList.contains('hidden')) return true;
    var r = el.getBoundingClientRect(); return !r.width && !r.height && !el.hasAttribute('data-ar-seen');
  }
  function mine(box) {
    return [].filter.call(box.querySelectorAll(BTN), function (b) { return b.closest(SEL) === box; });
  }
  function isPrimary(b) { return /(^|[\s-])primary([\s-]|$)|tn-primary|modal-btn-primary/.test(b.className); }
  function isDanger(b) { return /danger|(^|\s)a-no(\s|$)/.test(b.className) || /^(smazat|stornovat|deaktivovat|odstranit)/i.test((b.textContent || '').trim()); }

  function clear(box) {
    box.removeAttribute('data-ar-n'); box.removeAttribute('data-ar-empty');
    [].forEach.call(box.querySelectorAll('[data-ar-main]'), function (b) { b.removeAttribute('data-ar-main'); });
  }
  /* Apple (iOS 26): Zavřít / Hotovo se nahradí kulatým skleněným tlačítkem ✕ v rohu okna */
  var X_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var CHECK_SVG = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function iconClose(box) {
    if (document.documentElement.getAttribute('data-platform') !== 'apple') return;
    var host = box.closest('.modal-content, .modal, .tn-dlg');
    if (!host) return;
    mine(box).forEach(function (b) {
      if (!/^(zavřít|hotovo)$/i.test((b.textContent || '').trim()) || b.hasAttribute('data-ar-icon')) return;
      b.setAttribute('data-ar-icon', '');
      if (host.querySelector('.modal-close, .ar-x')) return;
      var x = document.createElement('button'); x.type = 'button'; x.className = 'ar-x'; var done = /^hotovo$/i.test((b.textContent || '').trim()); x.setAttribute('aria-label', done ? 'Hotovo' : 'Zavřít'); x.innerHTML = done ? CHECK_SVG : X_SVG;
      x.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); b.click(); });
      host.appendChild(x);
    });
  }
  function build(box) {
    if (!mq.matches || box.hasAttribute('data-ar-skip')) { clear(box); return; }
    iconClose(box);
    var all = mine(box).filter(function (b) { return !hiddenByApp(b); });
    var n = all.length;
    if (n < 1) { clear(box); if (box.querySelector('[data-ar-icon]')) box.setAttribute('data-ar-empty', ''); return; }
    box.removeAttribute('data-ar-empty');
    [].forEach.call(box.querySelectorAll('[data-ar-main]'), function (b) { b.removeAttribute('data-ar-main'); });
    box.setAttribute('data-ar-n', String(n));
    if (n >= 3 && n % 2 === 1) {
      var main = all.filter(isPrimary).pop() || all.filter(function (b) { return !isDanger(b); })[0] || all[0];
      main.setAttribute('data-ar-main', '');
    }
  }
  /* Samostatné tlačítko (v řádku je samo, širší než 110 px, s popiskem) = jedno tlačítko → celá šířka */
  var EXCL = '.bottom, nav, header, .sidebar, .st-seg, .pj-seg, .prog-seg, .doc-filters, .acct-switch, .mobile-detail-modal-tabs, .bottom-sheet, [role="tablist"], .type-btn, .filter-btn, .ar-x, .modal-close, .prog-ico, .prog-grip, .prog-badge, .st-ic, .st-grip, .dots-btn, .pc-more, .pdf-btn, .mobile-avatar-btn, .pmenu, .profile-menu, table, .ar-menu, .transit-edit, .search-bar, .drive-toolbar, .kl-table, .vw-opt, .kl-row, .kt-table, .kd-list, .kd-code, .kt-copy, .kd-more, [role="row"], [role="table"], [role="listbox"], [role="menu"]';
  function soloPass() {
    var list = [].slice.call(document.querySelectorAll('button, a[class*="btn"]')).slice(0, 600);
    list.forEach(function (b) {
      var ok = false;
      if (mq.matches && !b.closest(SEL) && !b.closest(EXCL) && !b.disabled && b.children.length < 2 + (b.querySelector('svg') ? 1 : 0)) {
        var r = b.getBoundingClientRect(), t = (b.textContent || '').replace(/\s+/g, ' ').trim();
        if (r.width >= 110 && r.height >= 24 && t.length >= 3 && b.parentElement) {
          ok = [].every.call(b.parentElement.children, function (s) {
            if (s === b) return true; var q = s.getBoundingClientRect();
            return !q.width || !q.height || q.bottom <= r.top + 4 || q.top >= r.bottom - 4;
          });
        }
      }
      if (ok) b.setAttribute('data-ar-solo', ''); else if (b.hasAttribute('data-ar-solo')) b.removeAttribute('data-ar-solo');
    });
  }
  /* Dvojice: výchozí je půl na půl; když by se delší text zalomil, dostane kratší tlačítko jen tolik místa, kolik potřebuje */
  function nat(el) {
    var st = el.getAttribute('style'), s = el.style;
    s.setProperty('white-space', 'nowrap', 'important'); s.setProperty('flex', '0 0 auto', 'important'); s.setProperty('width', 'auto', 'important');
    var w = el.offsetWidth;
    if (st === null) el.removeAttribute('style'); else el.setAttribute('style', st);
    return w;
  }
  function fit(box) {
    [].forEach.call(box.querySelectorAll('[data-ar-f]'), function (b) { b.removeAttribute('data-ar-f'); b.style.removeProperty('--ar-f'); });
    if (!mq.matches || !box.hasAttribute('data-ar-n') || box.hasAttribute('data-ar-skip')) return;
    var rest = mine(box).filter(function (b) { return !b.hasAttribute("data-ar-main") && b.offsetWidth > 0; });
    var W = box.clientWidth - (parseFloat(getComputedStyle(box).getPropertyValue('--ar-g')) || 8);
    if (W <= 0) return;
    for (var i = 0; i + 1 < rest.length; i += 2) {
      var a = rest[i], b = rest[i + 1], na = nat(a), nb = nat(b), f = 0.5;
      if (na > W / 2 || nb > W / 2 || na + nb > W) f = na >= nb ? Math.max(0.5, 1 - (nb + 2) / W) : Math.min(0.5, (na + 2) / W);
      if (Math.abs(f - 0.5) < 0.01) continue;
      a.setAttribute('data-ar-f', ''); a.style.setProperty('--ar-f', f.toFixed(4));
      b.setAttribute('data-ar-f', ''); b.style.setProperty('--ar-f', (1 - f).toFixed(4));
    }
  }
  function run() {
    queued = false; if (busy) return; busy = true; if (mo) mo.disconnect();
    if (!mq.matches) { [].forEach.call(document.querySelectorAll('.ar-x'), function (x) { x.remove(); }); [].forEach.call(document.querySelectorAll('[data-ar-icon]'), function (b) { b.removeAttribute('data-ar-icon'); }); }
    try { [].forEach.call(document.querySelectorAll(SEL), build); } catch (e) { /* skupina se přeskočí */ }
    try { [].forEach.call(document.querySelectorAll(SEL), fit); } catch (e) { /* dvojice zůstanou půl na půl */ }
    try { soloPass(); } catch (e) { /* samostatná tlačítka se přeskočí */ }
    if (mo) mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    busy = false;
    /* po animaci okna a načtení písma se dvojice přeměří ještě jednou */
    if (!follow) { clearTimeout(ft); ft = setTimeout(function () { follow = true; run(); follow = false; }, 500); }
  }
  function schedule() { if (queued) return; queued = true; (window.requestAnimationFrame || setTimeout)(run); }
  function init() {
    mo = new MutationObserver(schedule); run();
    window.addEventListener('resize', schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', schedule);
    (mq.addEventListener ? mq.addEventListener('change', run) : mq.addListener(run));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* Postupné zobrazení karet: po přepnutí sekce se karty objeví jedna po druhé od nejvyšší dolů,
   karty pod okrajem obrazovky naskočí, až se při scrollování dostanou do zorného pole.
   Spouští se jen přepnutím sekce (změna třídy na navigaci nebo stránce), ne každým překreslením dat. Při „omezit pohyb“ se nic nedělá. */
(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var CARDS = '.dashboard-card, .projekt-card, .projekt-sekce, .dk-card';
  var NAV = '.bottom button, .sidebar-nav-item, .sidebar-tab, [data-view], [data-tab]';
  var EXCL = '.modal, .modal-overlay, .modal-content, .tn-ov, .bottom-sheet, header, .sidebar, .bottom, .pmenu, .profile-menu, .context-menu, .month-slider, [data-no-reveal]';
  var seen = (typeof WeakSet !== 'undefined') ? new WeakSet() : null, armedUntil = 0, io = null, working = false;
  function arm(ms) { armedUntil = Date.now() + (ms || 1800); run(); }
  function outer() {
    return [].filter.call(document.querySelectorAll(CARDS), function (c) {
      if (c.closest(EXCL) || (c.parentElement && c.parentElement.closest(CARDS))) return false;
      var r = c.getBoundingClientRect(); return r.width > 20 && r.height > 12;
    });
  }
  function done(c) { setTimeout(function () { c.classList.remove('rv', 'rv-in'); c.classList.add('rv-done'); c.style.removeProperty('--rvd'); }, 1500); }
  function show(c, d) { c.style.setProperty('--rvd', d + 'ms'); void c.offsetWidth; c.classList.add('rv-in'); done(c); }
  function run() {
    if (working || Date.now() > armedUntil || !seen) return; working = true;
    try {
      var vh = window.innerHeight || 800, list = outer().filter(function (c) { return !seen.has(c); });
      list.sort(function (a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });
      var k = 0;
      list.forEach(function (c) {
        seen.add(c); c.classList.add('rv');
        if (c.getBoundingClientRect().top < vh * 0.97) { show(c, Math.min(k, 9) * 70); k++; }
        else if (io) io.observe(c); else show(c, 0);
      });
    } catch (e) { /* karty se prostě zobrazí bez animace */ }
    working = false;
  }
  function init() {
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) {
        var vis = es.filter(function (e) { return e.isIntersecting; }).sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
        vis.forEach(function (e, i) { io.unobserve(e.target); show(e.target, Math.min(i, 6) * 60); });
      }, { rootMargin: '0px 0px -5% 0px', threshold: 0.04 });
    }
    new MutationObserver(function (ms) {
      var nav = ms.some(function (m) { return m.type === 'attributes' && m.target.nodeType === 1 && !m.target.classList.contains('rv') && !m.target.classList.contains('rv-in') && m.target.matches && m.target.matches(NAV + ', .view, #content-area, #screen-app, #main, .page-in'); });
      if (nav) { armedUntil = Date.now() + 1800; seen = new WeakSet(); }   // každé přepnutí sekce animuje karty znovu
      run();
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    arm(2200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.tenReveal = arm;
})();

/* Spodní lišta (Apple): 1) při posunu stránky dolů se lišta zmenší a schová popisky, při posunu nahoru se vrátí;
   2) vybranou záložku (kapku skla) jde chytit a přetáhnout prstem na jinou záložku, po pustění se přepne.
   Na Androidu se nic nemění. */
document.addEventListener('DOMContentLoaded', function () {
  var bar = document.querySelector('.bottom');
  if (!bar || document.documentElement.getAttribute('data-platform') === 'android') return;
  var mqm = window.matchMedia('(max-width: 768px)'), drag = null, pill = null;
  var last = new WeakMap();
  function setMin(on) { bar.classList.toggle('lg-min', !!on); }
  document.addEventListener('scroll', function (e) {
    if (!mqm.matches || drag) return;
    var t = e.target, el = t === document ? document.scrollingElement : t;
    if (!el || (t.closest && t.closest('.bottom, .modal-overlay, .modal, .bottom-sheet, .tn-ov, .tn-dlg, textarea'))) return;
    if (el !== document.scrollingElement && el.clientHeight < window.innerHeight * 0.4) return;
    var y = el.scrollTop, d = y - (last.has(el) ? last.get(el) : y);
    if (y <= 8) { setMin(false); last.set(el, y); return; }
    if (Math.abs(d) < 8) return;
    last.set(el, y); setMin(d > 0 && y > 48);
  }, true);
  bar.addEventListener('click', function () { setMin(false); });

  function btns() { return [].filter.call(bar.querySelectorAll('button'), function (b) { return b.offsetWidth > 0; }); }
  function hot(b) { [].forEach.call(bar.querySelectorAll('button.lg-hot'), function (x) { if (x !== b) x.classList.remove('lg-hot'); }); if (b) b.classList.add('lg-hot'); }
  bar.addEventListener('pointerdown', function (e) {
    if (!mqm.matches || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pill = bar.querySelector('.lg-pill'); var act = bar.querySelector('button.active');
    if (!pill || !act) return;
    drag = { id: e.pointerId, x0: e.clientX, left0: act.offsetLeft, act: act, on: false, hover: act };
  });
  bar.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x0;
    if (!drag.on) {
      if (Math.abs(dx) < 8) return;
      drag.on = true; bar.classList.add('lg-drag'); pill.style.transition = 'none';
      try { bar.setPointerCapture(e.pointerId); } catch (x) { /* bez zachycení se táhne dál po liště */ }
    }
    var list = btns(), w = drag.act.offsetWidth;
    var min = list[0].offsetLeft, max = list[list.length - 1].offsetLeft + list[list.length - 1].offsetWidth - w;
    var x = Math.max(min, Math.min(max, drag.left0 + dx)), mid = x + w / 2;
    pill.style.transform = 'translateX(' + x + 'px) scale(1.12)';
    var h = list.filter(function (b) { return mid >= b.offsetLeft && mid < b.offsetLeft + b.offsetWidth; })[0] || drag.hover;
    drag.hover = h; hot(h);
  });
  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag; drag = null;
    if (!d.on) return;
    var cancel = e.type === 'pointercancel';
    bar.classList.remove('lg-drag'); hot(null); pill.style.transition = '';
    var swallow = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
    if (!cancel && d.hover && d.hover !== d.act) d.hover.click();
    bar.addEventListener('click', swallow, true); setTimeout(function () { bar.removeEventListener('click', swallow, true); }, 450);
    if (bar._lgPlace) bar._lgPlace(true);
  }
  bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
});

/* Pravidla zobrazení oken na mobilu (CSS je v redesign.css, blok „3.11.0“):
   • dialog = potvrzení nebo krátký formulář s jedním polem → nahoře, modální okno (nezakryje ho klávesnice)
   • menu a formulář s mnoha kolonkami → bottom sheet (data-pres="sheet" na obalu okna), bez držátka, s křížkem
   Rozhoduje se při otevření okna: sheet je okno z výčtu SHEET níže, nebo s alespoň třemi poli či volbami. */
(function () {
  var OV = '.modal-overlay';                 // obal okna (překryv)
  var CHILD = '.modal';           // vlastní okno uvnitř obalu
  var SHEET = '#evid-modal, #download-choice-modal, #share-modal, #share-manage-modal, #move-modal, #acl-modal, .kl-ov, .vw-choice';           // okna, která jsou vždy sheet (seznamy, menu)
  var FIELDS = 'input:not([type=hidden]), select, textarea, .modal-option, .pair-list > *, .modal-list > *';
  function isOpen(o) { return o.classList.contains('active'); }
  function close(o) {
    o.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
  function classify(o, upgradeOnly) {
    var p = o.querySelector(':scope > ' + CHILD); if (!p) return;
    var sheet = o.hasAttribute('data-sheet') || (!o.hasAttribute('data-dialog') && (o.matches(SHEET) || p.querySelectorAll(FIELDS).length >= 3));   // data-sheet / data-dialog vynutí formu ručně
    if (sheet) o.setAttribute('data-pres', 'sheet'); else if (!upgradeOnly) o.removeAttribute('data-pres');
    if (sheet && !p.__pres) { p.__pres = 1; p.addEventListener('scroll', function () { p.classList.toggle('is-scrolled', p.scrollTop > 2); }, { passive: true }); }   // stín pod pevným záhlavím, až když se obsah posouvá
    if (!sheet || p.querySelector(':scope > .modal-header .modal-close')) return;   // vlastní záhlaví s křížkem (10korun) se jen přilepí CSS
    // záhlaví sheetu: nadpis + křížek, celé zůstává nahoře a obsah se posouvá pod ním
    var bar = p.querySelector(':scope > .sheet-head');
    if (!bar) {
      bar = document.createElement('div'); bar.className = 'sheet-head';
      bar.innerHTML = '<span class="sheet-title"></span>';
      var x = p.querySelector(':scope > .ar-x') || p.querySelector('.ar-x');   // křížek z Apple stylu (býval na konci okna)
      if (!x) {
        x = document.createElement('button'); x.type = 'button'; x.className = 'sheet-x'; x.setAttribute('aria-label', 'Zavřít'); x.textContent = '✕';
        x.addEventListener('click', function (e) { e.stopPropagation(); close(o); });
      }
      bar.appendChild(x); p.insertBefore(bar, p.firstChild);
    } else if (bar !== p.firstChild) p.insertBefore(bar, p.firstChild);
    var ax = p.querySelector('.ar-x'); if (ax && ax.parentNode !== bar) bar.appendChild(ax);   // Apple křížek přidaný později
    // nadpis: první nadpis okna se zkopíruje do záhlaví a původní se skryje (bez tlačítek uvnitř, aby zůstaly funkční)
    var src = p.querySelector('.sheet-src') || [].filter.call(p.querySelectorAll('h2, h3, .modal-title, .modal-header'), function (h) { return !bar.contains(h); })[0];
    var t = bar.querySelector('.sheet-title');
    var title = '';
    if (src && !src.querySelector('button, a, input, select')) { src.classList.add('sheet-src'); title = (src.textContent || '').replace(/\s+/g, ' ').trim(); }
    if (t.textContent !== title) t.textContent = title;   // jen při změně, jinak by změna sama spouštěla pozorovatele dokola
  }
  function scan(n) {
    if (n.nodeType !== 1) return;
    if (n.matches(OV)) { if (isOpen(n)) classify(n); }
    else if (n.querySelectorAll) n.querySelectorAll(OV).forEach(function (o) { if (isOpen(o)) classify(o); });
  }
  function start() {
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.type === 'attributes') { if (m.target.matches(OV) && isOpen(m.target)) classify(m.target); }
        else { m.addedNodes.forEach(scan); var host = m.target.closest && m.target.closest(OV); if (host && isOpen(host)) classify(host, true); }   // obsah doplněný až po otevření
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
    document.querySelectorAll(OV).forEach(function (o) { classify(o); });   // předem i zavřená okna, aby první otevření sheetu jelo zespodu
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

/* Rozbalovací bloky (accordion) jako roleta: tělo se odvíjí shora dolů (výška a vnitřní okraje z nuly na naměřenou hodnotu),
   při sbalení se stejně svine. Stav nese atribut data-acc="open|closed" (podle něj se otáčí šipka v CSS).
   tenAcc.set(holder, open?, { body, display, chevs }) — holder nese stav a třídu .open (CSS ji může používat k zobrazení),
   body je animovaný prvek (výchozí holder), display ("block", "flex"…) pro bloky skrývané přes style.display, chevs = šipky, které dostanou stejný stav.
   tenAcc.toggle(holder, opts) přepne podle aktuálního stavu. Respektuje „omezit pohyb“. */
(function () {
  var DUR = 340, EASE = 'cubic-bezier(.32, .72, 0, 1)';
  var reduced = function () { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; };
  function clean(b) { b.style.height = ''; b.style.overflow = ''; b.style.transition = ''; b.style.paddingTop = ''; b.style.paddingBottom = ''; b.style.boxSizing = ''; b.style.opacity = ''; }
  function isOpen(h, o) {
    var a = h.getAttribute('data-acc'); if (a) return a === 'open';
    var b = (o && o.body) || h;   // bez atributu (blok vykreslený hned otevřený): zjistí se z vzhledu
    return o && o.display ? getComputedStyle(b).display !== 'none' : h.classList.contains('open');
  }
  function set(holder, open, o) {
    if (!holder) return;
    o = o || {};
    var body = o.body || holder;
    if (open === undefined) open = !isOpen(holder, o);
    var state = open ? 'open' : 'closed';
    holder.setAttribute('data-acc', state);
    (o.chevs || []).forEach(function (c) { if (c) c.setAttribute('data-acc', state); });
    var trig = o.trigger; if (trig) { trig.setAttribute('data-acc', state); trig.setAttribute('aria-expanded', open ? 'true' : 'false'); }
    var token = body.__accT = (body.__accT || 0) + 1;
    var show = function () { if (o.display) body.style.display = o.display; holder.classList.add('open'); };
    var hide = function () { if (o.display) body.style.display = 'none'; holder.classList.remove('open'); };
    if (reduced()) { clean(body); open ? show() : hide(); return; }
    var running = body.style.overflow === 'hidden';
    var from = running ? body.getBoundingClientRect().height : null;
    if (open) {
      show();
      clean(body);
      var cs = getComputedStyle(body), pt = cs.paddingTop, pb = cs.paddingBottom, full = body.getBoundingClientRect().height;
      var start = from === null ? 0 : from;
      body.style.boxSizing = 'border-box'; body.style.overflow = 'hidden';
      body.style.height = start + 'px'; if (!start) { body.style.paddingTop = '0px'; body.style.paddingBottom = '0px'; }
      void body.offsetHeight;
      body.style.transition = 'height ' + DUR + 'ms ' + EASE + ', padding ' + DUR + 'ms ' + EASE;
      body.style.height = full + 'px'; body.style.paddingTop = pt; body.style.paddingBottom = pb;
      setTimeout(function () { if (body.__accT === token) clean(body); }, DUR + 40);
    } else {
      var h = from === null ? body.getBoundingClientRect().height : from;
      if (!h) { hide(); clean(body); return; }
      body.style.boxSizing = 'border-box'; body.style.overflow = 'hidden'; body.style.transition = 'none'; body.style.height = h + 'px';
      void body.offsetHeight;
      body.style.transition = 'height ' + DUR + 'ms ' + EASE + ', padding ' + DUR + 'ms ' + EASE;
      body.style.height = '0px'; body.style.paddingTop = '0px'; body.style.paddingBottom = '0px';
      setTimeout(function () { if (body.__accT === token) { hide(); clean(body); } }, DUR + 40);
    }
  }
  window.tenAcc = { set: set, toggle: function (holder, o) { set(holder, undefined, o); }, isOpen: isOpen };
})();
