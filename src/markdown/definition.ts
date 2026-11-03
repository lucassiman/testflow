/**
 * A definição do caso: o corpo sem o que a execução muda (status, obtido, Histórico de execuções, evidências,
 * comentários, resumo, prints e a linha do bug criado no passo). Usada para comparar versões ("o que mudou no caso").
 *
 * C1 (1.78.0): a aprovação do caso (rascunho → em-revisao → aprovado) saiu do TestFlow; aqui ficam também os campos
 * dela, para a varredura limpar dos documentos antigos.
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { splitRow, normHeader, SUMMARY_OPEN, SUMMARY_CLOSE, HISTORY_TITLE } from './status.ts';

function meta(text: string): Record<string, unknown> {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}
const one = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')).trim();

/** Linha que o 🐞 Novo bug (ou um documento ligado) põe no caso: resultado da execução, não definição. */
const LINKED_LINE = /^(🐞 Bug|🔗 Relacionado): \[\[[^\]]+\]\]/;

/**
 * O texto que o revisor aprova: o corpo sem o que a execução muda.
 * `links`: mantém as linhas "🐞 Bug: [[…]]" — como era até a 1.59.0 (para reconhecer a impressão digital antiga).
 */
export function definitionText(text: string, { links = false }: { links?: boolean } = {}): string {
  const fm = detectFrontMatter(text);
  const lines = text.split('\n');
  const body = fm ? lines.slice(fm.end) : lines;
  const out: string[] = [one(meta(text).titulo)];
  let skipLevel = 0; // dentro de uma seção que fica de fora (histórico, evidências, comentários)
  let inSummary = false;
  let inComment = false;
  let fence = false;
  let cols: number[] = []; // colunas Status / Obtido da tabela atual
  for (let i = 0; i < body.length; i++) {
    const l = body[i];
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const h = !fence ? /^(#{1,6})\s+(.*)$/.exec(l) : null;
    if (h) {
      const level = h[1].length;
      if (skipLevel && level <= skipLevel) skipLevel = 0;
      if (!skipLevel && (HISTORY_TITLE.test(h[2]) || /^(evid[eê]ncias|coment[aá]rios|anexos)\b/i.test(h[2].trim()))) { skipLevel = level; continue; }
    }
    if (skipLevel) continue;
    if (l.includes(SUMMARY_OPEN)) { inSummary = true; continue; }
    if (inSummary) { if (l.includes(SUMMARY_CLOSE)) inSummary = false; continue; }
    if (/^\s{0,3}>\s?\[!(COMMENT|RESOLVED)\]/i.test(l)) { inComment = true; continue; }
    if (inComment) { if (/^\s{0,3}>/.test(l)) continue; inComment = false; }
    if (!fence && l.includes('|')) {
      const next = body[i + 1] || '';
      if (/^\s*\|?\s*:?-{2,}/.test(next) && !/^\s*\|?\s*:?-{2,}/.test(l)) {
        cols = splitRow(l).map((c, k) => (/^(status|resultado obtido|obtido|resultado atual)$/.test(normHeader(c)) ? k : -1)).filter((k) => k >= 0);
      }
      // tabela: só as células (sem alinhamento/espaços — o editor visual reescreve a tabela), sem Status/Obtido
      if (/^\s*\|?\s*:?-{2,}/.test(l)) continue;
      out.push(splitRow(l).filter((_, k) => !cols.includes(k)).map((c) => c.replace(/\s+/g, ' ').trim()).join('|'));
      continue;
    } else if (!l.trim()) cols = [];
    if (!links && LINKED_LINE.test(l.trim())) continue;
    // imagens (prints) não fazem parte da definição
    const clean = l.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    if (clean.trim()) out.push(clean);
  }
  return out.join('\n');
}

/** Campos da aprovação do caso (removida na 1.78.0): a varredura tira dos documentos antigos. */
export const APPROVAL_FIELDS = ['aprovacao', 'aprovação', 'revisor', 'aprovado_por', 'aprovado_em', 'aprovado_hash'];

const isField = (l: string, f: string): boolean => l.startsWith(f) && /^\s*:/.test(l.slice(f.length));

/** Os campos da aprovação que o cabeçalho ainda tem. */
export function approvalLeftovers(text: string): string[] {
  const fm = detectFrontMatter(text);
  if (!fm) return [];
  const head = text.split('\n').slice(1, fm.end - 1);
  return APPROVAL_FIELDS.filter((f) => head.some((l) => isField(l, f)));
}

/** Tira do cabeçalho os campos da aprovação (com as linhas de continuação, como os itens de uma lista). */
export function dropApprovalFields(text: string): string {
  const fm = detectFrontMatter(text);
  if (!fm) return text;
  const lines = text.split('\n');
  const out: string[] = [];
  let skipping = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (i === 0 || i >= fm.end - 1) { out.push(l); continue; }
    if (skipping && /^\s/.test(l)) continue;
    skipping = APPROVAL_FIELDS.some((f) => isField(l, f));
    if (!skipping) out.push(l);
  }
  return out.join('\n');
}
