// node tests/fixtures/make-pdf.js
//
// Writes data-retention-standard.pdf: three pages of plain text in a
// standard font, for the end-to-end test to read through the app's own PDF
// reader and cite by page and line. Kept as a script so the fixture can be
// read and remade, not trusted as an opaque file.
"use strict";
const fs = require("fs"), path = require("path");

const pages = [
  ["DATA RETENTION STANDARD", "Version 3.2", "Effective date: 1 March 2026", "1 Purpose",
   "This standard sets how long records are kept and how they are disposed of."],
  ["2 Retention Periods", "Customer correspondence is kept for 7 years after the account closes.",
   "System logs are kept for 90 days.", "Audit logs are kept for 2 years."],
  ["3 Disposal", "Records are disposed of within 30 days after the retention period ends.",
   "Disposal is recorded in the disposal register."]
];

const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const objs = [];
const add = body => { objs.push(body); return objs.length; };
const catalog = add(null), tree = add(null), font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
const kids = [];
pages.forEach(lines => {
  const ops = ["BT", "/F1 12 Tf", "72 770 Td"];
  lines.forEach((l, i) => { if (i) ops.push("0 -22 Td"); ops.push("(" + esc(l) + ") Tj"); });
  ops.push("ET");
  const stream = ops.join("\n");
  const content = add("<< /Length " + Buffer.byteLength(stream) + " >>\nstream\n" + stream + "\nendstream");
  kids.push(add("<< /Type /Page /Parent " + tree + " 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 " + font +
                " 0 R >> >> /Contents " + content + " 0 R >>"));
});
objs[catalog - 1] = "<< /Type /Catalog /Pages " + tree + " 0 R >>";
objs[tree - 1] = "<< /Type /Pages /Kids [" + kids.map(k => k + " 0 R").join(" ") + "] /Count " + kids.length + " >>";

let out = "%PDF-1.4\n";
const offs = [];
objs.forEach((b, i) => { offs.push(Buffer.byteLength(out)); out += (i + 1) + " 0 obj\n" + b + "\nendobj\n"; });
const xref = Buffer.byteLength(out);
out += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" +
       offs.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("") +
       "trailer\n<< /Size " + (objs.length + 1) + " /Root " + catalog + " 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
fs.writeFileSync(path.join(__dirname, "data-retention-standard.pdf"), out, "latin1");
console.log("wrote data-retention-standard.pdf (" + Buffer.byteLength(out) + " bytes, " + pages.length + " pages)");
