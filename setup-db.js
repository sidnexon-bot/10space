const { initializeApp, cert } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const serviceAccount = require("./serviceAccount.json");

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://base-39f52-default-rtdb.europe-west1.firebasedatabase.app"
});

const db = getDatabase();

const data = {
  slozky: {
    "noty": { nazev: "Noty", rodic: null, pristup: null },
    "noty-aktivni": { nazev: "Aktivní repertoár", rodic: "noty", pristup: null },
    "noty-archiv": { nazev: "Archiv", rodic: "noty", pristup: null },
    "akce": { nazev: "Akce", rodic: null, pristup: null },
    "administrativa": { nazev: "Administrativa", rodic: null, pristup: null },
    "administrativa-ucetnictvi": { nazev: "Účetnictví", rodic: "administrativa", pristup: { vychozi: "deny" } },
    "administrativa-stanovy": { nazev: "Stanovy a dokumenty", rodic: "administrativa", pristup: null },
    "administrativa-smlouvy": { nazev: "Smlouvy", rodic: "administrativa", pristup: { vychozi: "deny" } },
    "interni": { nazev: "Interní", rodic: null, pristup: null },
    "interni-fotky": { nazev: "Fotky a videa", rodic: "interni", pristup: null },
    "interni-ruzne": { nazev: "Různé", rodic: "interni", pristup: null }
  },
  citace: {
    "1TEN": 0, "1LAM": 0,
    "2TEN": 0, "2LAM": 0,
    "3TEN": 0, "3LAM": 0,
    "4TEN": 0, "4LAM": 0,
    "XTEN": 0, "XLAM": 0,
    "5TEN": 0, "6TEN": 0,
    "7TEN": 0, "8TEN": 0,
    "9TEN": 0
  },
  dokumenty: {},
  externiPristupy: {}
};

db.ref("/").update(data).then(() => {
  console.log("Hotovo!");
  process.exit(0);
}).catch(err => {
  console.error("Chyba:", err);
  process.exit(1);
});
