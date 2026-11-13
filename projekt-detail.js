/* 10space – detail projektu jako technický rider: jedna tabulka po sekcích (informace a garant, plán dne akce, podrobný program,
   složky, příjmy a výdaje, interní kód). Data se berou z /projekty a /akce (rider, harmonogram), příjmy a výdaje ze serveru
   (projektFinanceApi: člen vidí součty, administrátor a hospodář i řádky). Co ve formuláři akce v 10base chybí, se označí.
   Volá ho index.html z window.otevritProjekt; vypnutí: odebrat <script src="projekt-detail.js"> a <link href="projekt-detail.css">. */
(function () {
  "use strict";
  var API = "https://us-central1-base-39f52.cloudfunctions.net/projektFinanceApi";
  var BASE_URL = "https://app.10men.cz/";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var FOLDER = '<svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368" aria-hidden="true"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>';
  var CHEV = '<svg class="pd-chev" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>';
  var fileIcon = function (mime) {
    mime = String(mime || "").toLowerCase();
    var c = mime.indexOf("pdf") > -1 ? "#ea4335" : mime.indexOf("audio") === 0 ? "#8e44ad" : mime.indexOf("image") === 0 ? "#1e8e3e" : mime.indexOf("video") === 0 ? "#e8710a" :
      mime.indexOf("sheet") > -1 || mime.indexOf("excel") > -1 ? "#188038" : mime.indexOf("presentation") > -1 || mime.indexOf("powerpoint") > -1 ? "#e37400" :
      mime.indexOf("word") > -1 || mime.indexOf("document") > -1 || mime.indexOf("msword") > -1 ? "#1a73e8" : "#5f6368";
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="' + c + '" aria-hidden="true"><path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6" fill="#fff" opacity=".45"/></svg>';
  };
  var kc = function (n) { return (n < 0 ? "−" : "") + Math.abs(n).toLocaleString("cs-CZ", { maximumFractionDigits: 2 }) + " Kč"; };
  var isAdmin = function (u) { return !!u && (u.role === "ADMIN" || u.role === "Owner"); };
  var plural = function (n, one, few, many) { return n === 1 ? one : n >= 2 && n <= 4 ? few : many; };
  var parse = function (s) { if (!s) return null; try { return typeof s === "string" ? JSON.parse(s) : s; } catch (e) { return null; } };

  var sec = function (title, right) { return '<div class="pd-sec"><span>' + esc(title) + "</span><span>" + (right || "") + "</span></div>"; };
  var row = function (k, v) { return '<tr><td>' + esc(k) + '</td><td colspan="3">' + v + "</td></tr>"; };
  var gap = function (text, link) { return '<span class="pd-gap">' + esc(text) + '<a href="' + BASE_URL + '" target="_blank" rel="noopener">' + esc(link || "Doplnit v 10base") + " →</a></span>"; };

  // plán dne akce: harmonogram, přípravné akce a ukončení z rideru, podle času
  function planFrom(harm, pripravne, ukonceni) {
    var out = [];
    (harm || []).forEach(function (i) { if (i && (i.popis || i.cas)) out.push({ cas: i.cas || "", co: i.popis || "", pozn: "" }); });
    (pripravne || []).forEach(function (i) { out.push({ cas: i.cas || "", co: i.nazev || "", pozn: i.poznamka || "" }); });
    (ukonceni || []).forEach(function (i) { out.push({ cas: i.cas || "", co: i.nazev || "", pozn: i.poznamka || "" }); });
    return out.filter(function (i) { return i.co; }).sort(function (a, b) { return (a.cas || "99:99").localeCompare(b.cas || "99:99"); });
  }
  function dayPlan(akce, rider) { return planFrom(parse(akce && akce.harmonogram_items), rider && rider.pripravne_akce, rider && rider.ukonceni); }

  function programStats(rider) {
    var h = (rider && rider.harmonogram_koncertu) || [], min = 0, songs = 0;
    h.forEach(function (r) { min += parseFloat(r.stopaz_min) || 0; if (Array.isArray(r.skladby)) songs += r.skladby.length; });
    return { rows: h, min: min, songs: songs };
  }

  function programTable(rows, members) {
    var name = function (id) { var m = Object.values(members).find(function (x) { return x.id === id || x.uid === id; }); return (m && (m.name || m.email)) || id || "—"; };
    var body = rows.map(function (r) {
      var stop = r.stopaz_min ? esc(r.stopaz_min) + " min" : "—";
      if (r.typ === "blok" && r.skladby && r.skladby.length) {
        return r.skladby.map(function (s, i) {
          return "<tr>" + (i === 0 ? '<td class="pd-b" rowspan="' + r.skladby.length + '" style="vertical-align:middle">' + esc(r.nazev || "Blok") + "</td>" : "") +
            "<td>" + esc(s.name || "—") + "</td>" +
            (i === 0 ? '<td rowspan="' + r.skladby.length + '" style="vertical-align:middle">' + stop + '</td><td rowspan="' + r.skladby.length + '" style="vertical-align:middle">' + esc(r.poznamka || "—") + "</td>" : "") + "</tr>";
        }).join("");
      }
      return '<tr><td class="pd-b">' + esc(r.nazev || "—") + "</td><td>" + esc(r.moderatorJmeno || (r.moderator ? name(r.moderator) : "")) + "</td><td>" + stop + "</td><td>" + esc(r.poznamka || "—") + "</td></tr>";
    }).join("");
    return '<div class="pd-rider-wrap"><table class="pd-rt"><thead><tr><th>Název</th><th>Skladba / Detail</th><th>Stopáž</th><th>Poznámka</th></tr></thead><tbody>' + body + "</tbody></table></div>";
  }

  // obsah složky z místní kopie stromu Disku (window.driveFolders / driveFiles): nejdřív složky, pak soubory, podle abecedy
  function kids(id) {
    var cs = function (a, b) { return String(a.name || "").localeCompare(String(b.name || ""), "cs"); };
    var dirs = Object.entries(window.driveFolders || {}).filter(function (e) { return e[1].parentId === id; }).map(function (e) { return { id: e[0], name: e[1].name, dir: true }; }).sort(cs);
    var files = Object.entries(window.driveFiles || {}).filter(function (e) { return e[1].parentId === id; }).map(function (e) { return { id: e[0], name: e[1].name, mime: e[1].mimeType, size: Number(e[1].size) || 0, mod: e[1].modifiedTime }; }).sort(cs);
    return dirs.concat(files);
  }
  var bytes = function (n) { return !n ? "" : n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + " kB" : (n / 1048576).toLocaleString("cs-CZ", { maximumFractionDigits: 1 }) + " MB"; };
  var day = function (iso) { var d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }) : ""; };
  var KEY = ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click()}"';
  function itemRow(it, depth, anc) {
    var pad = ' style="padding-left:' + depth * 20 + 'px"', a = ' data-id="' + esc(it.id) + '" data-depth="' + depth + '" data-anc="' + esc(anc) + '"';
    if (it.dir) {
      var n = kids(it.id).length;
      return '<tr class="pd-row pd-dir" tabindex="0" role="button" aria-expanded="false"' + a + ' onclick="tenProjekt.toggle(this)"' + KEY + '><td><span class="pd-fi"' + pad + ">" + CHEV + FOLDER + '<span class="pd-nm">' + esc(it.name) + '</span></span></td><td class="pd-t pd-n">' +
        (n ? n + " " + plural(n, "položka", "položky", "položek") : "prázdná") + "</td></tr>";
    }
    var when = day(it.mod);
    return '<tr class="pd-row" tabindex="0" role="button"' + a + ' data-mime="' + esc(it.mime || "") + '" onclick="tenProjekt.openFile(this)"' + KEY + '><td><span class="pd-fi"' + pad + '><span style="width:14px;flex:none"></span>' + fileIcon(it.mime) +
      '<span class="pd-nm">' + esc(it.name) + '</span></span></td><td class="pd-t pd-n">' + (when ? '<span class="pd-when">' + esc(when) + (it.size ? " · " : "") + "</span>" : "") + esc(bytes(it.size)) + "</td></tr>";
  }
  // rozbalení a sbalení složky přímo v tabulce (i vnořených složek)
  function toggle(tr) {
    var id = tr.getAttribute("data-id"), tb = tr.parentNode;
    if (tr.getAttribute("aria-expanded") === "true") {
      Array.prototype.slice.call(tb.querySelectorAll("tr[data-anc]")).forEach(function (r) { if (r.getAttribute("data-anc").indexOf("," + id + ",") > -1) r.remove(); });
      tr.setAttribute("aria-expanded", "false"); return;
    }
    var depth = Number(tr.getAttribute("data-depth")) + 1, anc = tr.getAttribute("data-anc") + id + ",", items = kids(id), loaded = !!(window.driveFolders && window.driveFiles);
    var msg = !loaded ? "Obsah složek se zatím nenačetl, zkuste to za chvíli" : "Složka je prázdná";
    tr.insertAdjacentHTML("afterend", items.length ? items.map(function (it) { return itemRow(it, depth, anc); }).join("") : '<tr class="pd-empty" data-anc="' + esc(anc) + '"><td colspan="2"><span style="padding-left:' + (depth * 20 + 23) + 'px">' + msg + "</span></td></tr>");
    tr.setAttribute("aria-expanded", "true");
  }
  function openFile(tr) { if (window.handleDriveNameClick) window.handleDriveNameClick(tr.getAttribute("data-id"), tr.getAttribute("data-mime"), false); }
  var folderRow = function (id, nazev) { return itemRow({ id: id, name: nazev, dir: true }, 0, ","); };

  // celý obsah detailu; o.user = přihlášený člen (role), o.members = /members
  function html(o) {
    var projekt = o.projekt || {}, akce = o.akce || {}, members = o.members || {}, admin = isAdmin(o.user);
    var rider = parse(akce.rider) || {};
    var garant = rider.garant ? Object.values(members).find(function (m) { return m.id === rider.garant || m.uid === rider.garant; }) : null;
    var datum = projekt.datum ? new Date(projekt.datum).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" }) : "";
    var cas = akce.start ? ", " + String(akce.start).slice(0, 5) : "";
    var misto = akce.place || projekt.misto || "";
    var plan = dayPlan(akce, rider), prog = programStats(rider);
    var missing = [];
    if (!misto) missing.push("místo");
    if (!akce.sraz) missing.push("sraz");
    if (!akce.doprava) missing.push("doprava");
    if (!garant) missing.push("garant");
    if (!plan.length) missing.push("harmonogram dne");
    if (!prog.rows.length) missing.push("program");

    var info = row("Datum", datum ? esc(datum + cas) : gap("nevyplněno"));
    info += row("Místo", misto ? esc(misto) : gap("nevyplněno"));
    info += row("Sraz", akce.sraz ? esc(akce.sraz) : gap("nevyplněno"));
    info += row("Doprava", akce.doprava ? esc(akce.doprava) : gap("nevyplněno"));
    if (akce.is_spoluprace) info += row("Skupiny", esc("10men" + (akce.spoluprace_nazev ? ", " + akce.spoluprace_nazev : "")));
    if (prog.rows.length) info += row("Program", esc((prog.min ? Math.round(prog.min) + " min" : "") + (prog.min && prog.songs ? ", " : "") + (prog.songs ? prog.songs + " " + plural(prog.songs, "skladba", "skladby", "skladeb") : "") || "—"));
    if (garant) {
      info += row("Garant", esc(garant.name || garant.email || ""));
      if (garant.email) info += row("E-mail", '<a class="pd-link" href="mailto:' + esc(garant.email) + '">' + esc(garant.email) + "</a>");
      if (garant.phone) info += row("Telefon", '<a class="pd-link" href="tel:' + esc(String(garant.phone).replace(/\s+/g, "")) + '">' + esc(garant.phone) + "</a>");
    } else info += row("Garant", gap("není určen", "Určit v 10base"));
    if (akce.note) info += row("Poznámka", '<span style="white-space:pre-wrap">' + esc(akce.note) + "</span>");

    var out = '<div class="pd-sheet">';
    if (missing.length) out += '<div class="pd-miss"><b>Chybí ' + missing.length + " " + plural(missing.length, "údaj", "údaje", "údajů") + ":</b> " + esc(missing.join(", ")) + ". Doplňují se ve formuláři akce v 10base.</div>";
    out += sec("Informace") + "<table>" + info + "</table>";

    // popis od Marka (jako dřív: administrátor ho upraví a přegeneruje)
    var wikiAdmin = o.user && o.user.role === "ADMIN";
    out += sec("Popis (AI)") + '<div class="pd-wiki projekt-wiki-text" id="wiki-text" contenteditable="' + (wikiAdmin ? "true" : "false") + '">' + esc(projekt.wikiText || "Zatím žádný popis.") + "</div>";
    if (wikiAdmin) out += '<div class="projekt-wiki-actions"><button class="projekt-wiki-btn" onclick="ulozitWiki(\'' + esc(o.projektId) + '\')">Uložit</button> <button class="projekt-wiki-btn ai" onclick="regenerovatWiki(\'' + esc(o.projektId) + '\')">Přegenerovat Markem</button></div>';

    out += sec("Plán akce") + "<table>" + (plan.length ? plan.map(function (p) {
      return '<tr><td class="pd-t">' + esc(p.cas || "—") + '</td><td colspan="2"><b>' + esc(p.co) + "</b>" + (p.pozn ? ' <span class="pd-m">' + esc(p.pozn) + "</span>" : "") + "</td></tr>";
    }).join("") : '<tr><td class="pd-t">—</td><td colspan="2">' + gap("harmonogram dne není vyplněn") + "</td></tr>") + "</table>";

    out += sec("Podrobný program", prog.min ? esc(Math.round(prog.min) + " min") : "") + (prog.rows.length ? programTable(prog.rows, members) : "<table><tr><td>" + gap("program není vyplněn") + "</td></tr></table>");

    var folders = "";
    if (projekt.drivePodkladyId) folders += folderRow(projekt.drivePodkladyId, "Podklady");
    if (projekt.driveSmlouvyId && admin) folders += folderRow(projekt.driveSmlouvyId, "Smlouvy a faktury");
    if (projekt.driveFotkyId) folders += folderRow(projekt.driveFotkyId, "Fotky a nahrávky");
    out += sec("Složky projektu") + (folders ? '<table class="pd-files">' + folders + "</table>" : '<div class="pd-hint">Projekt zatím nemá složky.</div>');
    out += '<div id="pd-finance"></div>';
    out += sec("Interní") + "<table>" + row("Interní kód", '<span class="kd-row" data-kod-row="' + esc(o.projektId) + '"></span>') + "</table>";
    return out + "</div>";
  }

  // sdílený pohled pro spolupracující skupiny (share.html): bez financí, interního kódu, popisu od Marka a smluv; prázdné údaje se neukazují
  function htmlShared(d) {
    var datum = d.datum ? new Date(d.datum).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric", year: "numeric" }) : "";
    var info = "";
    if (datum) info += row("Datum", esc(datum));
    if (d.misto) info += row("Místo", esc(d.misto));
    if (d.sraz) info += row("Sraz", esc(d.sraz));
    if (d.doprava) info += row("Doprava", esc(d.doprava));
    if (d.garant) {
      info += row("Garant", esc(d.garant));
      if (d.garantEmail) info += row("E-mail", '<a class="pd-link" href="mailto:' + esc(d.garantEmail) + '">' + esc(d.garantEmail) + "</a>");
      if (d.garantTelefon) info += row("Telefon", '<a class="pd-link" href="tel:' + esc(String(d.garantTelefon).replace(/\s+/g, "")) + '">' + esc(d.garantTelefon) + "</a>");
    }
    var plan = planFrom(d.timeline, d.pripravneAkce, d.ukonceni), prog = programStats({ harmonogram_koncertu: d.harmonogramKoncertu });
    var out = '<div class="pd-sheet">';
    if (info) out += sec("Informace") + "<table>" + info + "</table>";
    if (plan.length) out += sec("Plán akce") + "<table>" + plan.map(function (p) {
      return '<tr><td class="pd-t">' + esc(p.cas || "—") + '</td><td colspan="2"><b>' + esc(p.co) + "</b>" + (p.pozn ? ' <span class="pd-m">' + esc(p.pozn) + "</span>" : "") + "</td></tr>";
    }).join("") + "</table>";
    if (prog.rows.length) out += sec("Podrobný program", prog.min ? esc(Math.round(prog.min) + " min") : "") + programTable(prog.rows, {});
    if (d.hasPodklady) out += sec("Složky projektu") + '<table class="pd-files"><tr class="pd-row pd-dir" tabindex="0" role="link" onclick="openProjektPodklady()"' + KEY + '><td><span class="pd-fi">' + FOLDER + '<span class="pd-nm">Podklady</span></span></td><td class="pd-n"><svg class="pd-chev" style="transform:none" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg></td></tr></table>';
    return out + "</div>";
  }

  // příjmy a výdaje: součty vidí člen, řádky administrátor a hospodář (rozhodne server)
  async function loadFinance(projektId) {
    var box = document.getElementById("pd-finance"), c = window.__tenCtx;
    if (!box || !c || !c.auth.currentUser || navigator.onLine === false) return;
    try {
      var tok = await c.auth.currentUser.getIdToken();
      var r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify({ akceId: projektId }) });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok || !d.cislo || !document.getElementById("pd-finance")) return;
      var s = d.souhrn, rows = "";
      if (d.radky && d.polozky && d.polozky.length) rows = "<tr><th>Položka</th><th>Popis</th><th class=\"pd-n\">Částka</th></tr>" + d.polozky.map(function (p) {
        return "<tr><td>" + esc(p.kod) + '</td><td class="pd-grow">' + esc(p.popis || p.protistrana) + '</td><td class="pd-n ' + (p.castka < 0 ? "pd-out" : "pd-in") + '">' + (p.castka > 0 ? "+" : "") + kc(p.castka) + "</td></tr>";
      }).join("");
      rows += '<tr class="pd-sum"><td>Příjmy</td><td></td><td class="pd-n pd-in">' + kc(s.prijmy) + '</td></tr><tr class="pd-sum"><td>Výdaje</td><td></td><td class="pd-n pd-out">' + kc(s.vydaje) + '</td></tr><tr class="pd-sum"><td>Bilance</td><td class="pd-m">' + (d.radky ? "" : "řádky vidí admin a hospodář") + '</td><td class="pd-n">' + (s.bilance > 0 ? "+" : "") + kc(s.bilance) + "</td></tr>";
      var o = d.otevrene || {};
      if (o.pocet) rows += '<tr><td>Otevřené</td><td class="pd-m" colspan="2">' + esc(o.pocet + " " + plural(o.pocet, "neuhrazený doklad", "neuhrazené doklady", "neuhrazených dokladů") + ": závazky " + kc(o.zavazky) + (o.pohledavky ? ", pohledávky " + kc(o.pohledavky) : "")) + "</td></tr>";
      box.innerHTML = sec("Příjmy a výdaje", '<span style="font-family:ui-monospace,Menlo,monospace">' + esc(d.cislo) + "</span>") + "<table>" + rows + "</table>";
    } catch (e) { /* bez připojení nebo chyba serveru: sekce se nezobrazí, zbytek detailu funguje */ }
  }

  window.tenProjekt = { html: html, htmlShared: htmlShared, toggle: toggle, openFile: openFile, loadFinance: loadFinance, _dayPlan: dayPlan, _programStats: programStats };
})();
