// deploy v4
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");

initializeApp();

async function checkFolderAccess(db, emailSafe, folderId) {
  if (!folderId) return "read";
  const folder = await db.ref(`slozky/${folderId}`).get();
  if (!folder.exists()) return "deny";
  const data = folder.val();
  const pristup = data.pristup;
  if (pristup && pristup[emailSafe]) return pristup[emailSafe];
  if (pristup && pristup.vychozi) return pristup.vychozi;
  if (data.rodic) return await checkFolderAccess(db, emailSafe, data.rodic);
  return "read";
}

exports.getFileUrl = onRequest({ cors: true }, async (req, res) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ error: "Nepřihlášen" });

  let user;
  try {
    user = await getAuth().verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: "Neplatný token" });
  }

  const emailSafe = user.email.replace(/\./g, "_").replace(/@/g, "_");
  const { docId } = req.body;
  if (!docId) return res.status(400).json({ error: "Chybí docId" });

  const db = getDatabase();
  const doc = await db.ref(`dokumenty/${docId}`).get();
  if (!doc.exists()) return res.status(404).json({ error: "Dokument nenalezen" });

  const docData = doc.val();
  const access = await checkFolderAccess(db, emailSafe, docData.slozkaId);
  if (access === "deny") return res.status(403).json({ error: "Přístup odepřen" });

  const verze = docData.verejneVerze;
  if (!verze) return res.status(404).json({ error: "Žádná verze" });
  const latestKey = Object.keys(verze).sort().pop();
  const latest = verze[latestKey];

  try {
    const storage = getStorage();
    const bucket = storage.bucket("base-39f52.firebasestorage.app");
    const file = bucket.file(`dokumenty/${latest.fileId}`);
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
      version: "v4"
    });
    return res.json({ url: signedUrl });
  } catch(err) {
    console.error("Signed URL chyba:", err.message);
    // Fallback: přímý download URL
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/base-39f52.firebasestorage.app/o/dokumenty%2F${latest.fileId}?alt=media`;
    return res.json({ url: downloadUrl });
  }
});
