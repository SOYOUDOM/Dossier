// node tests/fixtures/make-pdf.js
//
// Writes two PDFs of plain text in a standard font, for the end-to-end test
// to read through the app's own PDF reader and cite by page and line:
//   data-retention-standard.pdf           three pages, a title on the first
//   SEC.014 Patch Management Standard.pdf  a logo's word as its first line,
//                                          and a table that reads a column
//                                          at a time, as real PDFs do
// Kept as a script so the fixtures can be read and remade, not trusted as
// opaque files.
"use strict";
const fs = require("fs"), path = require("path");

const docs = {};
docs["data-retention-standard.pdf"] = [
  ["DATA RETENTION STANDARD", "Version 3.2", "Effective date: 1 March 2026", "1 Purpose",
   "This standard sets how long records are kept and how they are disposed of."],
  ["2 Retention Periods", "Customer correspondence is kept for 7 years after the account closes.",
   "System logs are kept for 90 days.", "Audit logs are kept for 2 years."],
  ["3 Disposal", "Records are disposed of within 30 days after the retention period ends.",
   "Disposal is recorded in the disposal register."]
];
docs["SEC.014 Patch Management Standard.pdf"] = [
  ["ACME", "Patch Management Standard", "Version 2.0", "1 Patch Timeframes",
   "Security patches are applied within the timeframe for their severity:",
   "Critical High Medium", "14 30 90", "(calendar days from the vendor release)"],
  ["2 Exceptions", "An exception is approved by the change advisory board."]
];

const esc = s => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
function write(file, pages){
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
fs.writeFileSync(path.join(__dirname, file), out, "latin1");
console.log("wrote " + file + " (" + Buffer.byteLength(out) + " bytes, " + pages.length + " pages)");
}
Object.keys(docs).forEach(f => write(f, docs[f]));
