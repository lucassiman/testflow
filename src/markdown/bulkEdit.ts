/**
 * Edição em massa (11.2) — funções puras, para o app e o MCP: muda campos do cabeçalho de vários documentos de uma vez
 * (prioridade, responsável, épico, sprint, versão, tags a pôr/tirar, aprovação), sem mexer no resto do arquivo.
 */
import { detectFrontMatter, parseFrontMatter, formatValue } from './frontmatter.ts';
import { setApproval, normalizeApproval, type ApprovalState } from './approval.ts';

export interface BulkChange {
  prioridade?: string;
  responsavel?: string;
  epico?: string;
  sprint?: string;
  versao?: string;
  /** tags a acrescentar / tirar (sem #) */
  addTags?: string[];
  removeTags?: string[];
  aprovacao?: ApprovalState;
  /** limpar o campo (ex.: responsavel) — vale mais que o valor */
  clear?: Array<'responsavel' | 'epico' | 'sprint' | 'versao'>;
}

export const PRIORITIES = ['Crítica', 'Alta', 'Média', 'Baixa'];
const key = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const tagList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : String(v ?? '').split(/[,;]/)).map((x) => x.replace(/^#/, '').trim()).filter(Boolean);

/** "alta" → Alta; "critica" → Crítica; outro texto fica como veio. */
export function normalizePriority(v: string): string {
  const k = key(v);
  return PRIORITIES.find((p) => key(p) === k) || v.trim();
}

/** Troca (ou acrescenta) `campo: valor` (já formatado) no cabeçalho; tira as linhas de lista (`  - x`) do valor antigo. */
function setRaw(text: string, field: string, raw: string): string {
  const fm = detectFrontMatter(text);
  const line = `${field}:${raw ? ` ${raw}` : ''}`;
  if (!fm) return `---\n${line}\n---\n\n${text.replace(/^\n+/, '')}`;
  const lines = text.split('\n');
  const close = fm.end - 1;
  const at = lines.findIndex((l, i) => i > 0 && i < close && new RegExp(`^${field}[ \\t]*:`).test(l));
  if (at < 0) { lines.splice(close, 0, line); return lines.join('\n'); }
  let end = at + 1;
  while (end < close && /^\s+\S/.test(lines[end])) end++;
  lines.splice(at, end - at, line);
  return lines.join('\n');
}

function meta(text: string): Record<string, unknown> {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}

/** Aplica a mudança num documento (o que já está igual fica como está — o texto volta idêntico). */
export function applyBulk(text: string, c: BulkChange, o: { who?: string; now?: Date } = {}): string {
  let out = text;
  const m = meta(text);
  const set = (field: string, value: string) => {
    if (String(m[field] ?? '').trim() === value) return;
    out = setRaw(out, field, formatValue(value));
  };
  if (c.prioridade) set('prioridade', normalizePriority(c.prioridade));
  for (const f of ['responsavel', 'epico', 'sprint', 'versao'] as const) {
    if (c.clear?.includes(f)) { if (String(m[f] ?? '').trim()) out = setRaw(out, f, ''); continue; }
    const v = c[f];
    if (v !== undefined && v.trim()) set(f, v.trim());
  }
  if (c.addTags?.length || c.removeTags?.length) {
    const cur = tagList(m.tags);
    const drop = new Set((c.removeTags || []).map(key));
    const next = cur.filter((t) => !drop.has(key(t)));
    for (const t of (c.addTags || []).map((x) => x.replace(/^#/, '').trim()).filter(Boolean)) if (!next.some((x) => key(x) === key(t))) next.push(t);
    if (next.join('\u0000') !== cur.join('\u0000')) out = setRaw(out, 'tags', formatValue(next));
  }
  if (c.aprovacao && normalizeApproval(m.aprovacao) !== c.aprovacao) out = setApproval(out, c.aprovacao, { who: o.who, now: o.now });
  return out;
}

/** A mudança em frases (para confirmar). */
export function describeBulk(c: BulkChange): string[] {
  const out: string[] = [];
  if (c.prioridade) out.push(`prioridade → ${normalizePriority(c.prioridade)}`);
  for (const f of ['responsavel', 'epico', 'sprint', 'versao'] as const) {
    if (c.clear?.includes(f)) out.push(`${f} → (vazio)`);
    else if (c[f]?.trim()) out.push(`${f} → ${c[f]?.trim()}`);
  }
  if (c.addTags?.length) out.push(`+ tags ${c.addTags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')}`);
  if (c.removeTags?.length) out.push(`− tags ${c.removeTags.map((t) => `#${t.replace(/^#/, '')}`).join(' ')}`);
  if (c.aprovacao) out.push(`aprovação → ${c.aprovacao}`);
  return out;
}

/** Nada a mudar? */
export const emptyBulk = (c: BulkChange): boolean => !describeBulk(c).length;

/** "a, #b; c" → ['a', 'b', 'c'] */
export const splitTags = (s: string): string[] => String(s || '').split(/[\s,;]+/).map((x) => x.replace(/^#/, '').trim()).filter(Boolean);
