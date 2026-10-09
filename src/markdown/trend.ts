/**
 * Tendência entre rodadas (11.1) — funções puras, usadas pela visão `formato: tendencia` no app e pelo MCP.
 *
 *  - por rodada (execução): % de sucesso, PASS/FAIL/BLOCKED/SKIP, bugs novos, duração, e a variação para a anterior;
 *  - por sprint: rodadas, % de sucesso médio, bugs novos e ainda abertos;
 *  - casos que mais falham: pelo Histórico de execuções de cada caso (rodadas FAIL/BLOCKED ÷ rodadas), com o tempo médio;
 *  - bugs por mês de abertura: abertos no mês e quantos desses já foram fechados.
 */
import { cycleSummary, isCycle, runsOf, parseStart } from './cycle.ts';
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { fmtDuration } from './runs.ts';

export interface TrendExec { id: string; link: string; titulo: string; sprint: string; text: string }
export interface TrendCase { id: string; link: string; titulo: string; text: string }
export interface TrendBug { id: string; link: string; titulo: string; open: boolean; text: string }

export interface TrendRound {
  id: string; link: string; titulo: string; sprint: string; inicio: Date | null;
  total: number; pass: number; fail: number; blocked: number; skip: number; pendente: number;
  sucessoPct: number | null; deltaPct: number | null; bugsNovos: string[]; duracaoMs: number | null; encerrada: boolean;
}
export interface TrendSprint { sprint: string; rodadas: number; sucessoPct: number | null; bugsNovos: number; bugsAbertos: number }
export interface TrendCaseRow { id: string; link: string; titulo: string; rodadas: number; falhas: number; taxa: number; ultima: string; ultimaData: Date | null; mediaMs: number | null }
export interface TrendBugMonth { mes: string; abertos: number; fechados: number; aindaAbertos: number }
export interface Trend { rounds: TrendRound[]; sprints: TrendSprint[]; cases: TrendCaseRow[]; bugMonths: TrendBugMonth[]; tempoMedioMs: number | null }

function meta(text: string): Record<string, unknown> {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}
const one = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')).trim();

/** "12 min", "1 h 05 min", "00:12:30", "12:30" → ms (null se não entender). */
export function parseDur(s: string): number | null {
  const t = (s || '').trim();
  if (!t) return null;
  const hm = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?$/i.exec(t);
  if (hm && (hm[1] || hm[2])) return ((Number(hm[1] || 0) * 60) + Number(hm[2] || 0)) * 60000;
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(t);
  if (clock) return ((Number(clock[1] || 0) * 3600) + Number(clock[2]) * 60 + Number(clock[3])) * 1000;
  return null;
}

/** Data do cabeçalho: "2026-10-09", "2026-10-09 10:00" ou "09/10/2026". */
function dateOf(v: unknown): Date | null {
  const d = parseStart(one(v));
  if (d) return d;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(one(v));
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

const avg = (xs: number[]): number | null => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pad = (n: number): string => String(n).padStart(2, '0');

/** Calcula a tendência. `limite`: quantas rodadas (as mais recentes). */
export function buildTrend(o: { execs: TrendExec[]; cases: TrendCase[]; bugs: TrendBug[]; limite?: number }): Trend {
  // ---- rodadas, da mais antiga para a mais nova
  const rounds: TrendRound[] = [];
  for (const e of o.execs) {
    if (!isCycle(e.text)) continue;
    const s = cycleSummary(e.text);
    if (!s || !s.total) continue;
    const m = meta(e.text);
    const ini = s.inicio;
    const fim = s.fim;
    // bugs novos da rodada: os que apontam a execução (execucao: EXEC-…) ou os citados nela, abertos durante a rodada
    const novos = new Set<string>();
    for (const b of o.bugs) {
      const bm = meta(b.text);
      const ex = one(bm.execucao).replace(/^\[\[|\]\]$/g, '').toLowerCase();
      const d = dateOf(bm.data);
      const inWindow = !!(d && ini && d.getTime() >= new Date(ini.getFullYear(), ini.getMonth(), ini.getDate()).getTime() && d.getTime() <= (fim || new Date()).getTime());
      if ((ex && ex === e.id.toLowerCase()) || (inWindow && s.bugs.some((k) => k.toLowerCase() === b.id.toLowerCase()))) novos.add(b.id);
    }
    rounds.push({
      id: e.id, link: e.link, titulo: e.titulo || s.titulo, sprint: e.sprint || one(m.sprint), inicio: ini,
      total: s.total, pass: s.pass, fail: s.fail, blocked: s.blocked, skip: s.skip, pendente: s.pendente,
      sucessoPct: s.sucessoPct, deltaPct: null, bugsNovos: [...novos], duracaoMs: fim ? s.duracaoMs : null, encerrada: !!fim,
    });
  }
  rounds.sort((a, b) => (a.inicio?.getTime() || 0) - (b.inicio?.getTime() || 0));
  for (let i = 1; i < rounds.length; i++) {
    const prev = rounds.slice(0, i).reverse().find((r) => r.sucessoPct !== null);
    if (prev && rounds[i].sucessoPct !== null) rounds[i].deltaPct = (rounds[i].sucessoPct as number) - (prev.sucessoPct as number);
  }
  const shown = o.limite && rounds.length > o.limite ? rounds.slice(-o.limite) : rounds;

  // ---- por sprint (na ordem em que aparecem)
  const sprints: TrendSprint[] = [];
  const bySprint = new Map<string, TrendRound[]>();
  for (const r of rounds) if (r.sprint) bySprint.set(r.sprint, [...(bySprint.get(r.sprint) || []), r]);
  for (const [sprint, list] of bySprint) {
    const pass = list.reduce((a, r) => a + r.pass, 0);
    const ran = list.reduce((a, r) => a + r.pass + r.fail + r.blocked, 0);
    const novos = new Set(list.flatMap((r) => r.bugsNovos));
    const abertos = [...novos].filter((id) => o.bugs.find((b) => b.id === id)?.open).length;
    sprints.push({ sprint, rodadas: list.length, sucessoPct: ran ? Math.round((pass / ran) * 100) : null, bugsNovos: novos.size, bugsAbertos: abertos });
  }

  // ---- casos que mais falham (Histórico de execuções de cada caso)
  const cases: TrendCaseRow[] = [];
  const allDur: number[] = [];
  for (const c of o.cases) {
    const runs = runsOf(c.text).filter((r) => r.status);
    if (!runs.length) continue;
    const durs = runs.map((r) => parseDur(r.dur)).filter((x): x is number => x !== null && x > 0);
    allDur.push(...durs);
    const falhas = runs.filter((r) => r.status === 'FAIL' || r.status === 'BLOCKED').length;
    const last = [...runs].sort((a, b) => a.at.getTime() - b.at.getTime()).at(-1);
    cases.push({ id: c.id, link: c.link, titulo: c.titulo, rodadas: runs.length, falhas, taxa: Math.round((falhas / runs.length) * 100), ultima: last?.status || '', ultimaData: last?.at || null, mediaMs: avg(durs) });
  }
  cases.sort((a, b) => b.falhas - a.falhas || b.taxa - a.taxa || a.id.localeCompare(b.id, 'pt-BR', { numeric: true }));

  // ---- bugs por mês de abertura
  const months = new Map<string, TrendBugMonth>();
  for (const b of o.bugs) {
    const d = dateOf(meta(b.text).data);
    if (!d) continue;
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const m = months.get(k) || { mes: k, abertos: 0, fechados: 0, aindaAbertos: 0 };
    m.abertos++;
    if (b.open) m.aindaAbertos++; else m.fechados++;
    months.set(k, m);
  }
  const bugMonths = [...months.values()].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12);

  return { rounds: shown, sprints, cases: cases.filter((c) => c.falhas > 0).slice(0, 10), bugMonths, tempoMedioMs: avg(allDur) };
}

/** "2026-10" → "out/2026" */
export const monthLabel = (k: string): string => {
  const [y, m] = k.split('-');
  return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1] || m}/${y}`;
};
export const durLabel = (ms: number | null): string => (ms === null ? '—' : ms < 60000 ? `${Math.round(ms / 1000)} s` : fmtDuration(ms));
