// deploy v17
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


