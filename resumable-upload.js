/* Nahrávání velkých souborů po částech přímo na Google Disk (resumable upload).
   Server (startResumableUpload) jen ověří právo a založí relaci; tady se soubor posílá po 8 MB částech.
   Při výpadku spojení nebo chybě serveru se zeptá Disku, kolik už dorazilo, a pokračuje odtud; po 6 neúspěšných
   pokusech za sebou skončí chybou. Vstupy jsou předávané, takže modul jde vyzkoušet bez prohlížeče. */
export async function resumableUpload({ file, session, onProgress, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxRetries = 6 }) {
  const { uploadUrl, chunk } = session, total = file.size;
  const step = Math.max(256 * 1024, Math.floor((chunk || 8 * 1024 * 1024) / (256 * 1024)) * (256 * 1024)); // násobek 256 KiB, jak Disk vyžaduje
  let offset = 0, fails = 0;
  const parse = (r) => r.json().catch(() => ({}));
  const accepted = (r) => { const m = /bytes=0-(\d+)/.exec(r.headers.get("Range") || ""); return m ? Number(m[1]) + 1 : null; };

  // zeptá se Disku, kolik bajtů má; null = relaci nejde obnovit
  async function status() {
    const r = await fetchImpl(uploadUrl, { method: "PUT", headers: { "Content-Range": `bytes */${total}` } });
    if (r.status === 200 || r.status === 201) return { done: await parse(r) };
    if (r.status === 308) return { offset: accepted(r) ?? 0 };
    throw new Error("HTTP " + r.status);
  }

  while (true) {
    const end = Math.min(offset + step, total);
    try {
      const r = await fetchImpl(uploadUrl, { method: "PUT", headers: { "Content-Range": total ? `bytes ${offset}-${end - 1}/${total}` : "bytes */0" }, body: file.slice(offset, end) });
      if (r.status === 200 || r.status === 201) { onProgress?.(1); return await parse(r); }
      if (r.status === 308) {
        const got = accepted(r);
        offset = got != null ? got : end;       // Disk neuvedl Range: bere se, že celá část dorazila
        fails = 0; onProgress?.(offset / total);
        continue;
      }
      if (r.status === 404 || r.status === 410) throw Object.assign(new Error("relace vypršela"), { fatal: true });
      if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) throw Object.assign(new Error("Disk odmítl nahrávání (HTTP " + r.status + ")"), { fatal: true });
      throw new Error("HTTP " + r.status);
    } catch (e) {
      if (e.fatal || ++fails > maxRetries) throw e.fatal ? e : new Error("spojení se opakovaně přerušilo");
      await sleep(Math.min(8000, 500 * 2 ** fails));
      try { const st = await status(); if (st.done) { onProgress?.(1); return st.done; } offset = st.offset; } catch (e2) { /* další pokus */ }
    }
  }
}
