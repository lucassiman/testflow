// @ts-check
/**
 * Sumário: títulos (# … ######) do documento com a linha de cada um.
 * Leve de propósito (roda a cada alteração): ignora blocos de código.
 */
/** @param {string} text */
function plain(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|~~|\*|_)(.+?)\1/g, '$2')
    .trim();
}

/** @param {string} source @returns {Array<{level: number, text: string, line: number}>} */
export function extractOutline(source) {
  /** @type {Array<{level: number, text: string, line: number}>} */
  const out = [];
  /** @type {string | null} */
  let fence = null;
  const skipUntil = /^---[ \t]*\n/.test(source) ? (source.split('\n').findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l)) + 1) : 0;
  source.split('\n').forEach((line, i) => {
    if (i < skipUntil) return; // front-matter (# ali é comentário YAML)
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      return;
    }
    if (fence) return;
    const m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: plain(m[2]), line: i });
  });
  return out;
}
