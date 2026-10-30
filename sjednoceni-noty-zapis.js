// Zapíše schválená přiřazení z rules-backup/SJEDNOCENI-NOT-navrh.json (nejdřív záloha /repertoar).
// Jen: skladby bez souboru s JEDNÍM kandidátem a skladby se starým ID, k nimž je v Drive JEDEN kandidát.
const fs = require("fs");
const { initializeApp } = require("firebase-admin/app"); const { getDatabase } = require("firebase-admin/database");
initializeApp({ databaseURL: "https://base-39f52-default-rtdb.europe-west1.firebasedatabase.app" });
(async () => {
  const db = getDatabase(), n = JSON.parse(fs.readFileSync("rules-backup/SJEDNOCENI-NOT-navrh.json", "utf8"));
  const rep = (await db.ref("/repertoar").get()).val() || {};
  const bak = `rules-backup/REPERTOAR-pred-sjednocenim-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}.json`;
  fs.writeFileSync(bak, JSON.stringify(rep, null, 1)); console.log("záloha:", bak);
  const todo = [...n.prirazeni.map((p) => [p.id, p.skladba, p.navrh[0]]), ...n.souborChybiVDrive.filter((p) => p.kandidati.length === 1).map((p) => [p.id, p.skladba, p.kandidati[0]])];
  const upd = {};
  for (const [id, name, c] of todo) {
    if (!rep[id] || rep[id].name !== name) { console.log("PŘESKOČENO (změnilo se):", name); continue; }
    upd[`${id}/driveFileId`] = c.id; upd[`${id}/pdf`] = `https://drive.google.com/file/d/${c.id}/view?usp=sharing`;
    console.log(`${name}: ${rep[id].driveFileId || "(bez)"} → ${c.id}  ${c.soubor}`);
  }
  await db.ref("/repertoar").update(upd);
  const after = (await db.ref("/repertoar").get()).val();
  console.log("zapsáno skladeb:", Object.keys(upd).length / 2, "| celkem skladeb před/po:", Object.keys(rep).length, Object.keys(after).length);
  process.exit(0);
})();
