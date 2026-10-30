// Návrh sjednocení repertoáru a not (jen čtení, nic nezapisuje). Výstup: rules-backup/SJEDNOCENI-NOT-navrh.json + .md
// Spuštění: NODE_PATH=functions/node_modules GOOGLE_APPLICATION_CREDENTIALS=$PWD/serviceAccount.json node sjednoceni-noty.js
const fs = require("fs");
const { initializeApp } = require("firebase-admin/app"); const { getDatabase } = require("firebase-admin/database");
initializeApp({ databaseURL: "https://base-39f52-default-rtdb.europe-west1.firebasedatabase.app" });
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\.pdf$/i, "").replace(/\b(ttbb|satb|songbook|noty|partitura)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const idOf = (s) => s.driveFileId || ((s.pdf || "").match(/\/d\/([\w-]{20,})/) || (s.pdf || "").match(/[?&]id=([\w-]{20,})/) || [])[1] || null;
(async () => {
  const db = getDatabase();
  const [rep, files, folders] = await Promise.all(["/repertoar", "/driveCache/files", "/driveCache/folders"].map(async (p) => (await db.ref(p).get()).val() || {}));
  const path = (f) => { const o = []; let c = f.parentId; while (c && folders[c]) { o.push(folders[c].name); c = folders[c].parentId; } return o.reverse().join("/"); };
  const pdfs = Object.entries(files).filter(([, f]) => f.mimeType === "application/pdf").map(([id, f]) => ({ id, name: f.name, path: path(f), key: fold(f.name) }));
  const noty = pdfs.filter((f) => /_NOTY/.test(f.path) && f.key.length > 2); // bez názvů, které po zjednodušení zmizí (řecké písmo apod.)
  const near = (name) => { const k = fold(name); return noty.filter((f) => f.key === k || (k.length > 5 && (f.key.includes(k) || k.includes(f.key)))).map((h) => ({ id: h.id, soubor: h.name, slozka: h.path })); }; // složka s notami (včetně _Aktuálně zpíváme)
  const songs = Object.values(rep).filter((s) => s && s.id);
  const used = new Set(songs.map(idOf).filter(Boolean));
  const out = { prirazeni: [], bezSouboru: [], souborChybiVDrive: [], duplicity: [], nepriraditelnaPdf: [] };
  for (const s of songs.filter((s) => !idOf(s))) {
    const hit = near(s.name).map((h) => ({ ...h, key: fold(h.soubor) })), k = fold(s.name);
    (hit.length === 1 ? out.prirazeni : out.bezSouboru).push({ id: s.id, skladba: s.name, navrh: hit.map(({ key, ...h }) => h) });
  }
  for (const s of songs) { const i = idOf(s); if (i && !files[i]) out.souborChybiVDrive.push({ id: s.id, skladba: s.name, driveFileId: i, kandidati: near(s.name) }); }
  const by = {}; songs.forEach((s) => (by[fold(s.name)] ||= []).push(s));
  for (const [k, v] of Object.entries(by)) if (v.length > 1) out.duplicity.push({ nazev: v[0].name, zaznamy: v.map((s) => ({ id: s.id, kod: s.code, stav: s.status, verze: s.version || "", driveFileId: idOf(s) })) });
  out.nepriraditelnaPdf = noty.filter((f) => !used.has(f.id) && !out.prirazeni.some((p) => p.navrh[0]?.id === f.id) && !out.souborChybiVDrive.some((m) => m.kandidati.some((c) => c.id === f.id))).map((f) => ({ id: f.id, soubor: f.name, slozka: f.path }));
  fs.writeFileSync("rules-backup/SJEDNOCENI-NOT-navrh.json", JSON.stringify(out, null, 1));
  const L = (t, a, f) => `\n## ${t} (${a.length})\n` + a.map(f).join("\n");
  fs.writeFileSync("rules-backup/SJEDNOCENI-NOT-navrh.md", "# Návrh sjednocení repertoáru a not\n" +
    L("Jistá přiřazení (jedna shoda podle názvu)", out.prirazeni, (p) => `- ${p.skladba} → ${p.navrh[0].soubor} [${p.navrh[0].id}] (${p.navrh[0].slozka})`) +
    L("Skladby bez souboru, bez jistého kandidáta", out.bezSouboru, (p) => `- ${p.skladba}` + (p.navrh.length ? ` — kandidáti: ${p.navrh.map((n) => n.soubor).join("; ")}` : "")) +
    L("Soubor skladby není v přehledu Drive", out.souborChybiVDrive, (p) => `- ${p.skladba} (${p.driveFileId})` + (p.kandidati.length ? ` — v Drive je: ${p.kandidati.map((n) => `${n.soubor} [${n.id}]`).join("; ")}` : " — v Drive nic podobného")) +
    L("Duplicitní názvy", out.duplicity, (d) => `- ${d.nazev}: ` + d.zaznamy.map((z) => `${z.id} [${z.kod || "bez kódu"}, ${z.stav}, ${z.verze || "-"}]${z.driveFileId ? "" : " bez souboru"}`).join(" | ")) +
    L("PDF ve složce Noty bez skladby", out.nepriraditelnaPdf, (f) => `- ${f.soubor} (${f.slozka.split("/").slice(-1)[0]})`) + "\n");
  console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
  process.exit(0);
})();
