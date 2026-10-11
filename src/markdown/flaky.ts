/**
 * Testes automatizados instáveis (11.5): o mesmo teste alternando PASS/FAIL entre execuções. Lê as tabelas de
 * resultado de automação que o TestFlow grava (seção "Testes automatizados" da execução, relatório de automação,
 * "Automação — …" inserida num documento), monta o histórico de cada teste e conta as trocas PASS↔FAIL.
 * Também conta como sinal de instabilidade o "flaky" do Playwright (passou depois de retry).
 * Lógica pura (sem tela), usada pela visão de tendência (app e MCP) e ao importar um relatório.
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { cellToText } from './runs.ts';
import { cellStatus, splitRow } from './status.ts';

export interface DocRef { id: string; link: string; titulo: string }

export type AutoStatus = 'PASS' | 'FAIL' | 'SKIP' | 'BLOCKED' | '';

export interface AutoTestResult {
  key: string;
  titulo: string;
  arquivo: string;
  status: AutoStatus;
  /** o Playwright marcou flaky (passou depois de retry) */
  flaky: boolean;
}

export interface AutoRun { ref: DocRef; quando: Date | null; testes: AutoTestResult[] }

export interface FlakyRow {
  key: string;
  titulo: string;
  arquivo: string;
  /** execuções consideradas (PASS/FAIL, as mais recentes até a janela) */
  execucoes: number;
  falhas: number;
  /** trocas PASS↔FAIL seguidas */
  trocas: number;
  /** vezes em que passou só depois de retry */
  retries: number;
  /** ✓ ✗ ↻ da mais antiga para a mais nova */
  sequencia: string;
  ultima: AutoStatus;
  ultimaData: Date | null;
  ultimaRef: DocRef | null;
}

const STATUS_WORD: Record<string, AutoStatus> = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP', blocked: 'BLOCKED' };
const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const base = (file: string): string => file.split(/[\\/]/).pop() || '';

/** Identidade do teste entre execuções: arquivo (sem a linha) + título. */
export function testKey(titulo: string, arquivo = ''): string {
  return `${norm(base(arquivo).replace(/:\d+(?::\d+)?$/, ''))}::${norm(titulo)}`;
}

/** `[app.spec.ts:12](vscode://…)` → `app.spec.ts:12` */
const linkLabel = (cell: string): string => cellToText(cell).replace(/^\[([^\]]*)\]\([^)]*\)$/, '$1').replace(/`/g, '').trim();

/** dd/mm/aaaa hh:mm → Date */
function dateOf(d: string, t = '00:00'): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
  const h = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), h ? Number(h[1]) : 0, h ? Number(h[2]) : 0);
}

/** Data do documento (cabeçalho `data:`/`inicio:`), se não achar a da execução. */
function docDate(text: string): Date | null {
  const fm = detectFrontMatter(text);
  if (!fm) return null;
  const data = parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data;
  const v = String(data.inicio ?? data.data ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(v);
  return iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] || 0), Number(iso[5] || 0)) : null;
}

/** Linhas da tabela de resultados de automação: cabeçalho com #, Teste/Requisição, Status/Resultado e Obs. */
function isAutoHeader(cells: string[]): { title: number; file: number; status: number; obs: number } | null {
  const n = cells.map((c) => norm(c.replace(/[*`]/g, '')));
  if (n[0] !== '#') return null;
  const title = n.findIndex((c) => c === 'teste' || c === 'requisicao');
  const status = n.findIndex((c) => c === 'status' || c === 'resultado');
  const obs = n.indexOf('obs');
  const file = n.findIndex((c) => c === 'arquivo' || c === 'endpoint');
  return title > 0 && status > 0 && obs > 0 ? { title, file, status, obs } : null;
}

/**
 * As execuções automatizadas registradas num documento (uma por tabela de resultados).
 * A data é a da execução ("Execução: dd/mm/aaaa hh:mm") ou a da importação mais próxima acima da tabela.
 */
export function automationRuns(text: string, ref: DocRef): AutoRun[] {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const runs: AutoRun[] = [];
  const fallback = docDate(text);
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const head = isAutoHeader(splitRow(lines[i]));
    if (!head) continue;
    // data: a mais próxima acima da tabela
    let quando: Date | null = null;
    for (let j = i - 1; j >= 0 && !quando; j--) {
      const m = /Execução:\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})/.exec(lines[j]) || /importado em\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})/i.exec(lines[j]);
      if (m) quando = dateOf(m[1], m[2]);
    }
    const testes: AutoTestResult[] = [];
    let k = i + 2;
    for (; k < lines.length && /^\s*\|/.test(lines[k]); k++) {
      const cells = splitRow(lines[k]);
      const titulo = cellToText(cells[head.title] || '').trim();
      if (!titulo) continue;
      const arquivo = head.file > 0 ? linkLabel(cells[head.file] || '') : '';
      const kind = cellStatus(cells[head.status]);
      testes.push({ key: testKey(titulo, arquivo), titulo, arquivo, status: kind ? STATUS_WORD[kind] || '' : '', flaky: /\bflaky\b/i.test(cells[head.obs] || '') });
    }
    if (testes.length) runs.push({ ref, quando: quando || fallback, testes });
    i = k - 1;
  }
  return runs;
}

/** Execução automatizada recém-lida (ainda não gravada) no mesmo formato. */
export function runFromTests(tests: Array<{ title: string; file?: string; status: string; flaky?: boolean }>, quando: Date, ref: DocRef): AutoRun {
  return {
    ref, quando,
    testes: tests.map((t) => {
      const arquivo = t.file || '';
      return { key: testKey(t.title, arquivo), titulo: t.title, arquivo: base(arquivo), status: STATUS_WORD[t.status] || '', flaky: !!t.flaky };
    }),
  };
}

/**
 * Testes instáveis: nas últimas `janela` execuções em que o teste passou ou falhou, trocou PASS↔FAIL pelo menos
 * `minTrocas` vezes — ou o Playwright marcou flaky (passou depois de retry). Os mais instáveis primeiro.
 */
export function flakyTests(runs: AutoRun[], { janela = 10, minTrocas = 2 }: { janela?: number; minTrocas?: number } = {}): FlakyRow[] {
  const ordered = [...runs].sort((a, b) => (a.quando?.getTime() || 0) - (b.quando?.getTime() || 0));
  const hist = new Map<string, Array<{ r: AutoTestResult; run: AutoRun }>>();
  for (const run of ordered) {
    for (const r of run.testes) {
      if (r.status !== 'PASS' && r.status !== 'FAIL') continue;
      hist.set(r.key, [...(hist.get(r.key) || []), { r, run }]);
    }
  }
  const out: FlakyRow[] = [];
  for (const [key, all] of hist) {
    const h = all.slice(-janela);
    let trocas = 0;
    for (let i = 1; i < h.length; i++) if (h[i].r.status !== h[i - 1].r.status) trocas++;
    const retries = h.filter((x) => x.r.flaky).length;
    if (trocas < minTrocas && !retries) continue;
    const last = h[h.length - 1];
    out.push({
      key, titulo: last.r.titulo, arquivo: last.r.arquivo,
      execucoes: h.length, falhas: h.filter((x) => x.r.status === 'FAIL').length, trocas, retries,
      sequencia: h.map((x) => (x.r.status === 'FAIL' ? '✗' : x.r.flaky ? '↻' : '✓')).join(''),
      ultima: last.r.status, ultimaData: last.run.quando, ultimaRef: last.run.ref,
    });
  }
  return out.sort((a, b) => b.trocas + b.retries - (a.trocas + a.retries) || b.falhas - a.falhas || a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

/** Nota curta para a coluna Obs: `⚠ instável: 3 trocas PASS↔FAIL em 8 execuções`. */
export function flakyNote(r: FlakyRow): string {
  const parts = [r.trocas ? `${r.trocas} troca${r.trocas > 1 ? 's' : ''} PASS↔FAIL` : '', r.retries ? `${r.retries}× passou só com retry` : ''].filter(Boolean);
  return `⚠ instável: ${parts.join(', ')} em ${r.execucoes} execuç${r.execucoes > 1 ? 'ões' : 'ão'}`;
}

/** Mapa chave → nota, para marcar os testes ao montar o relatório. */
export const flakyNotes = (rows: FlakyRow[]): Map<string, string> => new Map(rows.map((r) => [r.key, flakyNote(r)]));
