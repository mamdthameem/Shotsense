/*
 * Minimal .xlsx writer: text and number cells, a bold first row, column widths
 * sized to the content. An .xlsx file is a zip of SpreadsheetML parts; the zip
 * here is "stored" (uncompressed), which Excel, LibreOffice and Google Sheets
 * all open. Enough for exporting a table, with no dependency.
 */

export type Cell = string | number | null | undefined;

export interface Sheet {
  name: string;   // ≤ 31 characters, none of : \ / ? * [ ]
  rows: Cell[][]; // first row is the header
}

const escapeXml = (s: string) =>
  s
    // Control characters are not allowed in XML 1.0 at all.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function sheetXml(rows: Cell[][]): string {
  const widths: number[] = [];
  const body = rows.map((row, r) => {
    const cells = row.map((value, c) => {
      if (value === null || value === undefined || value === '') return '';
      const text = String(value);
      widths[c] = Math.max(widths[c] ?? 8, Math.min(60, text.length + 2));
      const ref = `${columnName(c)}${r + 1}`;
      const style = r === 0 ? ' s="1"' : '';
      return typeof value === 'number' && Number.isFinite(value)
        ? `<c r="${ref}"${style}><v>${value}</v></c>`
        : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
    });
    return `<row r="${r + 1}">${cells.join('')}</row>`;
  });
  const cols = widths
    .map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w ?? 8}" customWidth="1"/>`)
    .join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + (cols ? `<cols>${cols}</cols>` : '')
    + `<sheetData>${body.join('')}</sheetData></worksheet>`;
}

const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

function workbookParts(sheets: Sheet[]): [string, string][] {
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const overrides = sheets
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join('');
  return [
    ['[Content_Types].xml', `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + `${overrides}</Types>`],
    ['_rels/.rels', `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${xml}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}"><sheets>`
      + sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
      + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="${rel}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)]),
  ];
}

// ── Stored (uncompressed) zip ────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: [string, string][]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const DOS_DATE = (1 << 5) | 1; // 1 Jan 1980; the timestamp is irrelevant here
  const entries = files.map(([name, text]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    return { nameBytes, data, crc: crc32(data), offset: 0 };
  });

  const localSize = entries.reduce((n, e) => n + 30 + e.nameBytes.length + e.data.length, 0);
  const centralSize = entries.reduce((n, e) => n + 46 + e.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let p = 0;
  const u16 = (v: number) => { view.setUint16(p, v, true); p += 2; };
  const u32 = (v: number) => { view.setUint32(p, v, true); p += 4; };
  const bytes = (b: Uint8Array) => { out.set(b, p); p += b.length; };

  for (const e of entries) {
    e.offset = p;
    u32(0x04034b50); u16(20); u16(0); u16(0); u16(0); u16(DOS_DATE);
    u32(e.crc); u32(e.data.length); u32(e.data.length);
    u16(e.nameBytes.length); u16(0);
    bytes(e.nameBytes); bytes(e.data);
  }
  const centralStart = p;
  for (const e of entries) {
    u32(0x02014b50); u16(20); u16(20); u16(0); u16(0); u16(0); u16(DOS_DATE);
    u32(e.crc); u32(e.data.length); u32(e.data.length);
    u16(e.nameBytes.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(e.offset);
    bytes(e.nameBytes);
  }
  const centralLength = p - centralStart;
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length);
  u32(centralLength); u32(centralStart); u16(0);
  return out;
}

export function buildXlsx(sheets: Sheet[]): Blob {
  return new Blob([zip(workbookParts(sheets))], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function downloadXlsx(sheets: Sheet[], fileName: string): void {
  const url = URL.createObjectURL(buildXlsx(sheets));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/[\\/:*?"<>|]+/g, '-');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
