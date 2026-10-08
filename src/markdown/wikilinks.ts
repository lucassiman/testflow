/**
 * Links entre documentos: [[TC-042]] ou [[TC-042|texto]] (também [[nome-do-arquivo]]).
 * No GitHub aparece como texto; no editor vira link para o documento da pasta de trabalho.
 */
import type { MarkdownIt } from 'markdown-it';

const esc = (s: unknown): string => String(s).replace(/[&<>"]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }) as Record<string, string>)[c]);
export const WIKILINK_RE = /\[\[([^\[\]\n|]+)(?:\|([^\[\]\n]+))?\]\]/g;
export const ID_WORD_RE = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/g;

export function wikiLinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'wikilink', (state, silent) => {
    const { src, pos } = state;
    if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false;
    const end = src.indexOf(']]', pos + 2);
    if (end < 0) return false;
    const inner = src.slice(pos + 2, end);
    if (!inner.trim() || /[[\]\n]/.test(inner)) return false;
    if (!silent) {
      // dentro de tabela o | do rótulo vem escapado: [[pagina\|Texto]]
      const [target, label] = inner.replace(/\\\|/g, '|').split('|');
      const token = state.push('wikilink', '', 0);
      token.meta = { target: target.trim(), label: (label || target).trim() };
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.wikilink = (tokens, idx) => {
    const { target, label } = tokens[idx].meta as { target: string; label: string };
    return `<a class="wikilink" href="#" data-wikilink="${esc(target)}" title="Abrir ${esc(target)}">${esc(label)}</a>`;
  };
}

/** Alvos de [[links]] num texto (fora de blocos de código). */
export function extractWikiTargets(text: string): string[] {
  const out = new Set<string>();
  let fence: string | null = null;
  for (const line of text.split('\n')) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; continue; }
    if (f) { fence = f[1]; continue; }
    for (const m of line.replace(/`[^`]*`/g, '').matchAll(WIKILINK_RE)) out.add(m[1].trim().replace(/\\$/, '').trim());
  }
  return [...out];
}

/** IDs (TC-042, BUG-7…) citados no texto, com ou sem [[ ]]. */
export function extractIds(text: string): string[] {
  return [...new Set([...text.matchAll(ID_WORD_RE)].map((m) => m[1]))];
}
