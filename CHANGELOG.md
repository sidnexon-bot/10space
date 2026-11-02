# 10space: přehled změn

Verze se označují MAJOR.MINOR.PATCH. Číslo je v `version.js`, vydání se označí tagem `vX.Y.Z`.
Postup vydání: zvýšit číslo a datum ve `version.js`, doplnit tento soubor, nasadit, `git tag -a vX.Y.Z -m "…"` a `git push --tags`.

## 3.11.0 (2. 11. 2026)
- Okna na mobilu mají pravidla: potvrzení a krátký formulář s jedním polem jsou nahoře jako modální okno (nezakryje je klávesnice), menu, seznamy a formuláře s mnoha kolonkami jsou bottom sheet bez držátka, s křížkem a tlačítky dole. Sheet vyjíždí zespodu a zajíždí dolů, dialog sjíždí shora.
- Tažení okna dolů už nic nedělá (a v 10base nespouští obnovení stránky).
- Potvrzovací dialogy a dialogy s polem jsou i na telefonu nahoře (dřív potvrzení vyjíždělo od spodu).

## 3.10.0 (2. 11. 2026)
- Formuláře na mobilu jsou bottom sheet: okno se vysune zespodu, má držátko a zavře se tažením dolů (tablet a počítač beze změny).
- Kódy projektů: administrátor smaže chybný kód nebo položku (-002 a výš), na které se zatím neúčtovalo; použitý kód server nesmaže (jen uzavření). Smazané číslo se nepoužije znovu.
- Čtečka PDF: tlačítko „Vybrat text“ zapne výběr a kopírování textu ze stránky (u skenů bez textu se zobrazí upozornění).

## 3.6.0 (2. 11. 2026)
- Počítač a tablet po vzoru telefonu: tlačítka a (na Applu) kolonky formulářů mají přesně 38 px a tvar kapsle, přepínače a filtry 30 px; zaoblení karet a oken se nemění.
- Apple: všechna akční tlačítka jsou kapsle na každé velikosti, položky bočního panelu mají jednotné zaoblení.
- Android tablet: spodní lišta je schovaná, ovládá se jen bočním panelem (stejně jako na iPadu); pole formulářů mají každé vlastní kapsli.
- Sbalený boční panel nemá logo, začíná profilovým obrázkem.
- Tablet: karty (faktury, náhrady, projekty, přehled) se řadí vedle sebe, kde se vejdou; v 10korun je Účetnictví o řádek kratší a při sbaleném panelu jsou karty Pokladna a Bankovní účet vedle sebe.

## 3.5.0 (1. 11. 2026)
- Apple: spodní lišta se při posunu stránky dolů zmenší a schová popisky, při posunu nahoru se vrátí; vybranou záložku (kapku skla) jde chytit a přetáhnout prstem na jinou záložku.

## 3.4.0 (1. 11. 2026)
- Tlačítka ve dvojicích na mobilu: výchozí je půl na půl, ale když by se delší text zalomil, kratší tlačítko se zúží na šířku svého textu. Platí i pro dialogy sestavené za běhu.

## 3.3.1 (1. 11. 2026)
- Nabídka „Jak chcete dokument otevřít?“: řádky jsou na Androidu i iOS jednotné pilulky s ikonou vlevo a zarovnaným textem (dřív se na Androidu zobrazovaly jako červená tlačítka).

## 3.3.0 (1. 11. 2026)
- Animace: po přepnutí sekce se karty zobrazují postupně od nejvyšší dolů, karty níže naskočí při scrollování; rozbalovací nabídky se rozbalují jako roleta shora.

## 3.2.1 (1. 11. 2026)
- Přepínače (Akce / Kódy, záložky detailu souboru) jsou menší než tlačítka: 30 px.

## 3.2.0 (1. 11. 2026)
- Oprava: tabulka kódů v Projektech → Kódy se po úpravě tlačítek rozhodila; pravidlo pro samostatná tlačítka nově přeskakuje řádky tabulek a seznamů.

## 3.1.10 (1. 11. 2026)
- Apple: přepínače (Akce / Kódy, záložky detailu souboru) jsou zaoblené do pilulek.

## 3.1.9 (1. 11. 2026)
- Apple (iOS 26): větší zaoblení oken a karet, pilulková tlačítka, zavírání ikonou ✕ / ✓ místo textu Zavřít / Hotovo, nadpisy sekcí ve větném tvaru, zaoblená pole, systémové písmo SF Pro.
- Tlačítka na mobilu mají jednotnou výšku 38 px; samostatné tlačítko je přes celou šířku.

## 3.1.8 (1. 11. 2026)
- Tlačítka na mobilu: jednotná mřížka (1 = celá šířka, 2 = vedle sebe, 3 = hlavní nahoře a pod ním dvě, 4 = dvě a dvě, 5 = hlavní nahoře a pod ním dvě a dvě).
- Android: hlavní tlačítko je plná pilulka, ostatní jsou textová tlačítka (jako u Google).
- Spodní lišta oken má barvu okna i v tmavém režimu; Stáhnout PDF: popisek „Bez anotací“.

## 3.1.7 (1. 11. 2026)
- Záložky Podrobnosti / Verze / Náhled mají stejný segmentovaný přepínač jako Akce / Kódy (na počítači, Androidu i iPhonu).
- Dialog s polem: když je v něm rozepsaný text, první Esc jen upozorní a teprve druhý okno zavře.

## 3.1.6 (1. 11. 2026)
- Apple: profilové menu ve stylu Liquid Glass (jako spodní lišta); Android beze změny.
- 10space: přepínač Akce / Kódy má stejný vzhled jako přepínač Pokladna / Bankovní účet v 10korun (na všech platformách).

## 3.1.5 (1. 11. 2026)
Designový audit všech obrazovek (iPhone, Android, tablet, počítač).
- Počítač: ikonová tlačítka (křížek v detailu projektu) se po zhuštění už nesmršťují.
- Mobilní nabídky: místo tlustých šedých pruhů jemné oddělovací čáry.
- Android: detail projektu s bílým pozadím a šedými kartami; správná ikona u čísla faktury.
- 10base: tmavé textové pole poznámky, menší popisky ve formuláři na telefonu, větší šipky měsíců.
- Dotyková zařízení: větší klikací plochy (zavírací křížek, tři tečky, drobná tlačítka).

## 3.1.3 (1. 11. 2026)
Kompaktní prostředí na počítači (myš, okno od 768 px; telefony a tablety se nemění).
- Menší písmo a pole (výška 32 px), užší okna a formuláře ve dvou až třech sloupcích, hustší tabulky a karty.
- Karty vedle sebe tam, kde se vejde víc: Přehled a Projekty v 10space, faktury a náhrady v 10korun; Přehled v 10base bez mezer pod nižšími kartami.

## 3.1.2 (1. 11. 2026)
- Android: spodní lišta je nižší, ikony a popisky jsou menší a aktivní záložka má barvu aplikace.

## 3.1.1 (1. 11. 2026)
Vzhled Androidu podle Material Design 3 (Apple se nemění) a nové formuláře.
- Spodní lišta na Androidu jde od kraje ke kraji a navazuje na spodní hranu; odsazení pro systémová tlačítka a gesta řeší aplikace sama.
- Prostředí jako od Googlu: písmo Roboto / Google Sans, ploché plochy bez stínů a rámečků, bílé pozadí a světle šedé karty, zaoblení karet 28 px, tlačítka a pole jako pilulky, nové dialogy.
- Formuláře v oknech: popisek je zástupný text přímo v poli s ikonou, pole za sebou tvoří jeden souvislý blok, výběry a soubory jsou samostatné pilulky; čára se objeví až po ťuknutí do pole.
- Okna s formulářem se klikem mimo nezavírají (rozepsaná práce se neztratí), jen se zatřesou.

## 3.0.1 (30. 10. 2026)
Číslování verzí bylo sjednoceno na 3.0.1 (dřívější záznamy 1.0.0 a 1.1.0 níže jsou jeho historií).

Verze dokumentů.
- Karta Verze v podrobnostech souboru: historie úprav (datum, autor, velikost), Otevřít, Stáhnout, Obnovit starší verzi jako aktuální, Nahrát novou verzi.
- Každá verze se na Disku uchová trvale (keepForever), takže ji Disk po čase nesmaže.
- Poznámky (osobní i veřejné) se vážou ke konkrétní verzi souboru; poznámky starší verze se nepřilepí na novou.
- Administrátor jednorázově převede dosavadní poznámky pod aktuální verzi souborů (Nastavení, Správa).

## Dřívější vydání: 1.0.0 (30. 10. 2026)
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
