# Sjednocení repertoáru a not – návrh nasazení (30. 10. 2026)

## 1. Stav: co už je v ostré databázi
Všechny změny proběhly přímo v RTDB (`base-39f52`), **aplikace ani funkce se nenasazují**. Před každým zápisem vznikla záloha dotčených záznamů (seznam níže).

| Oblast | Změna |
|---|---|
| Nové skladby | 26 nových záznamů v `/repertoar` (stav Neaktuální), čítače v `/citace` posunuté |
| Pravidlo kódů | `kategorie + hlas + pořadí` (TEN = 10men, LAM = LAMEN); čítač `/citace/{kategorie+hlas}` = poslední použité číslo |
| Hlavní PDF | opraveno u Hallelujah r53, Go the Distance r47, Baba Yetu r11 (SATB), Gloria in D r46, In the Still of the Nite r68, Jeanne d'Arc r73, Somebody r134, Scarborough Fair r124/r125, David a Goliáš, Hello Mary Lou r58, There Must Be a City r146 |
| Nové pole | `/repertoar/{id}/dalsiSoubory/{driveFileId} = {nazev, slozka, popis, pridano}` – 5 + 1 + 7 záznamů (viz `DALSI-SOUBORY-navrh.csv`) |
| Kódy | Battle of Jericho XTEN 004, Ave Generosa XTEN 005, Nechodívaj k nám synečku XTEN 006, Theme From New York, New York 2TEN 070 |
| Smazáno | Fields of gold (r39), Musica Orbis (r96) – soubory neexistují |
| Délka r124 | vymazáno (doplní se ručně) |
| Délky | doplněno 99 délek z Excelu (formát `0:02:30`), chybná data „Sat Dec 30 1899…“ odstraněna; r124 (1TEN 016) záměrně prázdné |
| Excel | `10men Repertoár - aktualizováno.xlsx`: doplněné kódy (9), přidáno 35 skladeb, sjednocený sloupec Noty s Drive, smazané Fields of gold a Musica Orbis, souhrn dole jako vzorce (přepočítá se při otevření). Původní `10men Repertoár.xlsx` beze změny |

## 2. Co nasazovat: nic
- **Pravidla RTDB** se nemění (`/repertoar` je zapisovatelný pro členy, nové pole prochází).
- **Cloud Functions** se nemění. Marek (`hledej_repertoar`) čte `/repertoar`; nové pole ignoruje.
- **10space** ukládá skladbu po jednotlivých polích (`10space-navrh/repertoar.js`, `updates[sid/pole]`), takže úprava skladby pole `dalsiSoubory` nesmaže. Nové pole se ale v UI zatím nezobrazuje.

## 3. Co dát do gitu
Do repa patří **skripty a tento popis**, ne zálohy s daty:
- `zapis-nove-skladby.js`, `zapis-dalsi-soubory.js` (idempotentní, mají kontroly a zálohu)
- `sjednoceni-noty.js`, `sjednoceni-noty-zapis.js` (starší audit a zápis)
- `rules-backup/NASAZENI-repertoar-navrh.md`, `NOVE-SKLADBY-navrh.csv`, `DALSI-SOUBORY-navrh.csv`
- `serviceAccount.json` a `sa.json` jsou v `.gitignore` – kontrola proběhla.

Zálohy `rules-backup/REPERTOAR-*.json` (2 MB, obsahují data repertoáru) ponechat jen lokálně, nebo je do gitu dát vědomě.

## 4. Návrat zpět
Zálohy v `rules-backup/` (záznam = JSON se stavem před úpravou):
`pred-sjednocenim` (celý /repertoar), `pred-novymi-skladbami` (/repertoar + /citace), `pred-hallelujah`, `pred-scarborough`, `pred-david`, `pred-dalsimi-soubory`, `pred-gloria`, `pred-still-jeanne`, `pred-kody`, `smazano-fields-musica`, `pred-xten-somebody`, `pred-prepnutim`.
Obnova jednoho záznamu: načíst JSON a `db.ref("/repertoar/<id>").set(<záznam>)`; čítače z `pred-novymi-skladbami`.

## 5. Kontrola po nasazení (ručně, 5 minut)
1. 10space → Repertoár: počet skladeb 199; ve filtru Neaktuální jsou nové skladby.
2. Otevřít PDF u: Hello Mary Lou, There Must Be a City, Gloria in D, Go the Distance, Baba Yetu SATB.
3. Pole `dalsiSoubory` zkontrolovat v konzoli Firebase (`/repertoar/r47/dalsiSoubory`).
4. Marek: dotaz „Najdi Hallelujah v repertoáru“ – obě verze se správnými kódy.

## 6. Otevřené body
- **Nearer My God to Thee (r100, 3TEN 040)** a **Wade in the Water (r155, 3TEN 035)**: soubor „…_poznámky.pdf“ z CSV v Drive neexistuje; chybí nahrát.
- **Bridge Over Troubled Water (r19)**: ve „_Aktuálně zpíváme“ je jen zástupce, hlavní zůstává soubor ze složky skladby.
- **Zbývá porovnat** odkazy CSV vs. databáze u několika dalších skladeb.
- **Zobrazení `dalsiSoubory` v 10space** – navrženo řešit při zavedení verzování souborů.
