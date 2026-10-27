/* 10space – rozpoznání platformy pro spodní plovoucí lištu (stejné jako v 10base).
   Apple (iPhone, iPad, Mac) a vše ostatní → "liquid glass"; Android → styl Samsung One UI.
   Pro vyzkoušení: přidej ?platform=apple nebo ?platform=android do adresy. */
(function () {
  var q = new URLSearchParams(location.search).get('platform');
  var android = q === 'android' || (q !== 'apple' && /Android/i.test(navigator.userAgent || ''));
  document.documentElement.setAttribute('data-platform', android ? 'android' : 'apple');
})();

/* Barva lišty prohlížeče (theme-color) sleduje režim aplikace: černá v tmavém režimu (OLED),
   jinak světlá. Zůstane jediný tag a ručně přepnutý režim se projeví hned. */
document.addEventListener('DOMContentLoaded', function () {
  function sync() {
    var c = document.body.classList.contains('dark') ? '#000000' : '#f2f2f7';
    var tags = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < tags.length; i++) {
      if (i > 0) { tags[i].remove(); continue; }
      tags[i].removeAttribute('media'); tags[i].setAttribute('content', c);
    }
  }
  sync();
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
});
