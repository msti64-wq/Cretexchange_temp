import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type RepositoryExportDocument = { identifier: string; title: string; version: string; body: string };

const encoder = new TextEncoder();

function filenamePart(value: string) { return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "document"; }
function download(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character); }
function plainMarkdown(body: string) { return body.replace(/```[\s\S]*?```/g, (block) => block.replace(/^```[^\n]*\n?|```$/g, "")).replace(/!\[([^\]]*)\]\([^)]*\)/g, "[Image: $1]").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[>*_`]/g, "").replace(/^#{1,6}\s*/gm, ""); }
function timestamp() { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date()); }

export function downloadMarkdown(document: RepositoryExportDocument) { download(new Blob([document.body], { type: "text/markdown;charset=utf-8" }), `${filenamePart(document.identifier)}.md`); }
export function downloadHtml(document: RepositoryExportDocument, renderedHtml: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(document.identifier)} — ${escapeHtml(document.title)}</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:48px auto;line-height:1.6;color:#111}header,footer{border-bottom:1px solid #ddd;padding-bottom:16px;margin-bottom:28px;color:#1455a0}footer{border-top:1px solid #ddd;border-bottom:0;padding-top:16px;margin-top:28px;font-size:12px}</style></head><body><header><strong>CreteXchange</strong><br>${escapeHtml(document.identifier)} · ${escapeHtml(document.title)}<br>Version ${escapeHtml(document.version)}</header>${renderedHtml}<footer>Generated ${timestamp()} · Read-only Administration Repository export</footer></body></html>`;
  download(new Blob([html], { type: "text/html;charset=utf-8" }), `${filenamePart(document.identifier)}.html`);
}

function addHeader(doc: jsPDF, document: RepositoryExportDocument) {
  doc.setFontSize(10); doc.setTextColor(20, 85, 160); doc.text("CreteXchange — Administration Repository", 14, 12);
  doc.setTextColor(40); doc.setFontSize(9); doc.text(`${document.identifier} · ${document.version}`, 14, 18);
}
function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) { doc.setPage(page); doc.setFontSize(8); doc.setTextColor(90); doc.text(`Generated ${timestamp()} · Page ${page} of ${pageCount}`, 14, doc.internal.pageSize.getHeight() - 10); }
}
function addDocument(doc: jsPDF, document: RepositoryExportDocument, startY = 28) {
  addHeader(doc, document); doc.setTextColor(20); doc.setFontSize(18); doc.text(`${document.identifier} — ${document.title}`, 14, startY);
  doc.setFontSize(10); doc.setTextColor(85); doc.text(`Version ${document.version}`, 14, startY + 7);
  let y = startY + 17; doc.setFontSize(10); doc.setTextColor(25);
  const lines = doc.splitTextToSize(plainMarkdown(document.body), doc.internal.pageSize.getWidth() - 28);
  for (const line of lines) { if (y > doc.internal.pageSize.getHeight() - 22) { doc.addPage(); addHeader(doc, document); y = 28; } doc.text(line, 14, y); y += 5; }
}

export function downloadPdf(document: RepositoryExportDocument) { const pdf = new jsPDF(); addDocument(pdf, document); addFooter(pdf); pdf.save(`${filenamePart(document.identifier)}.pdf`); }

export function downloadCombinedPdf(documents: RepositoryExportDocument[]) {
  const pdf = new jsPDF(); const generated = { identifier: "PACKAGE", title: "Administration Repository package", version: "Read-only export", body: "" };
  addHeader(pdf, generated); pdf.setFontSize(18); pdf.text("CreteXchange Administration Repository", 14, 30); pdf.setFontSize(11); pdf.text("Selected document package", 14, 38);
  autoTable(pdf, { startY: 48, head: [["Identifier", "Title", "Version"]], body: documents.map((document) => [document.identifier, document.title, document.version]), styles: { fontSize: 8 }, margin: { left: 14, right: 14 } });
  for (const document of documents) { pdf.addPage(); addDocument(pdf, document); }
  addFooter(pdf); pdf.save("creteXchange-administration-repository-package.pdf");
}

function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (let index = 0; index < bytes.length; index += 1) { const byte = bytes[index]; crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function uint16(value: number) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]); }
function uint32(value: number) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]); }
function concat(parts: Uint8Array[]) { const size = parts.reduce((sum, part) => sum + part.length, 0); const result = new Uint8Array(size); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result; }

/** Store-only ZIP writer keeps verified Markdown export dependency-free. */
export function downloadMarkdownZip(documents: RepositoryExportDocument[]) {
  const locals: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  for (const document of documents) {
    const name = encoder.encode(`${filenamePart(document.identifier)}.md`); const body = encoder.encode(document.body); const crc = crc32(body);
    const local = concat([uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0), uint32(crc), uint32(body.length), uint32(body.length), uint16(name.length), uint16(0), name, body]); locals.push(local);
    central.push(concat([uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0), uint32(crc), uint32(body.length), uint32(body.length), uint16(name.length), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(offset), name])); offset += local.length;
  }
  const centralBytes = concat(central); const archive = concat([...locals, centralBytes, uint32(0x06054b50), uint16(0), uint16(0), uint16(documents.length), uint16(documents.length), uint32(centralBytes.length), uint32(offset), uint16(0)]);
  download(new Blob([archive], { type: "application/zip" }), "creteXchange-administration-repository-sources.zip");
}
