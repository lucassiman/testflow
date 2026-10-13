/**
 * Aprovação do caso (11.2) — funções puras, para o app e o MCP.
 *
 *   aprovacao: rascunho | em-revisao | aprovado
 *   revisor: Ana                       (quem foi chamado para revisar — opcional)
 *   aprovado_por: Ana · aprovado_em: 2026-10-10 14:02
 *   aprovado_hash: 1a2b3c4d            (impressão digital da DEFINIÇÃO do caso quando foi aprovado)
 *
 * A definição é o que o revisor aprovou: título, objetivo, pré-condições, passos (Ação / Esperado), massa de dados…
 * Executar não mexe nela — status, obtido, Histórico de execuções, evidências, comentários, o resumo e a linha do bug
 * criado no passo que falhou ("🐞 Bug: [[BUG-7]] — …") ficam de fora.
 * Mudou a definição depois de aprovado → "aprovado · alterado" (precisa aprovar de novo).
 * Sem o campo `aprovacao:` o documento não está no fluxo de aprovação (nada muda para ele).
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { splitRow, normHeader, SUMMARY_OPEN, SUMMARY_CLOSE, HISTORY_TITLE } from './status.ts';
import { setFrontMatterFields } from './publish.ts';

export type ApprovalState = 'rascunho' | 'em-revisao' | 'aprovado';
export const APPROVAL_STATES: ApprovalState[] = ['rascunho', 'em-revisao', 'aprovado'];
export const APPROVAL_LABELS: Record<ApprovalState, string> = { rascunho: 'Rascunho', 'em-revisao': 'Em revisão', aprovado: 'Aprovado' };
/** Tipos que passam pela aprovação. */
export const APPROVAL_TYPES = new Set(['caso-de-teste', 'cenario-bdd', 'checklist']);

export interface Approval {
  state: ApprovalState | null;
  /** aprovado, mas a definição mudou depois */
  changed: boolean;
  revisor: string;
  por: string;
  em: string;
  /** aprovado_hash (impressão digital da definição aprovada) */
  hash: string;
}

const key = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** "Em revisão", "revisao", "em_revisao" → em-revisao; "aprovada" → aprovado… */
export function normalizeApproval(v: unknown): ApprovalState | null {
  const k = key(String(v ?? '')).replace(/[\s_]+/g, '-');
  if (!k) return null;
  if (/^aprovad/.test(k)) return 'aprovado';
  if (/revis/.test(k)) return 'em-revisao';
  if (/^(rascunho|draft|novo|nova)/.test(k)) return 'rascunho';
  return null;
}

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

/** Impressão digital da definição do caso. */
export function definitionHash(text: string, o: { links?: boolean } = {}): string {
  let h = 0x811c9dc5;
  const s = definitionText(text, o);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/**
 * O texto bate com a impressão digital aprovada? Vale também a conta de antes da 1.60.0 (com a linha do bug), para
 * os casos aprovados quando já tinham bug ligado não virarem "alterado" sozinhos.
 */
export function matchesApproval(text: string, hash: string): boolean {
  return !!hash && (hash === definitionHash(text) || hash === definitionHash(text, { links: true }));
}

export function approvalOf(text: string): Approval {
  const m = meta(text);
  const state = normalizeApproval(m.aprovacao ?? m['aprovação']);
  const hash = one(m.aprovado_hash);
  return {
    state,
    changed: state === 'aprovado' && !!hash && !matchesApproval(text, hash),
    revisor: one(m.revisor),
    por: one(m.aprovado_por),
    em: one(m.aprovado_em),
    hash,
  };
}

/** Valor para o índice/visões: rascunho · em-revisao · aprovado · alterado (aprovado e mudou) · "" (fora do fluxo). */
export function approvalKey(text: string): string {
  const a = approvalOf(text);
  return a.state === 'aprovado' && a.changed ? 'alterado' : a.state || '';
}

const pad = (n: number): string => String(n).padStart(2, '0');
const stamp = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Muda o estado. Aprovar grava quem/quando e a impressão digital da definição; voltar a rascunho ou mandar para
 * revisão tira a impressão (o "aprovado_por/em" anterior fica como registro até a próxima aprovação).
 */
export function setApproval(text: string, state: ApprovalState, o: { who?: string; now?: Date; revisor?: string } = {}): string {
  const fields: Record<string, string> = { aprovacao: state };
  if (o.revisor !== undefined) fields.revisor = o.revisor;
  if (state === 'aprovado') {
    fields.aprovado_por = o.who || '';
    fields.aprovado_em = stamp(o.now || new Date());
    fields.aprovado_hash = '-';
  } else if (meta(text).aprovado_hash !== undefined) fields.aprovado_hash = '';
  let next = setFrontMatterFields(text, fields);
  if (state === 'aprovado') next = setFrontMatterFields(next, { aprovado_hash: definitionHash(next) });
  return next;
}

/** Texto curto do estado (para pílula, lista e MCP). */
export function approvalText(a: Approval): string {
  if (!a.state) return '';
  if (a.state === 'aprovado') return a.changed ? 'Aprovado · alterado depois (aprovar de novo)' : `Aprovado${a.por ? ` por ${a.por}` : ''}${a.em ? ` em ${a.em}` : ''}`;
  if (a.state === 'em-revisao') return `Em revisão${a.revisor ? ` (${a.revisor})` : ''}`;
  return 'Rascunho';
}

/** O tipo do documento passa pela aprovação? */
export const isApprovable = (text: string): boolean => APPROVAL_TYPES.has(one(meta(text).tipo));
