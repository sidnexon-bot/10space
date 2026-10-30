# 10space: přehled změn

Verze se označují MAJOR.MINOR.PATCH. Číslo je v `version.js`, vydání se označí tagem `vX.Y.Z`.
Postup vydání: zvýšit číslo a datum ve `version.js`, doplnit tento soubor, nasadit, `git tag -a vX.Y.Z -m "…"` a `git push --tags`.

## 1.0.0 (30. 10. 2026)
První označené vydání pro denní používání členy.
- Oprávnění na Disku: nevidí, může číst, může měnit; skryté složky se k členovi vůbec nedostanou, ani názvem.
- Přehled: nové karty (nedávno otevřeno, otevřené kódy), nastavitelné pořadí a výběr karet.
- Projekty: záložky Akce a Kódy, okno s kompletním kódem a položkami.
- Nastavení: vzhled (světlý, tmavý, podle systému), přizpůsobení Přehledu přetahováním, informace o verzi.
- Kontextová nabídka a sdílení jednotně na počítači i telefonu, sdílení ven s PIN ověřovaným na serveru.
- Osobní desky: repertoár s filtrem pod jedním tlačítkem, oblíbené, stažení do zařízení.
- Vzhled: animace oken a nabídek, boční panel jen s ikonami, posouvání celé stránky na telefonu, nová stránka sdílení.
- Bezpečnost: ochrana proti vkládání kódu z dat, kontrola integrity knihoven, omezení pokusů o PIN.
- Aplikace sama nabídne obnovení, když vyjde novější verze.
