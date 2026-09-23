// deploy v53
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");
const { google } = require("googleapis");

const DRIVE_CLIENT_ID = defineSecret("DRIVE_CLIENT_ID");
const DRIVE_CLIENT_SECRET = defineSecret("DRIVE_CLIENT_SECRET");
const DRIVE_REFRESH_TOKEN = defineSecret("DRIVE_REFRESH_TOKEN");

const DRIVE_OAUTH_CLIENT_ID = defineSecret("DRIVE_OAUTH_CLIENT_ID");
const DRIVE_OAUTH_CLIENT_SECRET = defineSecret("DRIVE_OAUTH_CLIENT_SECRET");
const DRIVE_OAUTH_REFRESH_TOKEN = defineSecret("DRIVE_OAUTH_REFRESH_TOKEN");

initializeApp({
  databaseURL: "https://base-39f52-default-rtdb.europe-west1.firebasedatabase.app"
});

const DRIVE_SERVICE_ACCOUNT = defineSecret("DRIVE_SERVICE_ACCOUNT");

async function getDriveClient() {
  const serviceAccountJson = DRIVE_SERVICE_ACCOUNT.value();
  const serviceAccount = JSON.parse(serviceAccountJson);
  
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/drive"]
  });

  const authClient = await auth.getClient();
  return { drive: google.drive({ version: "v3", auth: authClient }) };
}

async function getOAuthDriveClient() {
  const oauth2Client = new google.auth.OAuth2(
    DRIVE_OAUTH_CLIENT_ID.value(),
    DRIVE_OAUTH_CLIENT_SECRET.value()
  );
  oauth2Client.setCredentials({
    refresh_token: DRIVE_OAUTH_REFRESH_TOKEN.value()
  });
  return { drive: google.drive({ version: "v3", auth: oauth2Client }) };
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

async function checkDriveAccess(db, uid, fileId) {
  // Projdi strom nahoru dokud nenajdeš explicitní ACL nebo nedojdeš na root
  let current = fileId;
  for (let i = 0; i < 15; i++) {
    const aclSnap = await db.ref(`/acl/${current}/${uid}`).get();
    if (aclSnap.exists()) {
      return aclSnap.val(); // "read" | "write" | "none"
    }
    // Najdi rodiče v driveCache
    const folderSnap = await db.ref(`/driveCache/folders/${current}`).get();
    const fileSnap = await db.ref(`/driveCache/files/${current}`).get();
    const parentId = folderSnap.val()?.parentId || fileSnap.val()?.parentId;
    if (!parentId) break;
    current = parentId;
  }
  return "read"; // výchozí přístup
}

exports.getFileUrl = onRequest(
  { cors: true, secrets: [DRIVE_SERVICE_ACCOUNT] },
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
    const { docId, driveFileId: directFileId } = req.body;

	let fileId;

	if (directFileId) {
	  // Přímý driveFileId — Drive browser mód
	  fileId = directFileId;
	} else if (docId) {
	  // Klasický mód přes RTDB
	  const db = getDatabase();
	  const doc = await db.ref(`dokumenty/${docId}`).get();
	  if (!doc.exists()) return res.status(404).json({ error: "Dokument nenalezen" });
	  const docData = doc.val();
 	 const verze = docData.verejneVerze;
	  if (!verze) return res.status(404).json({ error: "Žádná verze" });
	  const latestKey = Object.keys(verze).sort().pop();
	  fileId = verze[latestKey].driveFileId || verze[latestKey].fileId;
	} else {
	  return res.status(400).json({ error: "Chybí docId nebo driveFileId" });
	}

    try {
      const { drive } = await getDriveClient();


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
  	fields: "webViewLink, name, mimeType, thumbnailLink"
      });

return res.json({
  url: fileRes.data.webViewLink,
  name: fileRes.data.name,
  mimeType: fileRes.data.mimeType,
  thumbnailLink: fileRes.data.thumbnailLink
});
    } catch(err) {
      console.error("Drive chyba:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

exports.uploadFile = onRequest(
  { cors: true, timeoutSeconds: 120, secrets: [DRIVE_SERVICE_ACCOUNT, DRIVE_OAUTH_CLIENT_ID, DRIVE_OAUTH_CLIENT_SECRET, DRIVE_OAUTH_REFRESH_TOKEN] },
  async (req, res) => {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Nepřihlášen" });
    let user;
    try {
      user = await getAuth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Neplatný token" });
    }

    // Vytvoření složky
    if (req.body.createFolder) {
      const { fileName, parentFolderId } = req.body;
      try {
        const { drive } = await getDriveClient();
        const folder = await drive.files.create({
          requestBody: {
            name: fileName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentFolderId || "0B23cZAlYDWOndmtIZU45WWJrbWM"]
          },
          fields: "id, name"
        });
        return res.json({ driveFileId: folder.data.id, name: folder.data.name });
      } catch(err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // Upload souboru
    const { fileName, mimeType, base64Data, slozkaId } = req.body;
    if (!fileName || !base64Data) return res.status(400).json({ error: "Chybí data" });
    try {
      const { drive } = await getOAuthDriveClient();

      // Nahraj soubor do aktuální složky na Drive
      const parentId = slozkaId || "0B23cZAlYDWOndmtIZU45WWJrbWM";
      const buffer = Buffer.from(base64Data, "base64");
      const { Readable } = require("stream");
      const fileRes = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [parentId]
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
  { cors: true, secrets: [DRIVE_SERVICE_ACCOUNT, DRIVE_OAUTH_CLIENT_ID, DRIVE_OAUTH_CLIENT_SECRET, DRIVE_OAUTH_REFRESH_TOKEN] },
  async (req, res) => {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Nepřihlášen" });

    try {
      await getAuth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Neplatný token" });
    }

    const { docId, driveFileId } = req.body;
    if (!docId && !driveFileId) return res.status(400).json({ error: "Chybí ID" });

    const db = getDatabase();

    try {
      const { drive } = await getOAuthDriveClient();
      let fileId = driveFileId;

      if (!fileId && docId) {
        // Zkus RTDB /dokumenty
        const doc = await db.ref(`dokumenty/${docId}`).get();
        if (doc.exists()) {
          const verze = doc.val().verejneVerze;
          const latestKey = Object.keys(verze || {}).sort().pop();
          fileId = verze?.[latestKey]?.driveFileId;
          await db.ref(`dokumenty/${docId}`).remove();
        }
      }

      if (fileId) {
        await drive.files.delete({ fileId });
        // Aktualizuj driveCache
        await db.ref(`driveCache/files/${fileId}`).remove();
        await db.ref(`driveCache/folders/${fileId}`).remove();
      }

      return res.json({ success: true });
    } catch(err) {
      console.error("Delete chyba:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

exports.setDriveAcl = onRequest(
  { cors: true, secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (req, res) => {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Nepřihlášen" });
    let user;
    try {
      user = await getAuth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Neplatný token" });
    }

    const { fileId, uid, access } = req.body;
    if (!fileId || !uid || !access) return res.status(400).json({ error: "Chybí data" });

    try {
      const db = getDatabase();
      if (access === "default") {
        await db.ref(`/acl/${fileId}/${uid}`).remove();
      } else {
        await db.ref(`/acl/${fileId}/${uid}`).set(access);
      }
      return res.json({ success: true });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

exports.getFileStream = onRequest(
  { cors: true, timeoutSeconds: 60, secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (req, res) => {
    const { driveFileId, shareToken } = req.query;

      if (shareToken) {
      const db = getDatabase();
      const shareSnap = await db.ref(`/shareTokens/${shareToken}`).get();
      if (!shareSnap.exists()) return res.status(403).json({ error: "Neplatný odkaz" });
      const shareData = shareSnap.val();
      if (Date.now() > shareData.expiruje) return res.status(410).json({ error: "Odkaz vypršel" });
      if (shareData.driveFileId !== driveFileId) {
        const { drive: driveCheck } = await getDriveClient();
        let current = driveFileId;
        let isInside = false;
        for (let i = 0; i < 10; i++) {
          const f = await driveCheck.files.get({ fileId: current, fields: "id, parents" });
          if (!f.data.parents) break;
          current = f.data.parents[0];
          if (current === shareData.driveFileId) { isInside = true; break; }
        }
        if (!isInside) return res.status(403).json({ error: "Neplatný přístup" });
      }
    } else {
      const token = req.headers.authorization?.split("Bearer ")[1];
      if (!token) return res.status(401).json({ error: "Nepřihlášen" });
      let user;
      try {
        user = await getAuth().verifyIdToken(token);
      } catch {
        return res.status(401).json({ error: "Neplatný token" });
      }

      const db = getDatabase();
      const access = await checkDriveAccess(db, user.uid, driveFileId);
      if (access === "none") {
        return res.status(403).json({ error: "Přístup odepřen" });
      }
    }

    if (!driveFileId) return res.status(400).json({ error: "Chybí driveFileId" });
    try {
      const { drive } = await getDriveClient();

      const meta = await drive.files.get({
  fileId: driveFileId,
  fields: "name, mimeType, size",
  supportsAllDrives: true
});

const mimeType = meta.data.mimeType;
let stream;
let exportMime = null;
let exportExt = "";

if (mimeType === "application/vnd.google-apps.spreadsheet") {
  exportMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  exportExt = ".xlsx";
} else if (mimeType === "application/vnd.google-apps.document") {
  exportMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  exportExt = ".docx";
} else if (mimeType === "application/vnd.google-apps.presentation") {
  exportMime = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  exportExt = ".pptx";
}

if (exportMime) {
  stream = await drive.files.export(
    { fileId: driveFileId, mimeType: exportMime },
    { responseType: "stream" }
  );
} else {
  stream = await drive.files.get(
    { fileId: driveFileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" }
  );
}

            const finalName = exportExt ? meta.data.name + exportExt : meta.data.name;
      const safeName = encodeURIComponent(finalName || "file");

      res.setHeader("Content-Type", exportMime || mimeType);
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safeName}`);

      if (!exportMime && meta.data.size) {
        res.setHeader("Content-Length", meta.data.size);
      }
      res.setHeader("Accept-Ranges", "bytes");

      stream.data.pipe(res);
    } catch(err) {
  console.error("Stream chyba:", err.message, err.code, err.errors);
  return res.status(500).json({ error: err.message, code: err.code, errors: err.errors });
}
  }
);

const { onValueCreated } = require("firebase-functions/v2/database");

exports.onAkceCreated = onValueCreated(
  { ref: "/akce/{akceId}", region: "europe-west1", secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (event) => {
    const akceId = event.params.akceId;
    const akce = event.data.val();

    if (!akce || !akce.name) return;
    if (akce.is_template) return; // Přeskočit šablony
    if (akce.type === "Zkouška") return;

    const db = getDatabase();

    try {
      const { drive } = await getDriveClient();
      const ROOT = "0B23cZAlYDWOndmtIZU45WWJrbWM";

      async function findOrCreateFolder(name, parentId) {
        const search = await drive.files.list({
          q: `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
          fields: "files(id)"
        });
        if (search.data.files.length > 0) return search.data.files[0].id;
        const folder = await drive.files.create({
          requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
          fields: "id"
        });
        return folder.data.id;
      }

      // Extrahuj rok
      const datum = akce.date || "";
      const rok = datum ? datum.substring(0, 4) : new Date().getFullYear().toString();

      // Název složky
      const nazevSlozky = datum ? `${datum}_${akce.name}` : akce.name;

      // Vytvoř strukturu na Drive
      const akceRootId = await findOrCreateFolder("_Akce", ROOT);
      const rokFolderId = await findOrCreateFolder(rok, akceRootId);
      const projektFolderId = await findOrCreateFolder(nazevSlozky, rokFolderId);
      const podkladyId = await findOrCreateFolder("Podklady", projektFolderId);
      const smlouvyId = await findOrCreateFolder("Smlouvy a faktury", projektFolderId);
      const fotkyId = await findOrCreateFolder("Fotky a nahrávky", projektFolderId);

      // Generuj wiki text přes OpenRouter
      let wikiText = "";
      try {
        const configSnap = await db.ref("/gemini_config/apiKey").get();
        const apiKey = configSnap.val();

        if (apiKey) {
          const prompt = `Jsi asistent pěveckého spolku 10men. Napiš stručný interní popis nadcházející akce v budoucím čase, ve třetí osobě v češtině, maximálně 2-3 věty.

Pravidla:
- Piš kultivovaně ale přirozeně, v celých větách
- Zmiň POUZE pole která mají neprázdnou hodnotu
- NIKDY nevymýšlej ani nedoplňuj informace které nejsou v datech
- Pokud je pole prázdné, prázdný řetězec nebo "undefined", vůbec ho nezmiňuj
- Oblečení: "neformální" = tričko 10men, "formální" = košile a kravata — zmiň jen pokud je vyplněno
- Hospodu zmiň jen pokud je konkrétně vyplněna — nikdy ji nevymýšlej
- Popis je interní pro členy sboru

Údaje (ignoruj prázdná pole):
Název: ${akce.name || ""}
Datum: ${datum}
Místo: ${akce.place || ""}${akce.sraz ? `\nSraz: ${akce.sraz}` : ""}${akce.doprava ? `\nDoprava: ${akce.doprava}` : ""}${akce.obleceni ? `\nOblečení: ${akce.obleceni === "neformální" ? "tričko 10men" : akce.obleceni === "formální" ? "košile a kravata" : akce.obleceni}` : ""}${akce.type ? `\nTyp: ${akce.type}` : ""}${akce.note ? `\nPoznámka: ${akce.note}` : ""}${akce.hospoda ? `\nHospoda po akci: ${akce.hospoda}` : ""}`;


          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 200
            })
          });

          const data = await response.json();
          wikiText = data.choices?.[0]?.message?.content || "";
        }
      } catch(wikiErr) {
        console.error("Wiki generování selhalo:", wikiErr.message);
      }

      // Ulož projekt do RTDB
      await db.ref(`/projekty/${akceId}`).set({
        nazev: akce.name,
        datum: datum,
        misto: akce.place || "",
        stav: akce.status || "aktivni",
        driveFolderId: projektFolderId,
        drivePodkladyId: podkladyId,
        driveSmlouvyId: smlouvyId,
        driveFotkyId: fotkyId,
        wikiText: wikiText,
        vytvoreno: Date.now()
      });

      console.log(`Projekt vytvořen: ${nazevSlozky}`);
    } catch(err) {
      console.error("Chyba při vytvoření projektu:", err.message);
    }
  }
);

const { onRequest: onRequestV2 } = require("firebase-functions/v2/https");
const crypto2 = require("crypto");

// ═══════════════════════════════════════════
// GOOGLE DRIVE REAL-TIME SYNC (Changes API)
// ═══════════════════════════════════════════

const WEBHOOK_URL = "https://ondrivewebhook-etp6s2ynnq-uc.a.run.app";

// 1) Spustí sledování změn na Drive — zavolat jednou ručně, pak automaticky obnovováno
exports.startDriveWatch = onRequest(
  { cors: true, secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (req, res) => {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Nepřihlášen" });
    try {
      await getAuth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Neplatný token" });
    }

    try {
      const { drive } = await getDriveClient();
      const db = getDatabase();

      // Získej startPageToken pro Changes API
      const startTokenRes = await drive.changes.getStartPageToken({});
      const pageToken = startTokenRes.data.startPageToken;

      const channelId = crypto2.randomUUID();
      const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000; // 6 dní

      const watchRes = await drive.changes.watch({
        pageToken: pageToken,
        requestBody: {
          id: channelId,
          type: "web_hook",
          address: WEBHOOK_URL,
          expiration: expiration
        }
      });

      // Ulož stav do RTDB
      await db.ref("/driveWatch").set({
        channelId: channelId,
        resourceId: watchRes.data.resourceId,
        pageToken: pageToken,
        expiration: expiration,
        vytvoreno: Date.now()
      });

      return res.json({ success: true, channelId, expiration });
    } catch(err) {
      console.error("startDriveWatch chyba:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// 2) Webhook — Google sem pošle notifikaci při každé změně
exports.onDriveWebhook = onRequest(
  { cors: false, secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (req, res) => {
    // Google webhook nemá auth token — ověřujeme jen že request vypadá validně
    const channelId = req.headers["x-goog-channel-id"];
    const resourceState = req.headers["x-goog-resource-state"];

    // "sync" je úvodní potvrzovací zpráva, ignoruj ji
    if (resourceState === "sync") {
      return res.status(200).send("OK");
    }

    try {
      const db = getDatabase();
      const watchSnap = await db.ref("/driveWatch").get();
      const watch = watchSnap.val();

      if (!watch || watch.channelId !== channelId) {
        return res.status(200).send("Unknown channel");
      }

      const { drive } = await getDriveClient();

      // Zjisti co se změnilo od posledního pageToken
      const changesRes = await drive.changes.list({
        pageToken: watch.pageToken,
        fields: "newStartPageToken, changes(fileId, removed, file(id, name, mimeType, parents, modifiedTime, size))"
      });
	console.log("Počet změn:", changesRes.data.changes?.length || 0);
	console.log("Změny:", JSON.stringify(changesRes.data.changes));

      const updates = {};

      for (const change of changesRes.data.changes || []) {
        if (change.removed) {
          updates[`/driveCache/files/${change.fileId}`] = null;
          updates[`/driveCache/folders/${change.fileId}`] = null;
        } else if (change.file) {
          const f = change.file;
          const isFolder = f.mimeType === "application/vnd.google-apps.folder";
          const parentId = f.parents?.[0] || null;

          if (isFolder) {
            updates[`/driveCache/folders/${f.id}`] = {
              name: f.name,
              parentId: parentId,
              modifiedTime: f.modifiedTime
            };
          } else {
            updates[`/driveCache/files/${f.id}`] = {
              name: f.name,
              mimeType: f.mimeType,
              parentId: parentId,
              modifiedTime: f.modifiedTime,
              size: f.size || null,
              driveFileId: f.id
            };
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
      }

      // Ulož nový pageToken pro příští change
      if (changesRes.data.newStartPageToken) {
        await db.ref("/driveWatch/pageToken").set(changesRes.data.newStartPageToken);
      }

      return res.status(200).send("OK");
    } catch(err) {
      console.error("onDriveWebhook chyba:", err.message);
      return res.status(500).send("Error");
    }
  }
);

const { onSchedule } = require("firebase-functions/v2/scheduler");

// 3) Automatické obnovování channel — spustí se každý den, obnoví jen pokud brzy expiruje
exports.renewDriveWatch = onSchedule(
  { schedule: "every 24 hours", secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (event) => {
    const db = getDatabase();
    const watchSnap = await db.ref("/driveWatch").get();
    const watch = watchSnap.val();

    if (!watch) return;

    const hodinDoExpirace = (watch.expiration - Date.now()) / (1000 * 60 * 60);
    
    // Obnov jen pokud zbývá méně než 24 hodin
    if (hodinDoExpirace > 24) return;

    try {
      const { drive } = await getDriveClient();

      // Zastav starý channel
      try {
        await drive.channels.stop({
          requestBody: { id: watch.channelId, resourceId: watch.resourceId }
        });
      } catch(e) {
        console.log("Stop channel note:", e.message);
      }

      // Vytvoř nový
      const channelId = crypto.randomUUID();
      const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000;

      const watchRes = await drive.changes.watch({
        pageToken: watch.pageToken,
        requestBody: {
          id: channelId,
          type: "web_hook",
          address: WEBHOOK_URL,
          expiration: expiration
        }
      });

      await db.ref("/driveWatch").update({
        channelId: channelId,
        resourceId: watchRes.data.resourceId,
        expiration: expiration
      });

      console.log("Drive watch obnoven:", channelId);
    } catch(err) {
      console.error("renewDriveWatch chyba:", err.message);
    }
  }
);

exports.renameFile = onRequest(
  { cors: true, secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (req, res) => {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Nepřihlášen" });
    try {
      await getAuth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Neplatný token" });
    }

    const { fileId, newName } = req.body;
    if (!fileId || !newName) return res.status(400).json({ error: "Chybí data" });

    try {
      const { drive } = await getDriveClient();
      const result = await drive.files.update({
        fileId: fileId,
        requestBody: { name: newName },
        fields: "id, name"
      });
      return res.json({ success: true, name: result.data.name });
    } catch(err) {
      console.error("Rename chyba:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

const crypto3 = require("crypto");

// Vytvoření sdíleného odkazu s PIN ochranou
exports.createShareToken = onRequest(
  { cors: true, secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (req, res) => {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Nepřihlášen" });
    let user;
    try {
      user = await getAuth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Neplatný token" });
    }

    const { driveFileId, projektId, pin, expiryDays } = req.body;
    if (!pin || (!driveFileId && !projektId)) return res.status(400).json({ error: "Chybí data" });

    try {
      const db = getDatabase();
      const shareToken = crypto3.randomBytes(16).toString("hex");
      const pinHash = crypto3.createHash("sha256").update(pin).digest("hex");
      const days = expiryDays || 30;
      const expiruje = Date.now() + days * 24 * 60 * 60 * 1000;

      if (projektId) {
        const projektSnap = await db.ref(`/projekty/${projektId}`).get();
        const projekt = projektSnap.val();
        if (!projekt) return res.status(404).json({ error: "Projekt nenalezen" });

        await db.ref(`/shareTokens/${shareToken}`).set({
          type: "projekt",
          projektId,
          driveFileId: projekt.drivePodkladyId || null, // jen Podklady, ne Smlouvy
          nazev: projekt.nazev,
          pinHash,
          vytvoril: user.email,
          vytvoreno: Date.now(),
          expiruje,
          pocetOtevreni: 0
        });
      } else {
        const { drive } = await getDriveClient();
        const meta = await drive.files.get({
          fileId: driveFileId,
          fields: "name, mimeType",
          supportsAllDrives: true
        });

        await db.ref(`/shareTokens/${shareToken}`).set({
          driveFileId,
          nazev: meta.data.name,
          mimeType: meta.data.mimeType,
          pinHash,
          vytvoril: user.email,
          vytvoreno: Date.now(),
          expiruje,
          pocetOtevreni: 0
        });
      }

      return res.json({ success: true, token: shareToken, url: `https://space.10men.cz/share.html?token=${shareToken}` });
    } catch(err) {
      console.error("createShareToken chyba:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Ověření PIN a získání odkazu na soubor
exports.verifyShareToken = onRequest(
  { cors: true, secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (req, res) => {
    const { token, pin } = req.body;
    if (!token || !pin) return res.status(400).json({ error: "Chybí data" });

    try {
      const db = getDatabase();
      const snap = await db.ref(`/shareTokens/${token}`).get();
      if (!snap.exists()) return res.status(404).json({ error: "Odkaz nenalezen nebo vypršel" });

      const data = snap.val();

      if (Date.now() > data.expiruje) {
        return res.status(410).json({ error: "Odkaz vypršel" });
      }

      const pinHash = crypto3.createHash("sha256").update(pin).digest("hex");
      if (pinHash !== data.pinHash) {
        return res.status(403).json({ error: "Nesprávný PIN" });
      }

      await db.ref(`/shareTokens/${token}/pocetOtevreni`).set((data.pocetOtevreni || 0) + 1);

      if (data.type === "projekt") {
        return res.json({
          success: true,
          type: "projekt",
          projektId: data.projektId,
          nazev: data.nazev
        });
      }

      return res.json({
        success: true,
        nazev: data.nazev,
        mimeType: data.mimeType,
        driveFileId: data.driveFileId
      });
    } catch(err) {
      console.error("verifyShareToken chyba:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

exports.listSharedFolder = onRequest(
  { cors: true, secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (req, res) => {
    const { shareToken, folderId } = req.body;
    if (!shareToken) return res.status(400).json({ error: "Chybí token" });

    try {
      const db = getDatabase();
      const shareSnap = await db.ref(`/shareTokens/${shareToken}`).get();
      if (!shareSnap.exists()) return res.status(403).json({ error: "Neplatný odkaz" });
      const shareData = shareSnap.val();
      if (Date.now() > shareData.expiruje) return res.status(410).json({ error: "Odkaz vypršel" });

      // Ověř že požadovaná složka je root nebo podsložka sdílené složky
      const { drive } = await getDriveClient();
      const targetFolder = folderId || shareData.driveFileId;

      // Bezpečnostní kontrola — ověř že targetFolder je root nebo je uvnitř stromu sharedFileId
      if (targetFolder !== shareData.driveFileId) {
        let current = targetFolder;
        let isInside = false;
        for (let i = 0; i < 10; i++) {
          const f = await drive.files.get({ fileId: current, fields: "id, parents" });
          if (!f.data.parents) break;
          current = f.data.parents[0];
          if (current === shareData.driveFileId) { isInside = true; break; }
        }
        if (!isInside) return res.status(403).json({ error: "Přístup odepřen" });
      }

      const response = await drive.files.list({
        q: `'${targetFolder}' in parents and trashed=false`,
        fields: "files(id, name, mimeType, size, modifiedTime)",
        orderBy: "folder,name",
        pageSize: 200
      });

      const files = response.data.files.map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size || null,
        modifiedTime: f.modifiedTime,
        isFolder: f.mimeType === "application/vnd.google-apps.folder"
      }));

      return res.json({ success: true, files, folderName: shareData.nazev });
    } catch(err) {
      console.error("listSharedFolder chyba:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

exports.regenerateSharePin = onRequest(
  { cors: true, secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (req, res) => {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Nepřihlášen" });
    try {
      await getAuth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Neplatný token" });
    }

    const { shareToken, newPin } = req.body;
    if (!shareToken || !newPin) return res.status(400).json({ error: "Chybí data" });

    try {
      const db = getDatabase();
      const pinHash = crypto3.createHash("sha256").update(newPin).digest("hex");
      await db.ref(`/shareTokens/${shareToken}/pinHash`).set(pinHash);
      return res.json({ success: true });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

exports.getSharedProjekt = onRequest(
  { cors: true, secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (req, res) => {
    const { shareToken } = req.body;
    if (!shareToken) return res.status(400).json({ error: "Chybí token" });

    try {
      const db = getDatabase();
      const shareSnap = await db.ref(`/shareTokens/${shareToken}`).get();
      if (!shareSnap.exists()) return res.status(403).json({ error: "Neplatný odkaz" });
      const shareData = shareSnap.val();
      if (Date.now() > shareData.expiruje) return res.status(410).json({ error: "Odkaz vypršel" });
      if (shareData.type !== "projekt") return res.status(400).json({ error: "Neplatný typ odkazu" });

      const projektId = shareData.projektId;
      const [projektSnap, akceSnap, membersSnap] = await Promise.all([
        db.ref(`/projekty/${projektId}`).get(),
        db.ref(`/akce/${projektId}`).get(),
        db.ref("/members").get()
      ]);
      const projekt = projektSnap.val();
      const akce = akceSnap.val() || {};
      const members = Object.values(membersSnap.val() || {});

      function getMemberName(id) {
        const m = members.find(m => m.id === id || m.uid === id);
        return m?.name || m?.email || id || "—";
      }

      let rider = null;
      try { rider = akce.rider ? JSON.parse(akce.rider) : null; } catch(e) {}

      let timeline = null;
      try { timeline = akce.harmonogram_items ? JSON.parse(akce.harmonogram_items) : null; } catch(e) {}

      const garantJmeno = rider?.garant ? getMemberName(rider.garant) : "";

      // Rider harmonogram_koncertu s vyřešenými jmény moderátorů
      const harmonogramKoncertu = (rider?.harmonogram_koncertu || []).map(r => ({
        ...r,
        moderatorJmeno: r.moderator ? getMemberName(r.moderator) : null
      }));

      return res.json({
        success: true,
        nazev: projekt.nazev,
        datum: projekt.datum,
        misto: akce.place || projekt.misto || "",
        sraz: akce.sraz || "",
        doprava: akce.doprava || "",
        wikiText: projekt.wikiText || "",
        garant: garantJmeno,
        timeline: timeline || [],
        pripravneAkce: rider?.pripravne_akce || [],
        harmonogramKoncertu,
        ukonceni: rider?.ukonceni || [],
        hasPodklady: !!projekt.drivePodkladyId
      });
    } catch(err) {
      console.error("getSharedProjekt chyba:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// ═════════════════════════════════════════════════════════════════════
// PŘIPOJIT NA KONEC index.js — z existujícího kódu výš v souboru
// využívá jen: initializeApp(), getDatabase, getAuth, google, onRequest,
// defineSecret. NEPOUŽÍVÁ DRIVE_CLIENT_ID/DRIVE_CLIENT_SECRET — ty patří
// k OAuth klientovi v jiném GCP projektu/účtu (majitel Google Disku) a
// pro obecné přihlašování členů se nehodí. Místo toho používá vlastní,
// nový pár secrets napojený na "Web client (auto created by Google
// Service)" — OAuth klienta, co Firebase sám vytvořil přímo v base-39f52
// a co appky (10base, 10korun, 10space) už úspěšně používají pro
// signInWithPopup/signInWithRedirect.
//
// Custom Token OAuth flow pro Marka — řeší iOS PWA standalone bug
// (appka se zasekávala na loginu, viz TenOrbit-roadmapa.md, sekce
// "Known issue — Marek iOS PWA login"). Princip: OAuth výměna s Googlem
// proběhne celá tady na serveru, appka na klientovi dostane hotový
// Firebase Custom Token přes URL parametr — nezávisí na tom, jestli si
// iOS "pamatuje" něco napříč odchodem na Google a návratem.
//
// Vyžaduje DVA NOVÉ Firebase Secrets (hodnoty vzít z "Web client (auto
// created by Google Service)" v Google Cloud Console → base-39f52 →
// APIs & Services → Credentials):
//   firebase functions:secrets:set MAREK_OAUTH_CLIENT_ID
//   firebase functions:secrets:set MAREK_OAUTH_CLIENT_SECRET
//   firebase functions:secrets:set MAREK_STATE_SECRET
//
// A do TOHOTO klienta (ne Drive klienta v jiném projektu!) přidat do
// Authorized redirect URIs:
//   https://us-central1-base-39f52.cloudfunctions.net/marekAuthCallback
// ═════════════════════════════════════════════════════════════════════

const crypto = require("crypto");
const MAREK_OAUTH_CLIENT_ID = defineSecret("MAREK_OAUTH_CLIENT_ID");
const MAREK_OAUTH_CLIENT_SECRET = defineSecret("MAREK_OAUTH_CLIENT_SECRET");
const MAREK_STATE_SECRET = defineSecret("MAREK_STATE_SECRET");

const MAREK_REDIRECT_URI = "https://us-central1-base-39f52.cloudfunctions.net/marekAuthCallback";
const MAREK_APP_LOGIN_URL = "https://marek.10men.cz/login.html";

// ── State token (CSRF ochrana, bezstavová — nic se neukládá do DB) ──
function signState(secret) {
  const payload = Date.now().toString();
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

function verifyState(state, secret, maxAgeMs = 5 * 60 * 1000) {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const [payload, sig] = decoded.split(".");
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (sig !== expected) return false;
    const age = Date.now() - parseInt(payload, 10);
    return age >= 0 && age < maxAgeMs;
  } catch {
    return false;
  }
}

// ── 1) Start — appka sem naviguje (window.location.href, ne fetch) ──
exports.marekAuthStart = onRequest(
  { secrets: [MAREK_OAUTH_CLIENT_ID, MAREK_STATE_SECRET] },
  (req, res) => {
    const oauth2Client = new google.auth.OAuth2(
      MAREK_OAUTH_CLIENT_ID.value(),
      undefined,
      MAREK_REDIRECT_URI
    );

    const state = signState(MAREK_STATE_SECRET.value());

    const authUrl = oauth2Client.generateAuthUrl({
      scope: ["openid", "email", "profile"],
      state,
      prompt: "select_account"
    });

    res.redirect(authUrl);
  }
);

// ── 2) Callback — Google sem přesměruje po souhlasu uživatele ──
exports.marekAuthCallback = onRequest(
  { secrets: [MAREK_OAUTH_CLIENT_ID, MAREK_OAUTH_CLIENT_SECRET, MAREK_STATE_SECRET] },
  async (req, res) => {
    const { code, state, error: googleError } = req.query;

    if (googleError) {
      return res.redirect(`${MAREK_APP_LOGIN_URL}?error=${encodeURIComponent(String(googleError))}`);
    }

    if (!code || !state || !verifyState(String(state), MAREK_STATE_SECRET.value())) {
      return res.redirect(`${MAREK_APP_LOGIN_URL}?error=invalid_state`);
    }

    try {
      const oauth2Client = new google.auth.OAuth2(
        MAREK_OAUTH_CLIENT_ID.value(),
        MAREK_OAUTH_CLIENT_SECRET.value(),
        MAREK_REDIRECT_URI
      );

      const { tokens } = await oauth2Client.getToken(String(code));
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
      const { data: profile } = await oauth2.userinfo.get();
      const email = profile.email;

      if (!email) {
        return res.redirect(`${MAREK_APP_LOGIN_URL}?error=no_email`);
      }

      // Ověření členství proti /members — appka to dělá i na klientovi,
      // tady navíc na serveru (defense in depth): negenerujeme platný
      // token nikomu mimo /members.
      const db = getDatabase();
      const membersSnap = await db.ref("/members").get();
      const members = membersSnap.val() || {};
      const isMember = Object.values(members).some((m) => m && m.email === email);

      if (!isMember) {
        return res.redirect(`${MAREK_APP_LOGIN_URL}?error=access_denied`);
      }

      // Najít existující Firebase Auth účet podle emailu (vznikl dřív při
      // přihlášení přes signInWithPopup) — KLÍČOVÉ pro zachování stejného
      // uid, a tedy historie chatů v /marek_chats/{uid}. Pokud účet ještě
      // neexistuje (nový člen), vytvoří se.
      let userRecord;
      try {
        userRecord = await getAuth().getUserByEmail(email);
      } catch (e) {
        if (e.code === "auth/user-not-found") {
          userRecord = await getAuth().createUser({
            email,
            displayName: profile.name || email,
            photoURL: profile.picture || undefined
          });
        } else {
          throw e;
        }
      }

      const customToken = await getAuth().createCustomToken(userRecord.uid);

      res.redirect(`${MAREK_APP_LOGIN_URL}?token=${encodeURIComponent(customToken)}`);
    } catch (e) {
      console.error("marekAuthCallback error:", e.message);
      res.redirect(`${MAREK_APP_LOGIN_URL}?error=server_error`);
    }
  }
);

 exports.listDriveFiles = onRequest(
  { cors: true, timeoutSeconds: 30, secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (req, res) => {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Nepřihlášen" });

    try {
      await getAuth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Neplatný token" });
    }

    const { folderId } = req.body;

    const db = getDatabase();

    // Zkontroluj cache
    const cacheRef = db.ref(`driveCache/${folderId || "root"}`);
    const cacheSnap = await cacheRef.get();
    if (cacheSnap.exists()) {
      const cache = cacheSnap.val();
      const age = Date.now() - cache.timestamp;
      if (age < 5 * 60 * 1000) { // 5 minut
        return res.json({ files: cache.data, fromCache: true });
      }
    }

    try {
      const { drive } = await getDriveClient();

      // Root složka = hlavní 10men složka na Drive
      const parentId = folderId || "0B23cZAlYDWOndmtIZU45WWJrbWM";

      const response = await drive.files.list({
        q: `'${parentId}' in parents and trashed=false`,
        fields: "files(id, name, mimeType, size, modifiedTime, thumbnailLink)",
        orderBy: "folder,name",
        pageSize: 200
      });

      const files = response.data.files.map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size || null,
        modifiedTime: f.modifiedTime,
        isFolder: f.mimeType === "application/vnd.google-apps.folder"
      }));

      // Ulož do cache
      await cacheRef.set({
        data: files,
        timestamp: Date.now()
      });

      return res.json({ files, fromCache: false });
    } catch(err) {
      console.error("Drive list chyba:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

exports.indexDrive = onRequest(
  { cors: true, timeoutSeconds: 300, secrets: [DRIVE_SERVICE_ACCOUNT] },
  async (req, res) => {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Nepřihlášen" });

    let user;
    try {
      user = await getAuth().verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Neplatný token" });
    }

    // Jen Owner/Admin smí spustit full scan
    const db = getDatabase();
    const membersSnap = await db.ref("/members").get();
    const members = membersSnap.val() || {};
    const member = Object.values(members).find(m => m.email === user.email);
    if (!member || !["ADMIN", "ART"].includes(member.role)) {
      return res.status(403).json({ error: "Nedostatečná oprávnění" });
    }

    try {
      const { drive } = await getDriveClient();

      const ROOT_FOLDER_ID = "0B23cZAlYDWOndmtIZU45WWJrbWM";
      let folderCount = 0;
      let fileCount = 0;
      const foldersToWrite = {};
      const filesToWrite = {};

      // Rekurzivní procházení složek
      async function scanFolder(folderId, parentId) {
        const response = await drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          fields: "files(id, name, mimeType, size, modifiedTime)",
          pageSize: 200
        });

        for (const file of response.data.files) {
          if (file.mimeType === "application/vnd.google-apps.folder") {
            foldersToWrite[file.id] = {
              name: file.name,
              parentId: parentId,
              modifiedTime: file.modifiedTime
            };
            folderCount++;
            await scanFolder(file.id, file.id);
          } else {
            filesToWrite[file.id] = {
              name: file.name,
              mimeType: file.mimeType,
              parentId: parentId,
              modifiedTime: file.modifiedTime,
              size: file.size || null,
              driveFileId: file.id
            };
            fileCount++;
          }
        }
      }

      // Zapiš root složku
      foldersToWrite[ROOT_FOLDER_ID] = {
        name: "10men",
        parentId: null,
        modifiedTime: null
      };

      await scanFolder(ROOT_FOLDER_ID, ROOT_FOLDER_ID);

      // Zapiš do RTDB
      await db.ref("/driveCache/folders").set(foldersToWrite);
      await db.ref("/driveCache/files").set(filesToWrite);

      return res.json({
        success: true,
        folders: folderCount,
        files: fileCount
      });
    } catch(err) {
      console.error("Index Drive chyba:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);



