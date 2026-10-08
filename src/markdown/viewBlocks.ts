/**
 * Blocos ```qa-visao e a cópia gerada logo abaixo de cada um (entre <!-- qa:visao --> e <!-- /qa:visao -->).
 * Sem dependências: usado pelas visões, pela contagem de passos (status.ts) e pelo índice da pasta,
 * para a cópia gerada não contar como passos, [[links]] ou IDs do próprio documento.
 */

export const VIEW_OPEN = '<!-- qa:visao -->';
export const VIEW_CLOSE = '<!-- /qa:visao -->';

/** Abertura de bloco de código (até 3 espaços; mais que isso é bloco indentado). */
const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}#{1,6}(\s|$)/;

export interface ViewBlock {
  /** linha da abertura ```qa-visao */
  start: number;
  /** linha do fechamento ``` */
  end: number;
  src: string;
  /** recuo do bloco (visão dentro de item de lista) — a cópia gerada usa o mesmo */
  indent: string;
  snapshot: { open: number; close: number } | null;
  /** cópia gerada com o marcador de fim apagado: não mexer (senão apagaria texto do usuário) */
  broken: boolean;
}

const isClose = (line: string, fence: string): boolean => {
  const t = line.trim();
  return t.length >= fence.length && t[0] === fence[0] && /^(`+|~+)$/.test(t);
};

/**
 * Blocos de visão do documento (linhas) e a cópia gerada logo depois de cada um, se houver.
 * Ignora exemplos dentro de outros blocos de código e blocos ```qa-visao sem fechamento.
 */
export function findViewBlocks(text: string): ViewBlock[] {
  const lines = text.split('\n');
  const out: ViewBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = FENCE_OPEN.exec(lines[i]);
    if (!m) continue;
    const fence = m[2];
    let j = i + 1;
    while (j < lines.length && !isClose(lines[j], fence)) j++;
    if (j >= lines.length) break; // bloco sem fechamento: vai até o fim do arquivo
    const isView = /^qa-visao(\s|$)/i.test(m[3].trim());
    if (!isView) { i = j; continue; } // outro bloco de código: pula o conteúdo
    const block: ViewBlock = { start: i, end: j, src: lines.slice(i + 1, j).map((l) => (l.startsWith(m[1]) ? l.slice(m[1].length) : l.trimStart())).join('\n'), indent: m[1], snapshot: null, broken: false };
    let k = j + 1;
    while (k < lines.length && !lines[k].trim()) k++;
    if (k < lines.length && lines[k].trim() === VIEW_OPEN) {
      // o fim tem de vir antes de qualquer título, bloco de código ou outra cópia gerada
      let c = k + 1;
      while (c < lines.length && lines[c].trim() !== VIEW_CLOSE && lines[c].trim() !== VIEW_OPEN && !HEADING.test(lines[c]) && !FENCE_OPEN.test(lines[c])) c++;
      if (c < lines.length && lines[c].trim() === VIEW_CLOSE) block.snapshot = { open: k, close: c };
      else block.broken = true;
    }
    out.push(block);
    i = block.snapshot ? block.snapshot.close : j;
  }
  return out;
}

/** Linhas que pertencem às cópias geradas (o Preview esconde: mostra a visão ao vivo). */
export function snapshotRanges(text: string): Array<{ open: number; close: number }> {
  if (!text.includes(VIEW_OPEN)) return [];
  return findViewBlocks(text).map((b) => b.snapshot).filter((s): s is { open: number; close: number } => !!s);
}

/** O texto com as cópias geradas trocadas por linhas vazias (mesma numeração de linhas). */
export function blankSnapshots(text: string): string {
  const ranges = snapshotRanges(text);
  if (!ranges.length) return text;
  const lines = text.split('\n');
  for (const r of ranges) for (let i = r.open; i <= r.close; i++) lines[i] = '';
  return lines.join('\n');
}
