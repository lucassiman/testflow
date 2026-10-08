import { WIKILINK_RE } from './wikilinks.ts';
import { joinPath } from './relink.ts';

/**
 * Links quebrados de um documento: [[TC-042]] que não existe na pasta de trabalho e link relativo para um .md
 * que não existe (a partir da pasta do documento). Fora de blocos de código e de `código`.
 */
export interface BrokenLink {
  /** linha (0) */
  line: number;
  kind: 'wiki' | 'md';
  /** alvo como escrito: "TC-999" ou "../casos/TC-9.md" */
  target: string;
}

export function findBrokenLinks(
  text: string,
  o: { wikiExists: (target: string) => boolean; mdExists?: (path: string) => boolean; docDir?: string | null },
): BrokenLink[] {
  const out: BrokenLink[] = [];
  const seen = new Set<string>();
  let fence: string | null = null;
  text.split('\n').forEach((line, i) => {
    const f = /^\s*(`{3,}|~{3,})/.exec(line); // inclusive dentro de item de lista (indentada)
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; return; }
    if (f) { fence = f[1]; return; }
    const plain = line.replace(/`[^`]*`/g, '');
    for (const m of plain.matchAll(WIKILINK_RE)) {
      const target = m[1].trim().replace(/\\$/, '').trim().split('#')[0].trim();
      const key = `w:${target.toLowerCase()}`;
      if (!target || seen.has(key) || o.wikiExists(target)) continue;
      seen.add(key);
      out.push({ line: i, kind: 'wiki', target });
    }
    if (!o.mdExists || o.docDir === undefined || o.docDir === null) return;
    for (const m of plain.matchAll(/\]\(\s*(?:<([^>]+?\.(?:md|markdown))(?:#[^>]*)?>|([^)\s>]+\.(?:md|markdown))(?:#[^)\s>]*)?)(?:\s+"[^"]*")?\s*\)/gi)) {
      const raw = m[1] || m[2];
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//') || raw.startsWith('/')) continue;
      let decoded = raw;
      try { decoded = decodeURIComponent(raw); } catch { /* mantém */ }
      const path = joinPath(o.docDir, decoded);
      const key = `m:${raw}`;
      if (seen.has(key) || (path !== null && o.mdExists(path))) continue;
      seen.add(key);
      out.push({ line: i, kind: 'md', target: raw });
    }
  });
  return out;
}

/** Distância de edição (para sugerir o documento certo). */
export function editDistance(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

/** Troca o alvo de um link quebrado no texto (todas as ocorrências, fora de código não é preciso distinguir). */
export function replaceLinkTarget(text: string, kind: 'wiki' | 'md', from: string, to: string): string {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // em tabela o | do link vem escapado: [[TC-55\\|caso]]
  if (kind === 'wiki') return text.replace(new RegExp(`\\[\\[\\s*${esc}\\s*(?=\\\\?[|#\\]])`, 'gi'), `[[${to}`);
  return text.replace(new RegExp(`(\\]\\(\\s*<?)${esc}(?=[#>)\\s])`, 'g'), `$1${to}`);
}
