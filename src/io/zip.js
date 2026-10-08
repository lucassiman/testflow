// @ts-check
/**
 * Leitor de .zip no navegador (sem bibliotecas): lista as entradas e descompacta sob demanda
 * (métodos "stored" e "deflate", este via DecompressionStream). Suporta ZIP64 (arquivos grandes).
 * Zips dentro do zip (o export do Notion em partes: Export-…-Part-1.zip) são abertos também.
 */

/** @typedef {{ name: string, method: number, compSize: number, size: number, offset: number, source: ArrayBuffer }} ZipEntry */
/** @typedef {{ entries: ZipEntry[], bytes: (entry: ZipEntry) => Promise<Uint8Array>, text: (entry: ZipEntry) => Promise<string> }} ZipArchive */

const utf8 = new TextDecoder('utf-8');

/** @param {DataView} view @param {number} at */
const u64 = (view, at) => view.getUint32(at, true) + view.getUint32(at + 4, true) * 2 ** 32;

/**
 * Lê o diretório central do zip.
 * @param {ArrayBuffer} buffer
 * @returns {ZipEntry[]}
 */
function readDirectory(buffer) {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('não é um arquivo .zip válido');
  let count = view.getUint16(eocd + 10, true);
  let dir = view.getUint32(eocd + 16, true);
  // ZIP64: o registro "end of central directory" de 64 bits vem logo antes do localizador
  if ((count === 0xffff || dir === 0xffffffff) && eocd >= 20 && view.getUint32(eocd - 20, true) === 0x07064b50) {
    const rec = u64(view, eocd - 20 + 8);
    if (view.getUint32(rec, true) === 0x06064b50) {
      count = u64(view, rec + 32);
      dir = u64(view, rec + 48);
    }
  }
  /** @type {ZipEntry[]} */
  const out = [];
  let p = dir;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buffer.byteLength || view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    let compSize = view.getUint32(p + 20, true);
    let size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    let offset = view.getUint32(p + 42, true);
    const name = utf8.decode(new Uint8Array(buffer, p + 46, nameLen)).replace(/\\/g, '/');
    // campo extra ZIP64 (0x0001): tamanhos e posição que não cabem em 32 bits
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = view.getUint16(e, true);
      const len = view.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) { size = u64(view, q); q += 8; }
        if (compSize === 0xffffffff) { compSize = u64(view, q); q += 8; }
        if (offset === 0xffffffff) { offset = u64(view, q); }
      }
      e += 4 + len;
    }
    out.push({ name, method, compSize, size, offset, source: buffer });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** @param {ZipEntry} entry @returns {Promise<Uint8Array>} */
async function inflate(entry) {
  const view = new DataView(entry.source);
  if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error(`entrada corrompida: ${entry.name}`);
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const raw = new Uint8Array(entry.source, start, entry.compSize);
  if (entry.method === 0) return raw.slice();
  if (entry.method !== 8) throw new Error(`compressão não suportada (${entry.method}) em ${entry.name}`);
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Abre um .zip (e os .zip que estiverem dentro dele, até 2 níveis).
 * @param {ArrayBuffer} buffer
 * @returns {Promise<ZipArchive>}
 */
export async function openZip(buffer) {
  /** @type {ZipEntry[]} */
  const entries = [];
  /** @param {ArrayBuffer} buf @param {number} depth */
  const walk = async (buf, depth) => {
    for (const e of readDirectory(buf)) {
      if (e.name.endsWith('/') || e.name.startsWith('__MACOSX/') || /(^|\/)\.DS_Store$/.test(e.name)) continue;
      if (depth < 2 && /\.zip$/i.test(e.name)) {
        const inner = await inflate(e);
        await walk(/** @type {ArrayBuffer} */ (inner.slice().buffer), depth + 1);
        continue;
      }
      entries.push(e);
    }
  };
  await walk(buffer, 0);
  return {
    entries,
    bytes: inflate,
    text: async (entry) => utf8.decode(await inflate(entry)),
  };
}
