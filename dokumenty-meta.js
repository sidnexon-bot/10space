/* 10space – údaje o dokladu v podrobnostech souboru ve složce 01_Účetnictví na Disku (jen administrátor a hospodář).
   Druh, protistrana, IČO, naše číslo a číslo dodavatele, kód projektu, částka, data. Doklad lze propojit s fakturou v 10korun:
   údaje se pak berou z ní (zdroj pravdy) a do faktury se zapíše odkaz na soubor. Server: dokumentMetaApi (dokumentyMeta.js).
   Volá ho index.html z podrobností souboru (tenDokMeta.mount); vypnutí: odebrat <script src="dokumenty-meta.js"> a <link href="dokumenty-meta.css">. */
(function () {
  "use strict";
  var API = "https://us-central1-base-39f52.cloudfunctions.net/dokumentMetaApi";
  var UCTO_ROOT = "15pq2bcetpZA_5Sj6OzzYPIG90tCGS2P5";   // Spolek & administrativa / Spolek / 01_Účetnictví
  var DRUHY = [["smlouva", "Smlouva"], ["faktura_vydana", "Faktura vydaná"], ["faktura_prijata", "Faktura přijatá"], ["jiny", "Jiný"]];
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var kc = function (n) { return typeof n === "number" ? n.toLocaleString("cs-CZ", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " Kč" : ""; };
  var dat = function (s) { var d = /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? new Date(s + "T00:00:00") : null; return d && !isNaN(d) ? d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }) : ""; };
  var druhName = function (k) { var d = DRUHY.filter(function (x) { return x[0] === k; })[0]; return d ? d[1] : ""; };

  // je soubor ve stromu 01_Účetnictví? (podle místní kopie stromu Disku; server to ověří znovu)
  function inUcto(fileId) {
    var f = (window.driveFiles || {})[fileId], id = f && f.parentId;
    for (var i = 0; id && i < 12; i++) { if (id === UCTO_ROOT) return true; var p = (window.driveFolders || {})[id]; id = p && p.parentId; }
    return false;
  }
  async function allowed() {
    var c = window.__tenCtx, u = c && c.auth.currentUser;
    if (!u) return false;
    if (c.user && (c.user.role === "ADMIN" || c.user.role === "Owner")) return true;
    try { return ((await u.getIdTokenResult()).claims || {}).korun === "treasurer"; } catch (e) { return false; }
  }
  async function call(body) {
    var tok = await window.__tenCtx.auth.currentUser.getIdToken();
    var r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify(body) });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
    return d;
  }

  var row = function (k, v) { return v ? '<div class="dm-row"><span class="dm-k">' + esc(k) + '</span><span class="dm-v">' + v + "</span></div>" : ""; };
  function view(m) {
    if (!m) return '<p class="dm-hint">Doklad zatím nemá žádné údaje.</p>';
    var badges = [];
    if (m.zdroj === "10korun") badges.push('<span class="dm-b dm-b-k">Údaje z 10korun</span>'); else badges.push('<span class="dm-b">Zadáno ručně</span>');
    if (m.stornovano) badges.push('<span class="dm-b dm-b-w">Stornováno</span>');
    if (m.zdroj === "10korun" && m.uhrazeno) badges.push('<span class="dm-b dm-b-ok">Uhrazeno</span>');
    var out = '<div class="dm-badges">' + badges.join("") + "</div>";
    if (m.chybi) out += '<p class="dm-hint dm-warn">Propojená faktura v 10korun už neexistuje. Propojení zrušte a údaje vyplňte ručně.</p>';
    out += row("Druh", esc(druhName(m.druh)) + (m.typDokladu && m.typDokladu !== druhName(m.druh) ? ' <span class="dm-m">(' + esc(m.typDokladu) + ")</span>" : ""));
    out += row("Protistrana", esc(m.protistrana || "") + (m.ico ? ' <span class="dm-m">IČO ' + esc(m.ico) + "</span>" : ""));
    out += row("Naše číslo", esc(m.cislo));
    out += row("Číslo dodavatele", esc(m.cisloDodavatele));
    out += row("Kód projektu", m.kod ? '<span class="dm-mono">' + esc(m.kod) + "</span>" : "");
    out += row("Částka", esc(kc(m.castka)));
    out += row("Vystaveno", esc(dat(m.datumVystaveni)));
    out += row("Splatnost", esc(dat(m.splatnost)));
    out += row("Popis faktury", esc(m.popis));
    out += row("Poznámka", esc(m.poznamka));
    return out;
  }

  var inp = function (id, label, v, extra) { return '<label class="dm-f"><span>' + label + '</span><input id="dm-' + id + '" value="' + esc(v || "") + '" ' + (extra || "") + "></label>"; };
  function form(m) {
    m = m || {};
    var sel = '<label class="dm-f"><span>Druh</span><select id="dm-druh">' + DRUHY.map(function (d) { return '<option value="' + d[0] + '"' + ((m.druh || "faktura_prijata") === d[0] ? " selected" : "") + ">" + d[1] + "</option>"; }).join("") + "</select></label>";
    return '<div class="dm-form">' + sel + inp("protistrana", "Protistrana", m.protistrana, 'maxlength="120"') + inp("ico", "IČO", m.ico, 'inputmode="numeric" maxlength="12"') +
      inp("cislo", "Naše číslo (FAV / FAP)", m.cislo, 'maxlength="40"') + inp("cisloDodavatele", "Číslo faktury dodavatele", m.cisloDodavatele, 'maxlength="60"') +
      inp("kod", "Kód projektu", m.kod, 'placeholder="E1234-001" maxlength="12"') + inp("castka", "Částka (Kč)", m.castka, 'inputmode="decimal"') +
      inp("datumVystaveni", "Datum vystavení", m.datumVystaveni, 'type="date"') + inp("splatnost", "Splatnost", m.splatnost, 'type="date"') +
      '<label class="dm-f dm-wide"><span>Poznámka</span><textarea id="dm-poznamka" rows="2" maxlength="500">' + esc(m.poznamka || "") + "</textarea></label></div>";
  }
  var readForm = function (box) {
    var v = function (id) { return box.querySelector("#dm-" + id).value; };
    return { druh: v("druh"), protistrana: v("protistrana"), ico: v("ico").replace(/\s+/g, ""), cislo: v("cislo"), cisloDodavatele: v("cisloDodavatele"), kod: v("kod"), castka: v("castka").replace(",", "."), datumVystaveni: v("datumVystaveni"), splatnost: v("splatnost"), poznamka: v("poznamka") };
  };

  function mount(fileId, host) {
    if (!host || window.driveFolders && window.driveFolders[fileId] || !inUcto(fileId)) return;
    var old = host.querySelector(".dm"); if (old) old.remove();
    var box = document.createElement("div"); box.className = "dm"; box.setAttribute("data-file", fileId);
    box.innerHTML = '<div class="detail-label">Doklad</div><div class="dm-body"><span class="dm-hint">Načítám…</span></div>';
    host.appendChild(box);
    var body = box.querySelector(".dm-body"), state = { meta: null }, stale = function () { return !box.isConnected || box.getAttribute("data-file") !== fileId; };
    var fail = function (e) { if (!stale()) body.innerHTML = '<p class="dm-hint dm-warn">' + esc(e.message || "Nepodařilo se načíst.") + "</p>"; };

    function show(msg) {
      var m = state.meta;
      body.innerHTML = view(m) + (msg ? '<p class="dm-hint dm-ok" role="status">' + esc(msg) + "</p>" : "") +
        '<div class="dm-actions"><button type="button" class="dm-btn" data-a="pick">Vybrat fakturu z 10korun</button><button type="button" class="dm-btn" data-a="edit">' + (m && m.zdroj !== "10korun" ? "Upravit" : m ? "Upravit poznámku" : "Vyplnit ručně") + "</button>" +
        (m ? '<button type="button" class="dm-btn dm-danger" data-a="clear">Smazat údaje</button>' : "") + "</div>";
    }
    function edit() {
      var m = state.meta, linked = m && m.zdroj === "10korun";
      body.innerHTML = (linked ? '<p class="dm-hint">Údaje se berou z faktury v 10korun, upravit jde jen poznámku. Pro ruční údaje nejdřív smažte údaje a vyplňte je znovu.</p><label class="dm-f dm-wide"><span>Poznámka</span><textarea id="dm-poznamka" rows="2" maxlength="500">' + esc(m.poznamka || "") + "</textarea></label>" : form(m)) +
        '<div class="dm-actions"><button type="button" class="dm-btn dm-primary" data-a="save">Uložit</button><button type="button" class="dm-btn" data-a="cancel">Zrušit</button><span class="dm-st" role="status"></span></div>';
    }
    async function pick() {
      body.innerHTML = '<label class="dm-f dm-wide"><span>Hledat fakturu (číslo, protistrana, kód, částka)</span><input id="dm-q" type="search" autocomplete="off"></label><div class="dm-list"><span class="dm-hint">Načítám faktury…</span></div><div class="dm-actions"><button type="button" class="dm-btn" data-a="cancel">Zrušit</button></div>';
      var list = body.querySelector(".dm-list"), q = body.querySelector("#dm-q"), all = null;
      var draw = function () {
        var t = q.value.trim().toLowerCase();
        var rows = (all || []).filter(function (f) { return !t || [f.cislo, f.cisloDodavatele, f.protistrana, f.kod, f.ico, f.castka, f.popis].join(" ").toLowerCase().indexOf(t) > -1; }).slice(0, 30);
        list.innerHTML = rows.length ? rows.map(function (f, i) {
          var taken = f.driveFileId && f.driveFileId !== fileId;
          return '<button type="button" class="dm-item" data-i="' + all.indexOf(f) + '"' + (taken ? " disabled" : "") + '><b>' + esc(f.cislo || "bez čísla") + "</b> " + esc(f.protistrana) + '<span class="dm-m"> · ' + esc(kc(f.castka)) + " · " + esc(dat(f.datumVystaveni)) + (f.kod ? " · " + esc(f.kod) : "") + (taken ? " · už má soubor" : "") + "</span></button>";
        }).join("") : '<span class="dm-hint">Nic nenalezeno.</span>';
      };
      q.oninput = draw;
      try { all = (await call({ action: "faktury", q: "" })).faktury || []; if (!stale()) draw(); } catch (e) { fail(e); return; }
      list.onclick = async function (ev) {
        var b = ev.target.closest(".dm-item"); if (!b || b.disabled) return;
        var f = all[Number(b.getAttribute("data-i"))];
        list.innerHTML = '<span class="dm-hint">Ukládám…</span>';
        try { var r = await call({ action: "save", fileId: fileId, data: { faktura: { period: f.period, id: f.id }, poznamka: state.meta && state.meta.poznamka || "" } }); if (stale()) return; state.meta = r.meta; show("Propojeno s fakturou " + (f.cislo || "") + "."); } catch (e) { fail(e); }
      };
    }
    body.onclick = async function (ev) {
      var a = ev.target.closest("[data-a]"); if (!a) return; var act = a.getAttribute("data-a");
      if (act === "edit") edit(); else if (act === "cancel") show(); else if (act === "pick") pick();
      else if (act === "save") {
        var st = body.querySelector(".dm-st"), m = state.meta, linked = m && m.zdroj === "10korun";
        st.textContent = "Ukládám…"; a.disabled = true;
        try {
          var data = linked ? { faktura: m.faktura, poznamka: body.querySelector("#dm-poznamka").value } : readForm(body);
          var r = await call({ action: "save", fileId: fileId, data: data }); if (stale()) return; state.meta = r.meta; show("Uloženo.");
        } catch (e) { st.textContent = e.message; st.classList.add("dm-err"); a.disabled = false; }
      } else if (act === "clear") {
        var ok = window.tenDialog ? await window.tenDialog.confirm("Smazat údaje o dokladu? Soubor ani faktura v 10korun se nemění.", { ok: "Smazat" }) : confirm("Smazat údaje o dokladu?");
        if (!ok) return;
        try { await call({ action: "clear", fileId: fileId }); if (stale()) return; state.meta = null; show("Údaje smazány."); } catch (e) { fail(e); }
      }
    };
    allowed().then(function (ok) {
      if (stale()) return;
      if (!ok) { box.remove(); return; }
      return call({ action: "get", fileId: fileId }).then(function (r) { if (stale()) return; if (!r.eligible) { box.remove(); return; } state.meta = r.meta; show(); });
    }).catch(fail);
  }

  window.tenDokMeta = { mount: mount, _view: view, _inUcto: inUcto };
})();
