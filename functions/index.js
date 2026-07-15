// deploy v6
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");
const { google } = require("googleapis");

initializeApp();

async function getDriveClient(db) {
  const snap = await db.ref("drive_config").get();
  const config = snap.val();

  const oauth2Client = new google.auth.OAuth2(
    config.client_id,
    config.client_secret
  );

  oauth2Client.setCredentials({
    refresh_token: config.refresh_token
  });

  return google.drive({ version: "v3", auth: oauth2Client });
}

async function checkFolderAccess(db, emailSafe, folderId) {
  if (!folderId) return "read";
  const folder = await db.ref(`slozky/${folderId}`).get();
  if (!folder.exists()) return "read";
  const data = folder.val();
  const pristup = data.pristup;
  if (pristup && pristup[emailSafe]) return pristup[emailSafe];
  if (pristup && pristup.vychozi) return pristup.vychozi;
  if (data.rodic) return await checkFolderAccess(db, emailSafe, data.rodic);
  return "read";
}

// Získej download URL pro dokument
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
    const drive = await getDriveClient(db);
    const fileId = latest.driveFileId || latest.fileId;
    const fileRes = await drive.files.get({
      fileId: fileId,
      fields: "webViewLink, webContentLink, name, mimeType"
    });

    return res.json({
      url: fileRes.data.webContentLink || fileRes.data.webViewLink,
      name: fileRes.data.name,
      mimeType: fileRes.data.mimeType
    });
  } catch(err) {
    console.error("Drive chyba:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Nahraj soubor na Drive
exports.uploadFile = onRequest({ cors: true }, async (req, res) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ error: "Nepřihlášen" });

  let user;
  try {
    user = await getAuth().verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: "Neplatný token" });
  }

  const { fileName, mimeType, base64Data, slozkaId } = req.body;
  if (!fileName || !base64Data) return res.status(400).json({ error: "Chybí data" });

  const db = getDatabase();

  try {
    const drive = await getDriveClient(db);

    // Najdi nebo vytvoř složku 10space na Drive
    let folderId;
    const folderSearch = await drive.files.list({
      q: "name='10space' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: "files(id)"
    });

    if (folderSearch.data.files.length > 0) {
      folderId = folderSearch.data.files[0].id;
    } else {
      const folder = await drive.files.create({
        requestBody: {
          name: "10space",
          mimeType: "application/vnd.google-apps.folder"
        },
        fields: "id"
      });
      folderId = folder.data.id;
    }

    // Nahraj soubor
    const buffer = Buffer.from(base64Data, "base64");
    const fileRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId]
      },
      media: {
        mimeType: mimeType || "application/octet-stream",
        body: require("stream").Readable.from(buffer)
      },
      fields: "id, name, webViewLink, webContentLink"
    });

    return res.json({
      driveFileId: fileRes.data.id,
      name: fileRes.data.name,
      url: fileRes.data.webContentLink || fileRes.data.webViewLink
    });
  } catch(err) {
    console.error("Upload chyba:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
