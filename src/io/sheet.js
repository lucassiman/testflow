// @ts-check
/**
 * Planilhas sem dependências: tabela ↔ XLSX / CSV.
 * - XLSX é um .zip com XMLs. Escrita: zip "stored" (sem compressão).
 *   Leitura: descompacta com DecompressionStream('deflate-raw') do navegador.
 * - Lê a 1ª aba, textos (compartilhados ou inline), números, booleanos e datas.
 * - .xls antigo (binário) não é suportado: salve como .xlsx.
 */

// ---------------------------------------------------------------- zip
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
/** @param {Uint8Array} bytes */
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Zip sem compressão ("stored").
 * @param {Array<[string, string | Uint8Array]>} files [caminho no zip, conteúdo]
 * @param {string} [type] tipo do Blob
 */
export function zipStore(files, type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBytes = enc.encode(name);
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true);
    cen.setUint16(28, nameBytes.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob(/** @type {BlobPart[]} */ ([...chunks, ...central, new Uint8Array(end.buffer)]), { type });
}

/** @param {ArrayBuffer} buffer */
async function unzip(buffer) {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('arquivo não é um .xlsx válido');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buffer, p + 46, nameLen));
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = new Uint8Array(buffer, start, compSize);
    files.set(name, { method, raw });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    /** @param {string} name @returns {Promise<string | null>} */
    async text(name) {
      const f = files.get(name);
      if (!f) return null;
      if (f.method === 0) return dec.decode(f.raw);
      const stream = new Blob([f.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).text();
    },
  };
}

// ---------------------------------------------------------------- XLSX: escrever
/** @param {unknown} s */
function xmlEscape(s) {
  return String(s).replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}
/** @param {number} i */
function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** @param {string[][]} rows primeira linha = cabeçalho (em negrito) */
export function toXlsx(rows, sheetName = 'Tabela') {
  const width = Math.max(1, ...rows.map((r) => r.length));
  const widths = Array.from({ length: width }, (_, c) => Math.min(60, Math.max(8, ...rows.map((r) => String(r[c] ?? '').split('\n').reduce((m, l) => Math.max(m, l.length), 0) + 2))));
  const sheetRows = rows.map((r, ri) => {
    const cells = r.map((v, ci) => {
      const ref = `${colName(ci)}${ri + 1}`;
      const style = ri === 0 ? ' s="1"' : String(v).includes('\n') ? ' s="2"' : '';
      if (ri > 0 && /^-?(0|[1-9]\d*)([.,]\d+)?$/.test(String(v).trim()) && String(v).trim().length < 15) { // '001' continua texto
        return `<c r="${ref}"${style}><v>${String(v).trim().replace(',', '.')}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(v ?? '')}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const safeName = xmlEscape(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Tabela');
  return zipStore([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F0FE"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${colName(width - 1)}${rows.length}"/></worksheet>`],
  ]);
}

// ---------------------------------------------------------------- XLSX: ler
const DATE_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * XML → algo com getElementsByTagName / getAttribute / textContent. No navegador, o DOMParser; fora dele (o MCP, no
 * Node), um leitor mínimo que basta para os XMLs do XLSX.
 * @param {string | null} text @returns {Document}
 */
function parseXml(text) {
  if (typeof DOMParser !== 'undefined') return new DOMParser().parseFromString(text || '', 'application/xml');
  return /** @type {Document} */ (/** @type {unknown} */ (miniXml(text || '')));
}

const XML_ENT = /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" });
/** @param {string} s */
const unent = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : XML_ENT[e] ?? m));
class MiniEl {
  /** @param {string} name @param {Record<string, string>} attrs */
  constructor(name, attrs) {
    this.name = name;
    this.attrs = attrs;
    /** @type {Array<MiniEl | string>} */
    this.children = [];
  }
  /** @param {string} a */
  getAttribute(a) { return this.attrs[a] ?? null; }
  /** @param {string} _ns @param {string} local */
  getAttributeNS(_ns, local) { const k = Object.keys(this.attrs).find((x) => x.split(':').pop() === local && x.includes(':')); return k ? this.attrs[k] : null; }
  /** @param {string} n @returns {MiniEl[]} */
  getElementsByTagName(n) {
    /** @type {MiniEl[]} */
    const out = [];
    /** @param {MiniEl} el */
    const walk = (el) => { for (const c of el.children) if (typeof c !== 'string') { if (c.name.split(':').pop() === n) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  /** @returns {string} */
  get textContent() { return this.children.map((/** @type {MiniEl | string} */ c) => (typeof c === 'string' ? c : c.textContent)).join(''); }
}
/** @param {string} text */
function miniXml(text) {
  const root = new MiniEl('#document', {});
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!(?:[^>]*)>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.children.push(m[1]);
    else if (m[2]) { if (stack.length > 1) stack.pop(); }
    else if (m[3]) {
      /** @type {Record<string, string>} */
      const attrs = {};
      for (const a of (m[4] || '').matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unent(a[3] ?? a[4] ?? '');
      const el = new MiniEl(m[3], attrs);
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.children.push(unent(m[6]));
  }
  return root;
}
/** @param {Element | undefined} el */
function textOf(el) { return el ? [...el.getElementsByTagName('t')].map((t) => t.textContent).join('') : ''; }
/** @param {string} ref */
function colIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] || 'A';
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}
/** @param {number} serial */
function serialToDate(serial) {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const date = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const hasTime = d.getUTCHours() || d.getUTCMinutes();
  return hasTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date;
}

/** @param {ArrayBuffer} buffer @returns {Promise<{rows: string[][], sheetName: string, sheetCount: number}>} */
export async function fromXlsx(buffer) {
  const zip = await unzip(buffer);
  const wb = parseXml(await zip.text('xl/workbook.xml'));
  const sheets = [...wb.getElementsByTagName('sheet')];
  if (!sheets.length) throw new Error('nenhuma aba encontrada');
  const first = sheets[0];
  const rid = first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const rels = parseXml(await zip.text('xl/_rels/workbook.xml.rels'));
  let target = [...rels.getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target') || 'worksheets/sheet1.xml';
  target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
  const sheetXml = await zip.text(`xl/${target}`);
  if (!sheetXml) throw new Error('não foi possível ler a primeira aba');

  const sstText = await zip.text('xl/sharedStrings.xml');
  const shared = sstText ? [...parseXml(sstText).getElementsByTagName('si')].map((si) => textOf(si)) : [];

  // estilos de data
  /** @type {Set<number>} */
  const dateStyles = new Set();
  const stylesText = await zip.text('xl/styles.xml');
  if (stylesText) {
    const st = parseXml(stylesText);
    const customDate = new Set([...st.getElementsByTagName('numFmt')]
      .filter((f) => /[dmy]/i.test((f.getAttribute('formatCode') || '').replace(/"[^"]*"|\[[^\]]*\]/g, '')))
      .map((f) => Number(f.getAttribute('numFmtId'))));
    const xfs = st.getElementsByTagName('cellXfs')[0];
    [...(xfs?.getElementsByTagName('xf') || [])].forEach((xf, i) => {
      const id = Number(xf.getAttribute('numFmtId'));
      if (DATE_FMT_IDS.has(id) || customDate.has(id)) dateStyles.add(i);
    });
  }

  const doc = parseXml(sheetXml);
  /** @type {string[][]} */
  const rows = [];
  for (const row of doc.getElementsByTagName('row')) {
    const r = Number(row.getAttribute('r') || rows.length + 1) - 1;
    /** @type {string[]} */
    const out = [];
    for (const c of row.getElementsByTagName('c')) {
      const idx = colIndex(c.getAttribute('r') || '');
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      /** @type {string} */
      let value;
      if (t === 's') value = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') value = textOf(c.getElementsByTagName('is')[0]);
      else if (t === 'b') value = v === '1' ? 'VERDADEIRO' : 'FALSO';
      else if (t === 'str' || t === 'e') value = v;
      else if (v !== '' && dateStyles.has(Number(c.getAttribute('s')))) value = serialToDate(Number(v));
      else value = v;
      out[idx] = value;
    }
    rows[r] = Array.from(out, (x) => x ?? '');
  }
  return { rows: cleanRows(Array.from(rows, (x) => x ?? [])), sheetName: first.getAttribute('name') || '', sheetCount: sheets.length };
}

// ---------------------------------------------------------------- CSV
/** @param {unknown[][]} rows */
export function toCsv(rows) {
  /** @param {unknown} v */
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM: o Excel abre com acentos corretos
  return new Blob([`﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
}

/** @param {string} text */
export function fromCsv(text) {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = clean.split('\n')[0];
  const delim = ['\t', ';', ','].map((d) => /** @type {[string, number]} */ ([d, firstLine.split(d).length])).sort((a, b) => b[1] - a[1])[0][0];
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return cleanRows(rows);
}

/** Remove linhas e colunas vazias nas bordas. */
/** @param {unknown[][]} rows @returns {string[][]} */
function cleanRows(rows) {
  const filled = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (!filled.length) return [];
  let width = Math.max(...filled.map((r) => r.length));
  while (width > 0 && filled.every((r) => String(r[width - 1] ?? '').trim() === '')) width--;
  return filled.map((r) => Array.from({ length: width }, (_, i) => String(r[i] ?? '')));
}

/** Tabela renderizada (DOM) → linhas de texto (badges viram o texto do status, <br> vira quebra). */
/** @param {HTMLTableElement} table */
export function rowsFromTable(table) {
  return [...table.rows].map((tr) => [...tr.cells].map((td) => td.innerText.replace(/ /g, ' ').trim()));
}

/** @param {Blob} blob @param {string} name */
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
