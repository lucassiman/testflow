/**
 * Atribuir casos na rodada (11.3) — funções puras, para o app e o MCP.
 *
 * A tabela "Casos do ciclo" da execução ganha a coluna **Testador** (criada na primeira atribuição). Dá para atribuir
 * casos a uma pessoa, distribuir os pendentes entre várias (equilibrando pelo tempo previsto ou pela quantidade) e ver
 * a carga de cada uma. "Minhas" = os atribuídos ao seu nome (o das preferências / do MCP).
 */
import { splitRow, setCell, updateSummaryBlocks, CONFIRM_TITLE } from './status.ts';
import { cycleTable, type CycleRow } from './cycle.ts';
import { findSection } from './runs.ts';
import { DEFAULT_CASE_MS } from './forecast.ts';

const CASES_TITLE = /^casos do ciclo\b/i;
const key = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const clean = (s: string): string => String(s || '').replace(/\\\|/g, '|').replace(/^@/, '').trim();

/** Mesma pessoa? ("ana", "Ana Souza", "@ana" → compara o nome inteiro ou o primeiro nome) */
export function samePerson(a: string, b: string): boolean {
  const x = key(clean(a));
  const y = key(clean(b));
  if (!x || !y) return false;
  return x === y || x.split(/\s+/)[0] === y || y.split(/\s+/)[0] === x;
}

/** Índice da coluna Testador (ou -1) — de alguma das tabelas (casos ou confirmações de bug). */
export function testerCol(text: string): number {
  const t = cycleTable(text);
  return t ? (t.cols.tester >= 0 ? t.cols.tester : t.rows.find((r) => r.cols.tester >= 0)?.cols.tester ?? -1) : -1;
}

/** Quem está com cada caso (chave em minúsculas → nome; vazio = ninguém). */
export function assignees(text: string): Map<string, string> {
  const t = cycleTable(text);
  const out = new Map<string, string>();
  if (!t) return out;
  for (const r of t.rows) out.set(r.key.toLowerCase(), r.cols.tester >= 0 ? clean(r.cells[r.cols.tester] || '') : '');
  return out;
}

/** Garante a coluna Testador no fim de cada tabela (casos e confirmações de bug); devolve o texto e se há a coluna. */
function ensureCol(text: string): { text: string; col: number } {
  const t = cycleTable(text);
  if (!t) return { text, col: -1 };
  const lines = text.split('\n');
  let col = -1;
  for (const title of [CASES_TITLE, CONFIRM_TITLE]) {
    const sec = findSection(lines, title);
    if (!sec) continue;
    for (let i = sec.start; i < sec.end - 1; i++) {
      if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
      const head = splitRow(lines[i]);
      const has = head.findIndex((h) => /^(testador|testadora|atribu[ií]do a|respons[aá]vel|executor|quem)$/i.test(h.trim()));
      if (has >= 0) { col = has; break; }
      lines[i] = `${lines[i].replace(/\s*$/, '')} Testador |`;
      lines[i + 1] = `${lines[i + 1].replace(/\s*$/, '')} --- |`;
      for (let j = i + 2; j < sec.end && lines[j].includes('|') && lines[j].trim(); j++) lines[j] = `${lines[j].replace(/\s*$/, '')}  |`;
      col = head.length;
      break;
    }
  }
  return { text: lines.join('\n'), col };
}

/** Atribui (ou tira, com `who` vazio) os casos à pessoa. `keys` vazio = nenhum. */
export function assign(text: string, keys: string[], who: string): { text: string; changed: string[] } {
  const want = new Set(keys.map((k) => k.toLowerCase()));
  if (!want.size) return { text, changed: [] };
  const e = ensureCol(text);
  if (e.col < 0) return { text, changed: [] };
  const t = cycleTable(e.text);
  if (!t) return { text, changed: [] };
  const lines = e.text.split('\n');
  const changed: string[] = [];
  for (const r of t.rows) {
    if (!want.has(r.key.toLowerCase()) || r.cols.tester < 0) continue;
    if (clean(r.cells[r.cols.tester] || '') === who.trim()) continue;
    lines[r.line] = setCell(lines[r.line], r.cols.tester, who.trim());
    changed.push(r.key);
  }
  return { text: changed.length ? updateSummaryBlocks(lines.join('\n')) : text, changed };
}

const open = (r: CycleRow): boolean => !r.status || r.status === 'PENDING';

/**
 * Distribui os casos pendentes entre as pessoas, equilibrando o tempo previsto (`avgMs` de cada caso) — ou a
 * quantidade, sem tempos. `todos`: redistribui também os pendentes já atribuídos (senão, só os sem testador, somando à
 * carga que cada um já tem).
 */
export function distribute(text: string, people: string[], o: { avgMs?: (key: string) => number | null; todos?: boolean } = {}): { text: string; plan: Map<string, string[]> } {
  const names = [...new Map(people.map((p) => clean(p)).filter(Boolean).map((p) => [key(p), p])).values()];
  const plan = new Map<string, string[]>(names.map((n) => [n, []]));
  const t = cycleTable(text);
  if (!t || !names.length) return { text, plan };
  const who = assignees(text);
  const known = t.rows.map((r) => o.avgMs?.(r.key) ?? null).filter((x): x is number => !!x && x > 0);
  const media = known.length ? known.reduce((a, b) => a + b, 0) / known.length : DEFAULT_CASE_MS;
  const cost = (k: string): number => (o.avgMs ? o.avgMs(k) || media : 1);
  const load = new Map<string, number>(names.map((n) => [n, 0]));
  // carga que já existe (pendentes atribuídos a eles, quando não é para redistribuir)
  const todo: CycleRow[] = [];
  for (const r of t.rows) {
    if (!open(r)) continue;
    const cur = who.get(r.key.toLowerCase()) || '';
    const owner = names.find((n) => samePerson(n, cur));
    if (cur && !o.todos) { if (owner) load.set(owner, (load.get(owner) || 0) + cost(r.key)); continue; }
    todo.push(r);
  }
  // o maior primeiro, sempre para quem está com menos
  todo.sort((a, b) => cost(b.key) - cost(a.key));
  for (const r of todo) {
    const n = [...load].sort((a, b) => a[1] - b[1] || names.indexOf(a[0]) - names.indexOf(b[0]))[0][0];
    load.set(n, (load.get(n) || 0) + cost(r.key));
    plan.get(n)?.push(r.key);
  }
  let out = text;
  for (const [n, keys] of plan) out = assign(out, keys, n).text;
  // a ordem da tabela fica como estava; o plano na ordem da tabela
  for (const [n, keys] of plan) plan.set(n, t.rows.map((r) => r.key).filter((k) => keys.includes(k)));
  return { text: out, plan };
}

export interface Workload { pessoa: string; total: number; feitos: number; pendentes: number; falhas: number; restanteMs: number }

/** Carga por pessoa (e "sem testador"), com o tempo previsto dos pendentes. */
export function workload(text: string, avgMs?: (key: string) => number | null): Workload[] {
  const t = cycleTable(text);
  if (!t || testerCol(text) < 0) return [];
  const who = assignees(text);
  const known = t.rows.map((r) => avgMs?.(r.key) ?? null).filter((x): x is number => !!x && x > 0);
  const media = known.length ? known.reduce((a, b) => a + b, 0) / known.length : DEFAULT_CASE_MS;
  const by = new Map<string, Workload>();
  for (const r of t.rows) {
    const p = who.get(r.key.toLowerCase()) || '';
    const k = key(p);
    const w = by.get(k) || { pessoa: p, total: 0, feitos: 0, pendentes: 0, falhas: 0, restanteMs: 0 };
    w.total++;
    if (open(r)) { w.pendentes++; w.restanteMs += Math.round(avgMs?.(r.key) || media); } else w.feitos++;
    if (r.status === 'FAIL' || r.status === 'BLOCKED') w.falhas++;
    by.set(k, w);
  }
  return [...by.values()].sort((a, b) => (a.pessoa ? 0 : 1) - (b.pessoa ? 0 : 1) || a.pessoa.localeCompare(b.pessoa, 'pt-BR'));
}

/** Os pendentes de uma pessoa (na ordem da tabela). */
export function pendingOf(text: string, who: string): string[] {
  const t = cycleTable(text);
  if (!t || !who.trim()) return [];
  const a = assignees(text);
  return t.rows.filter((r) => open(r) && samePerson(a.get(r.key.toLowerCase()) || '', who)).map((r) => r.key);
}

/** Pessoas que já aparecem na coluna Testador. */
export const testers = (text: string): string[] => [...new Map([...assignees(text).values()].filter(Boolean).map((p) => [key(p), p])).values()];
