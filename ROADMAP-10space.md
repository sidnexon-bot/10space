# TenOrbit / 10space – roadmapa pro Claude Code (stav 27. 10. 2026)

Vlož tento soubor do repa (např. `docs/ROADMAP.md` nebo `CLAUDE.md`) a Claude Code z něj bude vycházet.
Vše označené „ověřit“ je odvozené z konverzace, ne potvrzené v kódu nebo logu.

## 0. Pracovní pravidla (z project instructions)
- Vanilla JS, single HTML, GitHub Pages, žádné frameworky ani build tooly.
- Preferovat cílené změny (find-and-replace / malé diffy), ne full rewrity.
- Testuje se na reálném iPhonu/Androidu v PWA. Komunikace česky, po commitu krátké potvrzení.
- Design: iOS styl, pozadí `#f2f2f7`, bílé karty, akcent `#EE220C`, systémové fonty, dark mode, SVG ikony (bez emoji v UI).
- Nikdy nevypisovat ani necommitovat `private_key`, `apiKey`, `serviceAccount.json`, `sa.json`, zálohy dat. Žádné `git add .` (v repu je rozpracovaná práce).

## 1. Architektura (stručně)
- Firebase `base-39f52` (Blaze): RTDB, Cloud Functions (us-central1; `onAkceCreated` europe-west1), Auth (Google), Firestore named db `korun` (10korun, `orgs/10men`).
- Drive: root složka `0B23cZAlYDWOndmtIZU45WWJrbWM` (kořenové složky mají `parentId` = toto ID, ne `null`).
  - Service account `id-0base-drive@men-drive-502512…`: čtení, streaming, **nemá úložnou kvótu**.
  - OAuth refresh-token klient jako `info10men@gmail.com` (`getOAuthDriveClient()`): upload, delete, rename, move, createFolder.
  - Secrety: `DRIVE_SERVICE_ACCOUNT`, `DRIVE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`. Staré `DRIVE_CLIENT_*` deklarace jsou mrtvý kód.
- RTDB uzly: members, membersByUid, rolesByUid, akce, repertoar, projekty, driveCache, annotations, acl (nově podle uid), shareTokens, userActivity, driveWatch.
- Anotace: `/annotations/{driveFileId}/public/pages/{n}` (zelená, edituje jen ADMIN/ART) a `/annotations/{driveFileId}/{uid}/pages/{n}` (červená).
- Sdílení: `share.html` (veřejná, PIN), tokeny v `/shareTokens/{token}`, přístup nově přes Cloud Functions (`listShareTokens`, `manageShareToken`).
- Changes API webhook: `startDriveWatch`, `onDriveWebhook`, `renewDriveWatch` (24 h). Po redeployi může kanál tiše umřít → ručně znovu spustit `startDriveWatch`.
- PDF: nový `pdf-reader.js` (větev `pdf-reader`, ověřeno na tabletu; 3D listování, dvoustrana, osobní/veřejná vrstva, auto-ukládání se zálohou při výpadku sítě, export). Starý viewer zůstává jako záloha. PDF.js 3.11.174, Fabric 5.3.0 (gesta používají vnitřnosti – po upgradu zkontrolovat), pdf-lib 1.17.1.
- Limity: Cloud Function request 32 MB (base64 upload ≈ 24 MB max), `uploadFile` 1 GiB / 300 s.

## 2. Dokončený bezpečnostní blok (větev `security/rtdb-rules`)
- Zálohy pravidel a dat (`rules-backup/`).
- Nová RTDB pravidla: přístup jen pro členy; `gemini_config`, `shareTokens`, `acl` zavřené pro klienty; poznámky podle uid. Otestováno 175 kontrolami (Owner, člen, nečlen, nepřihlášený), nasazeno.
- Funkce zpřísněny (členství, role) + nové: `listShareTokens`, `manageShareToken`, `getMyAcl`, `getFileAcl`, `generateProjektWiki`, `chatMarek`. Frontend přepsán na jejich volání.
- Data migrována: `rolesByUid`, ACL na uid.
- Marek po zavření klíče opraven přes `chatMarek` (repo `10base-marek`).
- Firebase klíče `base-39f52`: tři staré zakázané, nový aktivní lokálně v `~/dataroom-10men/serviceAccount.json` (chmod 600). `sa.json` (`men-drive-502512`) v dostupné historii nenalezen.

## 3. P0 – bezpečnost (dodělat jako první)
1. **Rotace klíče OpenRouteru** (a Gemini klíče, pokud byl v `gemini_config`). Před nasazením pravidel ho četl každý přihlášený uživatel. Nové hodnoty jen do Secret Manageru; staré zrušit u poskytovatele.
2. **Smazat `migrate.json` z repa `portal10men`** (obsahuje data členů) a vyčistit z historie, pokud je repo veřejné.
3. **Smoke test po nasazení pravidel** napříč moduly: 10base (program, docházka, rider, platby), Marek, 10space (Drive, anotace, ACL, upload), sdílení přes PIN bez přihlášení, PWA na iPhonu. Hledat „Permission denied“.
4. **Commitnout zbylou změnu v `functions/index.js`**, aby nasazený stav odpovídal repu.
5. **Udržování `rolesByUid` / `membersByUid`**: doplnit funkci `onValueWritten` na `/members/{id}`, která indexy synchronizuje sama (nový člen jinak nedostane přístup).
6. **Vyčistit `serviceAccount.json` z historie `sidnexon-bot/10space`**: vyčištěná historie je v mirror záloze `~/10space-security-backup.git` (301 commitů zpracováno, `serviceAccount.json` a `sa.json` tam nejsou). Zbývá push:
   - fine-grained PAT (Contents: R/W jen pro `10space`) nebo `gh auth login`,
   - `git push --force origin --all` a `--tags` (ne `--mirror`),
   - před pushem ověřit, že na GitHubu nepřibyl nový commit; pak repo znovu naklonovat a rozpracované soubory vrátit po jednom,
   - GitHub Support: vyčistit cached views a odpojit forky. Staré klíče jsou už zakázané, takže to není akutní.
7. Nepřepínat repo na Private, dokud není jasné, že účet má GitHub Pro (Pages na privátním repu vyžaduje placený plán, jinak web spadne).
8. `rules-backup/DATA-full-….json` obsahuje data členů: držet mimo repo (`.gitignore`), smazat, až nebude třeba.
9. Další nálezy auditu k prověření: autorizace ostatních Cloud Functions, Drive scopes, Storage rules (Storage se podle rozhodnutí nepoužívá – ověřit zamčená pravidla).

## 4. P1 – funkční backlog 10space
- **Ověřit veřejné anotace end-to-end**: Admin na „Veřejné“ → „Hotovo“ → Firebase `public/pages/N` obsahuje objekt → člen vidí po reloadu. Ověřit `fc._dirty` řádky a `pdfSyncLayerUI` / barevný rámeček (v novém `pdf-reader.js` pravděpodobně vyřešeno – potvrdit).
- **Stránkování v `indexDrive`** (limit 200 souborů na složku) – nutné, noty se budou hromadit.
- **Verzování dokumentů**: Drive revize s `keepForever`, UI v kartě „Verze“, `getFileStream` s `revisionId`, anotace vázané na `revisionId` (`/annotations/{fileId}/{revisionId}/{uid}/…`).
- **Hromadný import evidenčních čísel** z tabulky (jednorázový skript jako `import-repertoar.js`; čeká na CSV).
- **Správa skladeb v 10space** (skladatel, aranžér, textař, obsazení, stav, nová verze); čeká na formulář skladby z 10base. Odkazy z programu přes `driveFileId`.
- **Upload nad 24 MB**: přímý upload z prohlížeče na Drive přes resumable session URL vytvořenou funkcí.
- **Osobní desky**: auto-sync setlistu nejbližší akce při startu aplikace + offline IndexedDB; ruční „Přidat do osobních desek“ (seznam `driveFileId` na uživatele).
- **Dashboard**: to-do jako accordion, editovatelné bloky pro Admin/Art, zvoneček (`/notifications/{uid}`), karta posledních souborů v projektu.
- Rider „Hosté“ (čeká na blok `hoste` v 10base).
- `onValueUpdated` sync přejmenování/zrušení akce z 10base do Drive a `/projekty`.

## 5. P1 – 10base × 10space na společném originu
Směr: `app.10men.cz/space/`, aby odkazy z programu 10base otevíraly noty v 10space vieweru uvnitř nainstalované PWA a sdílely přihlášení.
- **Fáze 0 (čeká na výsledek):** testovací stránka `space-test/index.html` v repu `portal10men`, odkaz z 10base jako obyčejný `<a href="/space-test/">` bez `target=_blank`; na iPhonu v nainstalované PWA ověřit „Režim aplikace: ANO“ a že se neukáže lišta Safari (pozor na service-worker fallback 10base).
- **Fáze 1:** přesun 10space do `space/`; staré `space.10men.cz` nechat jako přesměrování se zachováním `?token=` a `#/…` (existující PIN odkazy musí fungovat); zkontrolovat Firebase authorized domains a manifest `scope`/`start_url`.
- **Fáze 2:** 10base program odkazuje na `/space/#/file/{driveFileId}`; tlačítko „← 10base“; hash routy `#/drive/{složka}`, `#/dashboard`, `#/osobni`; nahradit pevné čekání 1,5 s u `#/file/` čekáním na `driveFiles` s timeoutem.
- **Fáze 3 (volitelně):** jedna sloučená aplikace (bottom nav: 10base / 10space / Nastavení / ?).
- Při neúspěchu fáze 0: moduly zůstanou oddělené, přechod změkčit tokenovým handoffem jako u Marka.

## 6. P2 – kód a drobnosti
- Rozdělit `index.html` (CSS do souboru, pak JS moduly, jedna HTML shell; ne samostatné HTML stránky). Pozor na sdílené top-level `let`, `window.xxx` a inline `onclick`; verzovat URL souborů kvůli cache.
- Smazat mrtvé `DRIVE_CLIENT_*` deklarace; volitelně převést `onAkceCreated` na OAuth klienta.
- Volitelně: optimalizace `checkDriveAccess` (jeden dotaz na `/acl`), snížení `PDF_RENDER_SCALE` (2.5).
- Bugy: `copylinkdrive` nefunguje; breadcrumb při filtru (`driveFilterHistory`); dark mode `download-choice-modal`; po refreshi se neobnoví poslední složka/záložka; mazání složek s obsahem; upload celých složek; validace uploadu.
- Logo/favicon 10space; zobrazení obrázků a videí; scroll-on-body refactor (oddělený od viewer práce).

## 7. Ostatní moduly (podle backlogu)
- **10korun:** přepnutí `index.html` na `base-39f52` (db `korun`), pak modul výdajů (náhrada výdajů, palivo; účtenky do Storage), Excel exporty, zálohové faktury, uzávěrka, audit log.
- **10base:** viz `areas/10base.md` v project paměti.
- **Marek:** marketingový režim (zatím jen návrh).
- **10share:** plánovaný modul (ClamAV na Cloud Run, token-based upload), implementace nezačala.
- **Pořadí prerekvizit původního shellu** (shell opuštěn, 10base zůstává primární): Marek allowlist, záloha 10space repa, migrace 10korun, tablet bug 10base, ACL + evidenční čísla.

## 8. Doporučený postup v Claude Code
1. Sekce 3 bod 1–5 (klíče, `migrate.json`, smoke test, commit, `rolesByUid` trigger).
2. Push vyčištěné historie (bod 6), pak čerstvý klon.
3. Výsledek fáze 0 → rozhodnutí o společném originu.
4. Stránkování `indexDrive`, ověření veřejných anotací, pak verzování a správa skladeb.
