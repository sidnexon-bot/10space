// Zapíše nové skladby z rules-backup/NOVE-SKLADBY-plan.json do /repertoar, propojí soubory v /driveCache a posune čítače v /citace.
// Nejdřív záloha /repertoar a /citace. Spuštění: NODE_PATH=functions/node_modules GOOGLE_APPLICATION_CREDENTIALS=$PWD/serviceAccount.json node zapis-nove-skladby.js
const fs = require("fs");
const { initializeApp } = require("firebase-admin/app"); const { getDatabase } = require("firebase-admin/database");
initializeApp({ databaseURL: "https://base-39f52-default-rtdb.europe-west1.firebasedatabase.app" });
(async () => {
  const db = getDatabase(), plan = JSON.parse(fs.readFileSync("rules-backup/NOVE-SKLADBY-plan.json", "utf8"));
  const [rep, cit, files] = await Promise.all(["/repertoar", "/citace", "/driveCache/files"].map(async (p) => (await db.ref(p).get()).val() || {}));
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  fs.writeFileSync(`rules-backup/REPERTOAR-pred-novymi-skladbami-${stamp}.json`, JSON.stringify({ repertoar: rep, citace: cit }, null, 1));
  const usedCodes = new Set(Object.values(rep).map((s) => s && s.code)), usedNames = new Set(Object.values(rep).map((s) => s && s.name));
  const upd = {}; let t = Date.now();
  for (const n of plan.nove) {
    if (usedCodes.has(n.kod) || usedNames.has(n.nazev)) { console.log("PŘESKOČENO (kód nebo název už existuje):", n.kod, n.nazev); continue; }
    const main = n.soubory.find((f) => !/výslovností/.test(f.soubor)) || n.soubory[0];
    if (!files[main.id]) { console.log("PŘESKOČENO (soubor není v Drive cache):", n.nazev); continue; }
    const id = "r" + t++;
    upd[`repertoar/${id}`] = { id, name: n.nazev, code: n.kod, status: "Neaktuální", version: /LAM/.test(n.kod) ? "SATB" : "", pdf: `https://drive.google.com/file/d/${main.id}/view?usp=sharing`, driveFileId: main.id, author: "", arranged_by: "", text_by: "", length: "", note: n.soubory.length > 1 ? "Další soubory: " + n.soubory.filter((f) => f !== main).map((f) => `https://drive.google.com/file/d/${f.id}/view`).join(" ") : "" };
    upd[`driveCache/files/${main.id}/songId`] = id;
    console.log("+", n.kod, n.nazev);
  }
  await db.ref("/").update(upd);
  for (const [k, v] of Object.entries(plan.citace)) await db.ref(`/citace/${k}`).transaction((c) => Math.max(c || 0, v));
  console.log("hotovo:", Object.keys(upd).filter((k) => k.startsWith("repertoar/")).length, "skladeb; čítače", JSON.stringify((await db.ref("/citace").get()).val()));
  process.exit(0);
})();
