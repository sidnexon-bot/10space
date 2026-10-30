/* 10space – service worker: aplikace se otevře i bez připojení.
   • Soubory aplikace a knihovny z CDN se ukládají a při výpadku sítě se berou z úložiště.
   • Nikdy se neukládá nic z backendu (Cloud Functions, Firebase, Google API): přihlášení, data a soubory
     chodí vždy živě, offline kopie not řeší aplikace sama (decks.js).
   Nová verze aplikace se projeví při příštím otevření (nejdřív síť, úložiště je záloha). */
const VERSION = "10space-shell-v6";
const SHELL = ["./", "index.html", "redesign.css", "viewers.css", "decks.css", "ui.css", "kody.css", "motion.css", "settings.css", "settings.js", "platform.js", "ui.js", "kody.js", "viewers.js", "decks.js", "repertoar.js", "pdf-reader.js?v=1", "manifest.json", "icon-192.png", "icon-512.png"];
const CDN = /^https:\/\/(www\.gstatic\.com\/firebasejs|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("10space-shell-") && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req, fallbackKey) {
  const cache = await caches.open(VERSION), have = await cache.match(req);
  try {
    // při pomalé síti (rehearsal bez wifi) je po 4 s lepší uložená verze než čekání
    const res = have ? await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000))]) : await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = have || (fallbackKey && (await cache.match(fallbackKey)));
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(VERSION), hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith("/sw.js")) return;
    e.respondWith(networkFirst(req, req.mode === "navigate" ? "index.html" : null));
  } else if (CDN.test(req.url)) {
    e.respondWith(cacheFirst(req)); // verze knihoven jsou pevné v adrese
  }
});
