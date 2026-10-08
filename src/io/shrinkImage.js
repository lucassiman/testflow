// @ts-check
/**
 * Print grande (> ~2 MB): reduz para um tamanho que abre rápido no Jira, no PDF e na pasta oficial.
 * Primeiro tenta PNG com no máximo 1920 px no lado maior (texto continua nítido);
 * se ainda passar do limite, JPEG 85 %. Se não ficar menor, devolve o original.
 */

/** Acima disso o print é "grande" (bytes). */
export const BIG_PRINT = 2 * 1024 * 1024;
/** Lado maior depois de reduzir. */
export const MAX_SIDE = 1920;

/** Tipos que dá para redesenhar num canvas (GIF animado e SVG ficam como estão). @param {Blob} file */
export const shrinkable = (file) => /^image\/(png|jpeg|webp|bmp)$/.test(file.type);

/** "4,3 MB" / "820 KB". @param {number} bytes */
export function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** @param {HTMLCanvasElement} canvas @param {string} type @param {number} [quality] @returns {Promise<Blob | null>} */
const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Reduz o print. Devolve `{ file, before, after }` (file = original se não deu para reduzir).
 * @param {File} file
 * @param {{ maxSide?: number, limit?: number }} [opts]
 */
export async function shrinkImage(file, { maxSide = MAX_SIDE, limit = BIG_PRINT } = {}) {
  const before = file.size;
  if (!shrinkable(file)) return { file, before, after: before };
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { return { file, before, after: before }; }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  let blob = await toBlob(canvas, 'image/png');
  let type = 'image/png';
  if (!blob || blob.size > limit) {
    // JPEG não tem transparência: fundo branco
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const fctx = /** @type {CanvasRenderingContext2D} */ (flat.getContext('2d'));
    fctx.fillStyle = '#fff';
    fctx.fillRect(0, 0, flat.width, flat.height);
    fctx.drawImage(canvas, 0, 0);
    const jpeg = await toBlob(flat, 'image/jpeg', 0.85);
    if (jpeg && (!blob || jpeg.size < blob.size)) { blob = jpeg; type = 'image/jpeg'; }
  }
  if (!blob || blob.size >= before) return { file, before, after: before };
  const ext = type === 'image/jpeg' ? 'jpg' : 'png';
  const name = (file.name || 'image.png').replace(/\.[a-z0-9]+$/i, '') + `.${ext}`;
  return { file: new File([blob], name, { type, lastModified: Date.now() }), before, after: blob.size };
}
