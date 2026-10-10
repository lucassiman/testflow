/**
 * Previsão de tempo da rodada (11.3) — funções puras, para o app e o MCP.
 *
 * Quanto falta = soma, nos casos ainda sem resultado, da duração média que cada um já teve (coluna Duração do
 * Histórico de execuções; caso com dados conta as iterações). Caso que nunca rodou entra com a média dos que têm
 * histórico nesta rodada (ou 10 min, se ninguém tem).
 */
import { runsOf } from './cycle.ts';
import { parseDur } from './trend.ts';
import { parseIterLabel } from './shared.ts';
import { fmtDuration } from './runs.ts';

/** Sem histórico nenhum na rodada: o tempo de um caso. */
export const DEFAULT_CASE_MS = 10 * 60_000;

/**
 * Duração média de uma execução completa do caso (das últimas 5): com iterações, a soma da média × o número delas.
 * null = nunca concluído com duração.
 */
export function caseAvgMs(text: string): number | null {
  const runs = runsOf(text).filter((r) => r.status).sort((a, b) => a.at.getTime() - b.at.getTime());
  const durs = runs.map((r) => parseDur(r.dur)).filter((x): x is number => x !== null && x > 0).slice(-5);
  if (!durs.length) return null;
  const avg = durs.reduce((a, b) => a + b, 0) / durs.length;
  const it = parseIterLabel(runs.at(-1)?.label || '');
  return Math.round(avg * (it && it.total > 1 ? it.total : 1));
}

export interface Forecast {
  /** casos sem resultado */
  pendentes: number;
  /** tempo estimado para eles (ms) */
  restanteMs: number;
  /** quantos não têm histórico (entram com a média) */
  semHistorico: number;
  /** a média usada para os sem histórico (ms) */
  mediaMs: number;
  /** quando termina, se começar agora */
  fim: Date;
}

/** Previsão a partir dos casos da rodada (concluídos ou não) e da média de cada um. */
export function forecast(items: Array<{ done: boolean; avgMs: number | null }>, now = new Date()): Forecast {
  const known = items.map((i) => i.avgMs).filter((x): x is number => x !== null && x > 0);
  const mediaMs = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : DEFAULT_CASE_MS;
  const open = items.filter((i) => !i.done);
  const restanteMs = open.reduce((a, i) => a + (i.avgMs && i.avgMs > 0 ? i.avgMs : mediaMs), 0);
  return { pendentes: open.length, restanteMs, semHistorico: open.filter((i) => !i.avgMs).length, mediaMs, fim: new Date(now.getTime() + restanteMs) };
}

const pad = (n: number): string => String(n).padStart(2, '0');
/** "~1 h 20 min" (arredonda para 5 min a partir de 30 min). */
export function approxDuration(ms: number): string {
  if (ms < 60_000) return '< 1 min';
  const step = ms >= 30 * 60_000 ? 5 * 60_000 : 60_000;
  return `~${fmtDuration(Math.round(ms / step) * step)}`;
}

/** Texto curto: "faltam ~1 h 20 min (14 casos) · termina ~16:40". */
export function forecastText(f: Forecast, now = new Date()): string {
  if (!f.pendentes) return 'nada pendente';
  const sameDay = f.fim.toDateString() === now.toDateString();
  const end = `${sameDay ? '' : `${pad(f.fim.getDate())}/${pad(f.fim.getMonth() + 1)} `}${pad(f.fim.getHours())}:${pad(f.fim.getMinutes())}`;
  return `faltam ${approxDuration(f.restanteMs)} (${f.pendentes} caso${f.pendentes > 1 ? 's' : ''}) · termina ~${end}`;
}

/** Explicação (para o título / MCP). */
export function forecastDetail(f: Forecast): string {
  return `Pela duração média de cada caso no histórico${f.semHistorico ? `; ${f.semHistorico} sem histórico contado(s) com a média (${approxDuration(f.mediaMs).replace('~', '')})` : ''}. Sem contar pausas e bugs a abrir.`;
}
