/* CIV FM — download a constitution as a PDF, built in the browser from the
   hosted text (civic/constitutions/<ISO3>.html). jsPDF is loaded on first
   use from cdnjs; if that host is blocked the same text is saved as .txt.
   Exposes window.downloadConstitution(iso3, {name, title, enacted, revised, id}). */
(function () {
  const BASE = new URL("./", document.currentScript.src).href; // civic/
  const JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  let lib = null;

  function loadLib() {
    if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!lib) lib = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = JSPDF; s.onload = () => res(window.jspdf.jsPDF); s.onerror = () => { lib = null; rej(new Error("jsPDF unreachable")); };
      document.head.appendChild(s);
    });
    return lib;
  }

  // the hosted HTML → [{kind: "h1"|"h2"|"h3"|"p", text}]
  async function blocks(iso) {
    const html = await (await fetch(`${BASE}constitutions/${iso}.html`)).text();
    const root = document.createElement("div");
    root.innerHTML = html;
    const out = [];
    const walk = (el) => {
      for (const n of el.children) {
        const tag = n.tagName;
        const text = n.textContent.replace(/\s+/g, " ").trim();
        if (!text) continue;
        if (tag === "H1") continue; // the file's own title; we print our own
        if (tag === "H2" || tag === "H3" || tag === "H4") out.push({ kind: tag === "H4" ? "h3" : tag.toLowerCase(), text });
        else if (tag === "P") out.push({ kind: "p", text });
        else if (tag === "LI") out.push({ kind: "p", text: "• " + text });
        else if (n.children.length) walk(n);
        else out.push({ kind: "p", text });
      }
    };
    walk(root);
    return out;
  }

  const save = (blob, name) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  // jsPDF's built-in fonts cover Latin-1; anything else becomes "?", so we
  // transliterate the few common accents and drop the rest
  const latin = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x00-\xff]/g, (c) => ({ "—": "-", "–": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "…": "...", "•": "-" }[c] || "?"));

  async function toPDF(iso, m) {
    const [jsPDF, bl] = await Promise.all([loadLib(), blocks(iso)]);
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = 595, H = 842, L = 56, R = 56, T = 64, B = 60, width = W - L - R;
    let y = T, page = 1;
    const footer = () => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140);
      doc.text(latin(`${m.name} · ${m.title || "Constitution"} · civ.fm`), L, H - 30);
      doc.text(String(page), W - R, H - 30, { align: "right" });
      doc.setTextColor(0);
    };
    const newPage = () => { footer(); doc.addPage(); page++; y = T; };
    const put = (text, size, style, before, after, color) => {
      doc.setFont("helvetica", style); doc.setFontSize(size); if (color) doc.setTextColor(color); else doc.setTextColor(0);
      const lines = doc.splitTextToSize(latin(text), width);
      const lh = size * 1.35;
      if (y + before + lh * Math.min(lines.length, 3) > H - B) newPage(); else y += before;
      for (const line of lines) {
        if (y + lh > H - B) newPage();
        doc.text(line, L, y); y += lh;
      }
      y += after;
    };
    // title page
    doc.setTextColor(0);
    put("CIV FM · civ.fm/civic/constitution", 9, "normal", 0, 24, 110);
    put(m.title || `${m.name}'s constitution`, 24, "bold", 0, 10);
    put([m.enacted ? `Enacted ${m.enacted}` : "", m.revised && m.revised !== m.enacted ? `amendments through ${m.revised}` : ""].filter(Boolean).join(" · "), 11, "normal", 0, 6, 90);
    put("English text from the Constitute Project (Comparative Constitutions Project), CC BY-NC 3.0. The official text is the one the country publishes; this is a reading copy.", 9, "normal", 10, 0, 110);
    newPage();
    for (const b of bl) {
      if (b.kind === "h2") put(b.text, 15, "bold", 16, 6);
      else if (b.kind === "h3") put(b.text, 12, "bold", 10, 4);
      else put(b.text, 10.5, "normal", 0, 5);
    }
    footer();
    window.__lastPDF = { pages: doc.getNumberOfPages(), bytes: doc.output("arraybuffer").byteLength }; // for tests
    doc.save(`${m.name.replace(/[^\w]+/g, "-")}-constitution.pdf`);
  }

  async function toText(iso, m) {
    const bl = await blocks(iso);
    const lines = [m.title || `${m.name}'s constitution`, [m.enacted ? `Enacted ${m.enacted}` : "", m.revised ? `amendments through ${m.revised}` : ""].filter(Boolean).join(" · "),
      "Source: Constitute Project (CC BY-NC 3.0) via civ.fm", ""];
    for (const b of bl) lines.push(b.kind === "h2" ? `\n${b.text.toUpperCase()}\n` : b.kind === "h3" ? `\n${b.text}` : b.text);
    save(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }), `${m.name.replace(/[^\w]+/g, "-")}-constitution.txt`);
  }

  window.downloadConstitution = async function (iso, m, onStatus) {
    try { onStatus?.("Building the PDF…"); await toPDF(iso, m); onStatus?.(""); }
    catch (e) {
      try { await toText(iso, m); onStatus?.("PDF library unreachable here; saved as plain text instead."); }
      catch (e2) { onStatus?.("Could not fetch the text."); }
    }
  };
})();
