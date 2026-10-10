/**
 * Comparar versões (11.2) — funções puras, para o app e o MCP.
 *
 *  - `sideBySide(a, b)`: linhas lado a lado (igual · removida · nova · alterada), com os números de linha, e os trechos
 *    iguais longos resumidos;
 *  - `caseChanges(a, b)`: o que mudou no CASO, em frases — campos do cabeçalho, seções, passos (novo, removido, ação ou
 *    esperado alterado), sem o que a execução muda (status, obtido, histórico, publicação, aprovação).
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { HISTORY_TITLE } from './status.ts';
import { definitionText } from './approval.ts';
import { stepTable, headings } from './runs.ts';

export type RowKind = 'eq' | 'del' | 'ins' | 'mod' | 'skip';
export interface SideRow { kind: RowKind; left: string; right: string; la: number; lb: number; skipped?: number }

/** Diff de linhas (LCS) com prefixo/sufixo iguais aparados. */
export function lineDiff(a: string[], b: string[]): Array<{ type: 'eq' | 'del' | 'ins'; a: number; b: number }> {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const n = endA - start;
  const m = endB - start;
  const out: Array<{ type: 'eq' | 'del' | 'ins'; a: number; b: number }> = [];
  for (let i = 0; i < start; i++) out.push({ type: 'eq', a: i, b: i });
  if (n * m > 4_000_000) {
    // muito grande para o LCS: tudo removido e tudo novo
    for (let i = start; i < endA; i++) out.push({ type: 'del', a: i, b: -1 });
    for (let j = start; j < endB; j++) out.push({ type: 'ins', a: -1, b: j });
  } else {
    // tabela LCS (de trás para frente) só do miolo
    const w = m + 1;
    const dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * w + j] = a[start + i] === b[start + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i] === b[start + j]) { out.push({ type: 'eq', a: start + i, b: start + j }); i++; j++; }
      else if (i < n && (j >= m || dp[(i + 1) * w + j] >= dp[i * w + j + 1])) { out.push({ type: 'del', a: start + i, b: -1 }); i++; }
      else { out.push({ type: 'ins', a: -1, b: start + j }); j++; }
    }
  }
  for (let k = 0; k < a.length - endA; k++) out.push({ type: 'eq', a: endA + k, b: endB + k });
  return out;
}

/**
 * Linhas lado a lado: removidas e novas vizinhas viram "alterada" (uma ao lado da outra); trechos iguais com mais de
 * `context * 2 + 1` linhas são resumidos (`skip`).
 */
export function sideBySide(a: string, b: string, context = 3): SideRow[] {
  const A = a.split('\n');
  const B = b.split('\n');
  const ops = lineDiff(A, B);
  const rows: SideRow[] = [];
  for (let k = 0; k < ops.length;) {
    if (ops[k].type === 'eq') { rows.push({ kind: 'eq', left: A[ops[k].a], right: B[ops[k].b], la: ops[k].a + 1, lb: ops[k].b + 1 }); k++; continue; }
    const dels: number[] = [];
    const ins: number[] = [];
    while (k < ops.length && ops[k].type !== 'eq') { if (ops[k].type === 'del') dels.push(ops[k].a); else ins.push(ops[k].b); k++; }
    const n = Math.max(dels.length, ins.length);
    for (let i = 0; i < n; i++) {
      const da = dels[i];
      const ib = ins[i];
      if (da !== undefined && ib !== undefined) rows.push({ kind: 'mod', left: A[da], right: B[ib], la: da + 1, lb: ib + 1 });
      else if (da !== undefined) rows.push({ kind: 'del', left: A[da], right: '', la: da + 1, lb: 0 });
      else rows.push({ kind: 'ins', left: '', right: B[ib], la: 0, lb: ib + 1 });
    }
  }
  // resume os trechos iguais longos
  const out: SideRow[] = [];
  for (let i = 0; i < rows.length;) {
    if (rows[i].kind !== 'eq') { out.push(rows[i]); i++; continue; }
    let j = i;
    while (j < rows.length && rows[j].kind === 'eq') j++;
    const run = rows.slice(i, j);
    const head = i === 0 ? 0 : context;
    const tail = j === rows.length ? 0 : context;
    if (run.length > head + tail + 1) {
      out.push(...run.slice(0, head));
      out.push({ kind: 'skip', left: '', right: '', la: run[head].la, lb: run[head].lb, skipped: run.length - head - tail });
      out.push(...run.slice(run.length - tail));
    } else out.push(...run);
    i = j;
  }
  return out;
}

/** Quantas linhas mudaram. */
export const changedLines = (rows: SideRow[]): number => rows.filter((r) => r.kind !== 'eq' && r.kind !== 'skip').length;

// ---------------------------------------------------------------- o que mudou no caso

/** Campos que mudam sozinhos (execução, publicação, aprovação) — não contam como mudança do caso. */
const VOLATILE = new Set(['status', 'revisao', 'publicado_em', 'publicado_por', 'publicado_hash', 'aprovacao', 'aprovado_por', 'aprovado_em', 'aprovado_hash', 'revisor', 'uid', 'qa-md']);

function meta(text: string): Record<string, unknown> {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}
const show = (v: unknown): string => (v === undefined || v === null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') || '—' : String(v));
const cut = (s: string, n = 60): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const clean = (s: string): string => s.replace(/\\\|/g, '|').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();

interface Step { id: string; acao: string; esperado: string }
function steps(text: string): Step[] {
  const t = stepTable(text);
  if (!t) return [];
  return t.rows.filter((r) => !r.blank).map((r, i) => ({
    id: t.id >= 0 ? clean(r.cells[t.id] || '') || String(i + 1) : String(i + 1),
    acao: t.action >= 0 ? clean(r.cells[t.action] || '') : '',
    esperado: t.expected >= 0 ? clean(r.cells[t.expected] || '') : '',
  }));
}

/** Seções (## título → texto), sem as da execução. */
function sections(text: string): Map<string, string> {
  const fm = detectFrontMatter(text);
  const lines = text.split('\n');
  const from = fm ? fm.end : 0;
  const hs = headings(lines).filter((h) => h.line >= from && h.level >= 2);
  const out = new Map<string, string>();
  let skip = 0; // dentro do histórico/evidências: as subseções (### Rodada N) também ficam de fora
  hs.forEach((h, i) => {
    if (skip && h.level <= skip) skip = 0;
    if (skip) return;
    if (HISTORY_TITLE.test(h.text) || /^(evid[eê]ncias|coment[aá]rios)\b/i.test(h.text)) { skip = h.level; return; }
    const end = hs.slice(i + 1).find((x) => x.level <= h.level)?.line ?? lines.length;
    // sem status/obtido (a execução não conta)
    const body = definitionText(lines.slice(h.line + 1, end).join('\n')).trim();
    out.set(h.text.trim(), body);
  });
  return out;
}

/** O que mudou de `a` (versão) para `b` (outra versão ou o documento aberto), em frases. */
export function caseChanges(a: string, b: string): string[] {
  const out: string[] = [];
  const ma = meta(a);
  const mb = meta(b);
  for (const k of [...new Set([...Object.keys(ma), ...Object.keys(mb)])]) {
    if (VOLATILE.has(k)) continue;
    const x = show(ma[k]);
    const y = show(mb[k]);
    if (x !== y) out.push(`Cabeçalho · ${k}: ${cut(x, 40)} → ${cut(y, 40)}`);
  }
  // passos: pelo # (ou a posição)
  const sa = steps(a);
  const sb = steps(b);
  const byA = new Map(sa.map((s) => [s.id, s]));
  const byB = new Map(sb.map((s) => [s.id, s]));
  for (const s of sb) {
    const o = byA.get(s.id);
    if (!o) { out.push(`Passo ${s.id} novo: ${cut(s.acao)}`); continue; }
    if (o.acao !== s.acao) out.push(`Passo ${s.id} · ação: ${cut(o.acao, 45)} → ${cut(s.acao, 45)}`);
    if (o.esperado !== s.esperado) out.push(`Passo ${s.id} · esperado: ${cut(o.esperado, 45)} → ${cut(s.esperado, 45)}`);
  }
  for (const s of sa) if (!byB.has(s.id)) out.push(`Passo ${s.id} removido: ${cut(s.acao)}`);
  // seções (fora a dos passos, já comparada)
  const xa = sections(a);
  const xb = sections(b);
  const stepSec = (body: string) => /^\s*\|?\s*#?\s*\|/m.test(body) && /a[cç][aã]o|passo/i.test(body);
  for (const [k, v] of xb) {
    if (!xa.has(k)) out.push(`Seção nova: ${k}`);
    else if (xa.get(k) !== v && !stepSec(v)) out.push(`Seção alterada: ${k}`);
  }
  for (const k of xa.keys()) if (!xb.has(k)) out.push(`Seção removida: ${k}`);
  // título do documento (# …)
  const ta = /^#\s+(.+)$/m.exec(a.slice(detectFrontMatter(a) ? a.indexOf('\n---', 3) + 4 : 0))?.[1]?.trim() || '';
  const tb = /^#\s+(.+)$/m.exec(b.slice(detectFrontMatter(b) ? b.indexOf('\n---', 3) + 4 : 0))?.[1]?.trim() || '';
  if (ta !== tb && ta && tb) out.push(`Título: ${cut(ta, 40)} → ${cut(tb, 40)}`);
  return out;
}

/** Diff unificado curto (para o MCP): -/+ com o número da linha. */
export function unifiedDiff(a: string, b: string, context = 2): string {
  return sideBySide(a, b, context).map((r) => {
    if (r.kind === 'skip') return `  ⋯ ${r.skipped} linha(s) iguais ⋯`;
    if (r.kind === 'eq') return `  ${r.right}`;
    if (r.kind === 'del') return `- ${r.left}`;
    if (r.kind === 'ins') return `+ ${r.right}`;
    return `- ${r.left}\n+ ${r.right}`;
  }).join('\n');
}
