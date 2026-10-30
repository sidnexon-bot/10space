// Zapíše /repertoar/{id}/dalsiSoubory/{driveFileId} a opraví hlavní PDF u Go the Distance (r47) a Baba Yetu SATB (r11).
// Před zápisem záloha dotčených záznamů. Spuštění: NODE_PATH=functions/node_modules GOOGLE_APPLICATION_CREDENTIALS=$PWD/serviceAccount.json node zapis-dalsi-soubory.js
const fs = require("fs");
const { initializeApp } = require("firebase-admin/app"); const { getDatabase } = require("firebase-admin/database");
initializeApp({ databaseURL: "https://base-39f52-default-rtdb.europe-west1.firebasedatabase.app" });
const DNES = new Date().toISOString().slice(0, 10);
const EXTRA = [ // [skladba, soubor v Drive, očekávaný název, popis]
  ["r131", "1Fp9UWOwZtnJDt3QfPVOl4gvhCaoDMo1-", "Slunečný hrob 10M landscape.pdf", "Stránky na šířku"],
  ["r55", "18QDSZcpx3BvNmszKzeg-edKLvpif__kK", "Happy Together (arr. D. Wright).pdf", "Úprava D. Wright, bez poznámek"],
  ["r102", "1abHcKTgRHRRDuKjVPUN8JiS5JA3ywl_Y", "Northern L. nový závěr.pdf", "Nový závěr"],
  ["r29", "1hi8w-jVhLxRFt2n0pdCRiWzBg9hryvBk", "Česká mše vánoční (Ryba)- bas.pdf", "Basový hlas"],
  ["r125", "1qVm_aUePOnPqIEw8lRJZhbzmI_rJ-m3C", "Scarborough Fair.pdf", "Úprava Stan Engebretson (jiná velikost než TTLLBBBB)"],
];
const HLAVNI = [ // [skladba, nový hlavní soubor, očekávaný název]
  ["r47", "18zgTQHIvM89hYlwM1N6PIG2xuwJ3XIik", "Go the Distance (Bb dur)_poznámky.pdf"],
  ["r11", "1TF5YcKGh11rFVlDsrOf-5bD3J9nl6a63", "BABAYETU-LAMEN-1.pdf"],
];
(async () => {
  const db = getDatabase();
  const [rep, files] = await Promise.all(["/repertoar", "/driveCache/files"].map(async (p) => (await db.ref(p).get()).val() || {}));
  const ids = [...new Set([...EXTRA, ...HLAVNI].map((x) => x[0])), "r12"];
  fs.writeFileSync(`rules-backup/REPERTOAR-pred-dalsimi-soubory-${Date.now()}.json`, JSON.stringify(Object.fromEntries(ids.map((i) => [i, rep[i]])), null, 1));
  const upd = {}, kontrola = (id, nazev) => { if (!files[id] || files[id].name.normalize("NFC") !== nazev.normalize("NFC")) throw new Error("soubor nesedí: " + id + " " + nazev); };
  const folders = (await db.ref("/driveCache/folders").get()).val() || {};
  for (const [s, f, n, popis] of EXTRA) {
    kontrola(f, n); if (!rep[s]) throw new Error("chybí skladba " + s);
    upd[`repertoar/${s}/dalsiSoubory/${f}`] = { nazev: n, slozka: folders[files[f].parentId]?.name || "", popis, pridano: DNES };
  }
  for (const [s, f, n] of HLAVNI) {
    kontrola(f, n); const stary = rep[s].driveFileId || (rep[s].pdf.match(/\/d\/([\w-]{20,})/) || [])[1];
    upd[`repertoar/${s}/driveFileId`] = f; upd[`repertoar/${s}/pdf`] = `https://drive.google.com/file/d/${f}/view?usp=sharing`;
    upd[`driveCache/files/${f}/songId`] = s;
    // starý soubor odpojit od skladby, jen pokud ho nepoužívá jiný záznam
    const jinyPouziva = Object.values(rep).some((r) => r && r.id !== s && (r.driveFileId === stary));
    if (stary && files[stary] && !jinyPouziva) upd[`driveCache/files/${stary}/songId`] = null;
    console.log(s, rep[s].code, "hlavní:", files[stary]?.name, "→", n, jinyPouziva ? "(starý soubor používá i jiný záznam, odpojení přeskočeno)" : "");
  }
  await db.ref("/").update(upd);
  for (const [s, f] of EXTRA.map((x) => [x[0], x[1]])) console.log("+ dalsiSoubory", rep[s].code, rep[s].name, "←", files[f].name);
  process.exit(0);
})();
