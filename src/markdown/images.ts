/**
 * Tamanho de exibição dos prints: `![legenda|320](evidencias/x.png)` (convenção do Obsidian).
 * No editor, no PDF e no HTML a imagem fica com 320 px de largura; em outros visualizadores (GitHub, hub, Jira)
 * o "|320" fica só no texto alternativo — a imagem aparece normal.
 */

/** P / M / G: larguras oferecidas (G = largura total, sem número). */
export const IMAGE_SIZES: Record<string, number | null> = { P: 320, M: 560, G: null };

/** Legenda sem o "|320" (ou "\|320", dentro de tabela). */
export function imageAlt(alt: string): string {
  return alt.replace(/\s*\\?\|\s*\d{2,4}\s*$/, '');
}

/** Largura guardada na legenda (ou null). */
export function imageWidth(alt: string): number | null {
  const m = /\|\s*(\d{2,4})\s*$/.exec(alt);
  return m ? Number(m[1]) : null;
}

/** Caminho comparável: sem <>, ./, ?query/#âncora e com %20/acentos decodificados (o Preview guarda a forma codificada). */
function samePath(s: string): string {
  let x = s.trim().replace(/^<|>$/g, '').split(/[?#]/)[0].replace(/^\.\//, '');
  try { x = decodeURIComponent(x); } catch { /* mantém */ }
  return x;
}

const IMG_RE = /!\[((?:\\\]|[^\]])*)\]\(\s*(<[^>]*>|[^)\s]+)([^)]*)\)/g;

/**
 * Muda a largura de uma imagem (pelo caminho) nas linhas [from, to) do texto. width null = tamanho original.
 * `occurrence`: qual das imagens com esse caminho nessas linhas (0 = a primeira). Numa linha de tabela o "|" vira "\|".
 * Devolve o texto novo (igual ao original se a imagem não for achada).
 */
export function setImageWidth(text: string, from: number, to: number, src: string, width: number | null, occurrence = 0): string {
  const lines = text.split('\n');
  const target = samePath(src);
  let seen = 0;
  for (let i = Math.max(0, from); i < Math.min(lines.length, to); i++) {
    const line = lines[i];
    for (const m of line.matchAll(IMG_RE)) {
      if (samePath(m[2]) !== target) continue;
      if (seen++ < occurrence) continue;
      const sep = /^\s*\|/.test(line) ? '\\|' : '|';
      const next = `![${imageAlt(m[1])}${width ? `${sep}${width}` : ''}](${m[2]}${m[3]})`;
      lines[i] = line.slice(0, m.index) + next + line.slice((m.index || 0) + m[0].length);
      return lines.join('\n');
    }
  }
  return text;
}
