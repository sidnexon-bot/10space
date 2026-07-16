// deploy v15
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");
const { google } = require("googleapis");

const DRIVE_CLIENT_ID = defineSecret("DRIVE_CLIENT_ID");
const DRIVE_CLIENT_SECRET = defineSecret("DRIVE_CLIENT_SECRET");
const DRIVE_REFRESH_TOKEN = defineSecret("DRIVE_REFRESH_TOKEN");

initializeApp({
  databaseURL: "https://base-39f52-default-rtdb.europe-west1.firebasedatabase.app"
});

async function getDriveClient(clientId, clientSecret, refreshToken) {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return { drive: google.drive({ version: "v3", auth: oauth2Client }), oauth2Client };
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

exports.getFileUrl = onRequest(
  { cors: true, secrets: [DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN] },
  async (req, res) => {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Nepřihlášen" });

    let user;
    try {
      user = await getAuth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Neplatný token" });
    }

    const emailSafe = user.email.replace(/\./g, "_").replace(/@/g, "_");
    const userEmail = user.email;
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
      const { drive } = await getDriveClient(
        DRIVE_CLIENT_ID.value(),
        DRIVE_CLIENT_SECRET.value(),
        DRIVE_REFRESH_TOKEN.value()
      );

      const fileId = latest.driveFileId || latest.fileId;

      // Nasdílet soubor přihlášenému uživateli
      try {
        await drive.permissions.create({
          fileId: fileId,
          requestBody: {
            role: "reader",
            type: "user",
            emailAddress: userEmail
          },
          sendNotificationEmail: false
        });
      } catch(permErr) {
        // Pokud oprávnění už existuje, ignoruj chybu
        console.log("Permission note:", permErr.message);
      }

      // Získej webViewLink
      const fileRes = await drive.files.get({
        fileId: fileId,
        fields: "webViewLink, name, mimeType"
      });

      return res.json({
        url: fileRes.data.webViewLink,
        name: fileRes.data.name,
        mimeType: fileRes.data.mimeType
      });
    } catch(err) {
      console.error("Drive chyba:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

exports.uploadFile = onRequest(
  { cors: true, timeoutSeconds: 120, secrets: [DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN] },
  async (req, res) => {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Nepřihlášen" });

    let user;
    try {
      user = await getAuth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Neplatný token" });
    }

    const { fileName, mimeType, base64Data } = req.body;
    if (!fileName || !base64Data) return res.status(400).json({ error: "Chybí data" });

    try {
      const { drive } = await getDriveClient(
        DRIVE_CLIENT_ID.value(),
        DRIVE_CLIENT_SECRET.value(),
        DRIVE_REFRESH_TOKEN.value()
      );

      // Najdi nebo vytvoř složku 10space na Drive
      let folderId;
      const folderSearch = await drive.files.list({
        q: "name='10space' and mimeType='application/vnd.google-apps.folder' and trashed=false and '0B23cZAlYDWOndmtIZU45WWJrbWM' in parents",

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
      const { Readable } = require("stream");
      const fileRes = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId]
        },
        media: {
          mimeType: mimeType || "application/octet-stream",
          body: Readable.from(buffer)
        },
        fields: "id, name, webViewLink"
      });

      return res.json({
        driveFileId: fileRes.data.id,
        name: fileRes.data.name,
        url: fileRes.data.webViewLink
      });
    } catch(err) {
      console.error("Upload chyba:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

exports.deleteFile = onRequest(
  { cors: true, secrets: [DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN] },
  async (req, res) => {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Nepřihlášen" });

    let user;
    try {
      user = await getAuth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Neplatný token" });
    }

    const { docId } = req.body;
    if (!docId) return res.status(400).json({ error: "Chybí docId" });

    const db = getDatabase();
    const doc = await db.ref(`dokumenty/${docId}`).get();
    if (!doc.exists()) return res.status(404).json({ error: "Dokument nenalezen" });

    const docData = doc.val();

    try {
      const { drive } = await getDriveClient(
        DRIVE_CLIENT_ID.value(),
        DRIVE_CLIENT_SECRET.value(),
        DRIVE_REFRESH_TOKEN.value()
      );

      // Smaž všechny verze z Drive
      const verze = docData.verejneVerze || {};
      for (const v of Object.values(verze)) {
        const fileId = v.driveFileId || v.fileId;
        if (fileId) {
          try {
            await drive.files.delete({ fileId });
          } catch(e) {
            console.log("Drive delete note:", e.message);
          }
        }
      }

      // Smaž metadata z RTDB
      await db.ref(`dokumenty/${docId}`).remove();

      return res.json({ success: true });
    } catch(err) {
      console.error("Delete chyba:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);
