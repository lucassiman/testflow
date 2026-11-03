/**
 * E4 — Central de execuções: os ciclos salvos (planejados), as execuções em andamento e as finalizadas, com o que
 * cada uma precisa para ser reconhecida (ID, ciclo #N, ambiente) e o progresso. Puro: recebe os documentos.
 */
import { isCycle, isCycleDef, cycleSummary, cycleClosed, cicloOf, execNumber, configOf, defCases } from './cycle.ts';
import { headerOf } from './segment.ts';

export interface HubRun {
  path: string;
  id: string;
  titulo: string;
  /** ID do ciclo de origem ('' = rodada avulsa) */
  ciclo: string;
  numero: number;
  ambiente: string;
  inicio: Date | null;
  fim: Date | null;
  /** casos com resultado / total */
  done: number;
  total: number;
  /** FAIL + BLOCKED */
  falhas: number;
  pct: number | null;
  /** `PASS`, `FAIL`… da finalizada; 'em andamento' */
  resultado: string;
  closed: boolean;
}

export interface HubPlan {
  path: string;
  id: string;
  titulo: string;
  casos: number;
  /** execuções do ciclo (todas) */
  execucoes: number;
  /** a em andamento, se houver */
  aberta: HubRun | null;
  /** a última finalizada */
  ultima: HubRun | null;
}

export interface Hub { planejados: HubPlan[]; andamento: HubRun[]; finalizadas: HubRun[] }

const field = (text: string, name: string): string =>
  String(new RegExp(`^${name}:\\s*(.*)$`, 'm').exec(text.split(/\n---/)[0] || '')?.[1] || '').replace(/^["']|["']$/g, '').trim();
const baseName = (p: string): string => (p.split('/').pop() || p).replace(/\.(md|markdown)$/i, '');
const t = (d: Date | null): number => d?.getTime() || 0;

/** Uma execução, como a central mostra. */
export function hubRun(path: string, text: string): HubRun | null {
  if (!isCycle(text)) return null;
  const s = cycleSummary(text);
  if (!s) return null;
  const h = headerOf(text);
  const closed = cycleClosed(text);
  return {
    path, id: h.id || baseName(path), titulo: s.titulo || baseName(path), ciclo: cicloOf(text), numero: execNumber(text),
    ambiente: field(text, 'ambiente') || configOf(text), inicio: s.inicio, fim: s.fim,
    done: s.total - s.pendente, total: s.total, falhas: s.fail + s.blocked, pct: s.sucessoPct ?? (s.total === 0 ? s.auto?.sucessoPct ?? null : null),
    resultado: closed ? (field(text, 'status').toUpperCase() || 'PENDING') : 'em andamento', closed,
  };
}

/**
 * A central: planejados (ciclos salvos, com a execução aberta e a última), em andamento (as mais recentes primeiro) e
 * finalizadas (as que terminaram por último primeiro).
 */
export function runHub(docs: Array<{ path: string; text: string }>): Hub {
  const runs = docs.map((d) => hubRun(d.path, d.text)).filter((r): r is HubRun => !!r);
  const byCycle = (id: string) => runs.filter((r) => !!id && r.ciclo.toLowerCase() === id.toLowerCase());
  const planejados = docs.filter((d) => isCycleDef(d.text)).map((d): HubPlan => {
    const h = headerOf(d.text);
    const id = h.id || baseName(d.path);
    const mine = byCycle(id);
    return {
      path: d.path, id, titulo: field(d.text, 'titulo') || baseName(d.path), casos: defCases(d.text).length, execucoes: mine.length,
      aberta: mine.filter((r) => !r.closed).sort((a, b) => b.numero - a.numero || t(b.inicio) - t(a.inicio))[0] || null,
      ultima: mine.filter((r) => r.closed).sort((a, b) => t(b.fim) - t(a.fim))[0] || null,
    };
  }).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR', { numeric: true }));
  return {
    planejados,
    andamento: runs.filter((r) => !r.closed).sort((a, b) => t(b.inicio) - t(a.inicio)),
    finalizadas: runs.filter((r) => r.closed).sort((a, b) => t(b.fim) - t(a.fim) || t(b.inicio) - t(a.inicio)),
  };
}
