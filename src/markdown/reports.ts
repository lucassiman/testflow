/**
 * Relatórios de fim de execução (Fase 10.2): quatro documentos separados, gerados a partir do documento da execução e
 * dos documentos da pasta (casos, bugs, plano de teste, execução anterior). Nomes adaptados da ISO/IEC/IEEE 29119-3.
 *
 *   relatorios/<EXEC-ID>/01-encerramento.md     Encerramento + Go/No-Go (critérios de saída do plano, recomendação, aceite)
 *   relatorios/<EXEC-ID>/02-defeitos.md         Defeitos da rodada (novos, reabertos, ainda abertos; por severidade e caso)
 *   relatorios/<EXEC-ID>/03-rastreabilidade.md  Rastreabilidade e cobertura (requisito → casos → resultado → bugs)
 *   relatorios/<EXEC-ID>/04-log-comparativo.md  Log da execução + comparação com a execução anterior
 *
 * Lógica pura (sem tela e sem disco): o app e o MCP passam os textos e gravam o resultado. Regerar preserva o que o QA
 * escreveu nos trechos `<!-- qa:manual:nome -->` … `<!-- /qa:manual -->` (comentários, decisão e aceite).
 */
import { detectFrontMatter, parseFrontMatter, formatValue } from './frontmatter.ts';
import { splitRow, normHeader, cellStatus, HISTORY_TITLE } from './status.ts';
import { findSection } from './runs.ts';
import { cycleTable, cycleSummary, parseStart, isCycle, EXEC_TYPE, type CycleSummary } from './cycle.ts';
import { readLinks } from './linkTypes.ts';
import { jiraValues, jiraLabel } from './jiraLink.ts';
import type { StatusWord } from '../types';

export interface RDoc { path: string; text: string }

export type ReportKind = 'encerramento' | 'defeitos' | 'rastreabilidade' | 'log';

export const REPORTS: Array<{ kind: ReportKind; file: string; suffix: string; tipo: string; titulo: string; icon: string }> = [
  { kind: 'encerramento', file: '01-encerramento.md', suffix: 'ENC', tipo: 'relatorio-encerramento', titulo: 'Encerramento e Go/No-Go', icon: '🏁' },
  { kind: 'defeitos', file: '02-defeitos.md', suffix: 'DEF', tipo: 'relatorio-defeitos', titulo: 'Defeitos da rodada', icon: '🐞' },
  { kind: 'rastreabilidade', file: '03-rastreabilidade.md', suffix: 'RAS', tipo: 'relatorio-rastreabilidade', titulo: 'Rastreabilidade e cobertura', icon: '🧭' },
  { kind: 'log', file: '04-log-comparativo.md', suffix: 'LOG', tipo: 'relatorio-log', titulo: 'Log da execução e comparativo', icon: '📜' },
];
export const REPORT_TYPES = REPORTS.map((r) => r.tipo);
export const REPORTS_DIR = 'relatorios';

// ---------------------------------------------------------------- utilidades
const pad = (n: number): string => String(n).padStart(2, '0');
const dmy = (d: Date): string => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const hm = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm(d)}`;
const cell = (s: unknown): string => String(s ?? '').replace(/\r?\n/g, ' ').replace(/(^|[^\\])\|/g, '$1\\|').trim();
const badge = (s: string | null | undefined): string => (s ? `\`${s}\`` : '—');
const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const baseName = (p: string): string => (p.split('/').pop() || p).replace(/\.(md|markdown)$/i, '');
const dirOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const fmtMs = (ms: number): string => {
  const min = Math.round(ms / 60000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${pad(min % 60)} min`;
};

function meta(text: string): Record<string, unknown> {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}
const str = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).trim();
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : String(v ?? '').split(/[,;]+/)).map((x) => x.replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean);

/** Índice dos documentos por id e por nome de arquivo (o que um [[link]] usa). */
class Docs {
  readonly all: Array<RDoc & { data: Record<string, unknown>; id: string; tipo: string }>;
  private by = new Map<string, RDoc & { data: Record<string, unknown>; id: string; tipo: string }>();
  constructor(docs: RDoc[]) {
    this.all = docs.map((d) => { const data = meta(d.text); return { ...d, data, id: str(data.id), tipo: str(data.tipo) }; });
    for (const d of this.all) {
      this.by.set(baseName(d.path).toLowerCase(), d);
      this.by.set(d.path.toLowerCase(), d);
    }
    for (const d of this.all) if (d.id) this.by.set(d.id.toLowerCase(), d);
  }
  get(key: string) { const k = key.replace(/^\[\[|\]\]$/g, '').split(/[|#]/)[0].trim().toLowerCase(); return this.by.get(k) || this.by.get(k.replace(/\.(md|markdown)$/i, '')) || null; }
}

const keyOfDoc = (d: { id: string; path: string }): string => d.id || baseName(d.path);
const targetsOf = (text: string): string[] => [...text.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim().toLowerCase());

// ---------------------------------------------------------------- trechos manuais (preservados ao regerar)
const MANUAL_RE = /<!-- qa:manual:([\w-]+) -->\n?([\s\S]*?)<!-- \/qa:manual -->/g;
const manual = (name: string, body: string): string[] => [`<!-- qa:manual:${name} -->`, body, '<!-- /qa:manual -->'];

/** Leva para o texto novo o que o QA escreveu nos trechos manuais do texto antigo (mesmo nome). */
export function keepManual(oldText: string | null | undefined, next: string): string {
  if (!oldText) return next;
  const kept = new Map<string, string>();
  for (const m of oldText.matchAll(MANUAL_RE)) kept.set(m[1], m[2]);
  return next.replace(MANUAL_RE, (all, name: string) => (kept.has(name) ? `<!-- qa:manual:${name} -->\n${kept.get(name)}<!-- /qa:manual -->` : all));
}

// ---------------------------------------------------------------- dados da rodada
export interface CaseRun { key: string; titulo: string; status: StatusWord | null; when: string; bugs: string[]; path: string | null }
interface LogRow { key: string; titulo: string; inicio: Date | null; fim: Date | null; duracao: string; responsavel: string; ambiente: string; resultado: StatusWord | null; ms: number }
interface BugInfo {
  key: string; path: string; titulo: string; status: string; open: boolean; severidade: string; prioridade: string; jira: string;
  casos: string[]; criado: Date | null; recorrencias: Date[]; nova: boolean; reaberta: boolean;
}
interface Criterion { texto: string; esperado: string; obtido: string; ok: boolean | null; origem: string }

export interface ReportData {
  execPath: string; execId: string; titulo: string; numero: number; ciclo: string; app: string; versao: string; ambiente: string; dispositivo: string;
  responsavel: string; inicio: Date | null; fim: Date | null; closed: boolean; overall: string; links: Record<string, string[]>; tags: string[];
  summary: CycleSummary; casos: CaseRun[]; log: LogRow[]; bugs: BugInfo[];
  plan: { key: string; titulo: string; how: string } | null; criteria: Criterion[];
  previous: { key: string; titulo: string; numero: number; casos: Map<string, StatusWord | null>; pct: number | null } | null;
  now: Date;
}

const CLOSED_RE = /^(pass|skip|fechad|resolvid|closed|done|conclu|corrigid|cancelad|nao (e|eh) bug|invalid)/;
const bugClosed = (status: string): boolean => CLOSED_RE.test(norm(status));

/** Linhas da tabela de registro do Histórico de execuções de um caso (Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável). */
function historyRows(text: string): Array<{ inicio: Date; fim: Date; duracao: string; ambiente: string; resultado: StatusWord | null; responsavel: string }> {
  const lines = text.split('\n');
  const sec = findSection(lines, HISTORY_TITLE);
  if (!sec) return [];
  const out: Array<{ inicio: Date; fim: Date; duracao: string; ambiente: string; resultado: StatusWord | null; responsavel: string }> = [];
  for (let i = sec.start; i < sec.end - 1; i++) {
    if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const head = splitRow(lines[i]).map(normHeader);
    const c = (n: string) => head.indexOf(n);
    if (c('rodada') < 0 || c('data') < 0 || c('resultado') < 0) continue;
    for (let j = i + 2; j < sec.end && lines[j].includes('|') && lines[j].trim(); j++) {
      const cells = splitRow(lines[j]);
      const d = /^(\d{2})\/(\d{2})\/(\d{4})/.exec((cells[c('data')] || '').trim());
      if (!d) continue;
      const day = [Number(d[3]), Number(d[2]) - 1, Number(d[1])] as const;
      const t = /^(\d{1,2}):(\d{2})/.exec((cells[c('inicio')] || '').trim());
      const f = /^(\d{1,2}):(\d{2})/.exec((cells[c('fim')] || '').trim());
      const inicio = new Date(...day, t ? Number(t[1]) : 0, t ? Number(t[2]) : 0);
      let fim = f ? new Date(...day, Number(f[1]), Number(f[2])) : inicio;
      if (fim < inicio) fim = new Date(fim.getTime() + 86400000);
      const kind = cellStatus(cells[c('resultado')]);
      out.push({
        inicio, fim, duracao: c('duracao') >= 0 ? (cells[c('duracao')] || '').trim() : '', ambiente: c('ambiente') >= 0 ? (cells[c('ambiente')] || '').trim() : '',
        resultado: kind ? (kind.toUpperCase() as StatusWord) : null, responsavel: c('responsavel') >= 0 ? (cells[c('responsavel')] || '').trim() : '',
      });
    }
    break;
  }
  return out;
}

/** Datas das reincidências registradas no bug ("### dd/mm/aaaa hh:mm — [[caso]]" em "## Reincidências"). */
function recurrences(text: string): Date[] {
  const lines = text.split('\n');
  const sec = findSection(lines, /^reincid[eê]ncias?\b/i);
  if (!sec) return [];
  const out: Date[] = [];
  for (let i = sec.start; i < sec.end; i++) {
    const m = /^#{3,6}\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/.exec(lines[i]);
    if (m) out.push(new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5])));
  }
  return out;
}

/** Critérios de saída do plano: itens "- [ ] …" da seção "Critérios de saída" (ou "Critérios de aceite"). */
export function planCriteria(text: string): Array<{ texto: string; done: boolean }> {
  const lines = text.split('\n');
  const sec = findSection(lines, /^crit[eé]rios? de (sa[ií]da|aceite|encerramento|conclus[aã]o)\b/i);
  if (!sec) return [];
  const out: Array<{ texto: string; done: boolean }> = [];
  for (let i = sec.start; i < sec.end; i++) {
    const m = /^\s*[-*+]\s+(?:\[([ xX])\]\s+)?(.+)$/.exec(lines[i]);
    if (m) out.push({ texto: m[2].trim(), done: !!m[1] && m[1] !== ' ' });
  }
  return out;
}

const SEVERE = ['critica', 'critico', 'bloqueante', 'blocker', 'alta', 'alto', 'high', 'critical', 'urgente'];
const sevRank = (s: string): number => {
  const n = norm(s);
  if (/^(critic|bloqueant|blocker|urgent)/.test(n)) return 0;
  if (/^(alt|high|major|grave)/.test(n)) return 1;
  if (/^(medi|normal|moder)/.test(n)) return 2;
  if (/^(baix|low|minor|trivial)/.test(n)) return 3;
  return 4;
};
const SEV_LABEL = ['Crítica', 'Alta', 'Média', 'Baixa', 'Sem severidade'];

/**
 * Avalia um critério de saída escrito em texto livre. Reconhece: bugs de severidade abertos ("nenhum bug crítico ou
 * alto aberto"), % executado ("100% dos casos executados"), % de sucesso ("≥ 95% de sucesso") e bloqueios ("sem
 * BLOCKED"). O resto fica para o QA avaliar (ok = null).
 */
export function evalCriterion(texto: string, d: { total: number; executados: number; pct: number | null; blocked: number; openBugs: Array<{ severidade: string }> }, origem = 'plano'): Criterion {
  const n = norm(texto);
  const pctM = /(\d{1,3})\s*%/.exec(n);
  if (/\bbugs?\b|defeito/.test(n) && /(nenhum|sem |zero|0 )/.test(n)) {
    const levels = SEVERE.filter((s) => n.includes(s));
    const ranks = new Set(levels.length ? levels.map(sevRank) : [0, 1, 2, 3, 4]);
    const hits = d.openBugs.filter((b) => ranks.has(sevRank(b.severidade)));
    return { texto, esperado: levels.length ? `0 abertos (${[...ranks].sort().map((r) => SEV_LABEL[r]).join(', ')})` : '0 abertos', obtido: `${hits.length} aberto(s)`, ok: hits.length === 0, origem };
  }
  if (pctM && /execut/.test(n)) {
    const want = Number(pctM[1]);
    const got = d.total ? Math.round((d.executados / d.total) * 100) : 0;
    return { texto, esperado: `≥ ${want}% executados`, obtido: `${got}% (${d.executados}/${d.total})`, ok: got >= want, origem };
  }
  if (pctM && /(sucesso|aprova|passa|pass\b)/.test(n)) {
    const want = Number(pctM[1]);
    return { texto, esperado: `≥ ${want}% de sucesso`, obtido: d.pct == null ? 'sem casos executados' : `${d.pct}%`, ok: d.pct != null && d.pct >= want, origem };
  }
  if (/(bloquead|blocked|bloqueio)/.test(n) && /(nenhum|sem |zero|0 )/.test(n)) {
    return { texto, esperado: '0 BLOCKED', obtido: `${d.blocked} BLOCKED`, ok: d.blocked === 0, origem };
  }
  return { texto, esperado: 'avaliar', obtido: '—', ok: null, origem };
}

const DEFAULT_CRITERIA = ['Nenhum bug Crítico ou Alto aberto', '100% dos casos executados', 'Nenhum caso BLOCKED', '95% de sucesso nos casos executados'];

/** Junta tudo o que os relatórios precisam. `execPath` precisa estar em `docs`. */
export function reportData(execPath: string, input: RDoc[], now = new Date()): ReportData | null {
  const docs = new Docs(input);
  const exec = docs.all.find((d) => d.path === execPath);
  if (!exec || !isCycle(exec.text)) return null;
  const m = exec.data;
  const summary = cycleSummary(exec.text, now);
  const t = cycleTable(exec.text);
  if (!summary || !t) return null;
  const inicio = parseStart(m.inicio);
  const fim = parseStart(m.fim);
  const end = fim || now;
  const casos: CaseRun[] = t.rows.map((r) => {
    const doc = docs.get(r.key);
    const tituloCell = t.cols.caso + 1 < r.cells.length ? r.cells[t.cols.caso + 1] : '';
    return {
      key: r.key, titulo: tituloCell.replace(/\[\[|\]\]/g, '').replace(/\\\|/g, '|').trim() || str(doc?.data.titulo),
      status: r.status && r.status !== 'PENDING' ? r.status : null,
      when: t.cols.when >= 0 ? (r.cells[t.cols.when] || '').trim() : '',
      bugs: t.cols.bugs >= 0 ? [...(r.cells[t.cols.bugs] || '').matchAll(/\[\[([^\]|#]+)/g)].map((x) => x[1].trim()) : [],
      path: doc?.path || null,
    };
  });

  // log: a rodada de cada caso que terminou dentro da execução
  const from = inicio ? new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), inicio.getHours(), inicio.getMinutes()).getTime() : 0;
  const log: LogRow[] = casos.map((c) => {
    const doc = c.path ? docs.get(c.path) : null;
    const rows = doc ? historyRows(doc.text).filter((h) => h.fim.getTime() >= from && h.fim.getTime() <= end.getTime() + 60000) : [];
    const h = rows.at(-1);
    return {
      key: c.key, titulo: c.titulo, inicio: h?.inicio || null, fim: h?.fim || null, duracao: h?.duracao || '',
      responsavel: h?.responsavel || '', ambiente: h?.ambiente || '', resultado: c.status || h?.resultado || null,
      ms: h ? h.fim.getTime() - h.inicio.getTime() : 0,
    };
  }).sort((a, b) => (a.inicio?.getTime() ?? Infinity) - (b.inicio?.getTime() ?? Infinity));

  // bugs: os da coluna Bugs e os que citam algum caso da rodada
  const caseKeys = new Set(casos.flatMap((c) => { const d = docs.get(c.key); return [c.key.toLowerCase(), ...(d ? [d.id.toLowerCase(), baseName(d.path).toLowerCase()] : [])].filter(Boolean); }));
  const bugDocs = new Map<string, (typeof docs.all)[number]>();
  for (const c of casos) for (const b of c.bugs) { const d = docs.get(b); if (d) bugDocs.set(d.path, d); }
  for (const d of docs.all) if (d.tipo === 'bug' && targetsOf(d.text).some((k) => caseKeys.has(k))) bugDocs.set(d.path, d);
  const day0 = inicio ? new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()).getTime() : 0;
  const bugs: BugInfo[] = [...bugDocs.values()].map((d) => {
    const status = str(d.data.status);
    const criado = parseStart(d.data.data) || parseStart(d.data.criado);
    const rec = recurrences(d.text);
    const linked = casos.filter((c) => c.bugs.some((b) => docs.get(b)?.path === d.path) || targetsOf(d.text).includes(c.key.toLowerCase()) || (c.path && targetsOf(d.text).includes(baseName(c.path).toLowerCase()))).map((c) => c.key);
    const inWindow = (x: Date) => x.getTime() >= from && x.getTime() <= end.getTime() + 60000;
    return {
      key: keyOfDoc(d), path: d.path, titulo: str(d.data.titulo), status, open: !status || !bugClosed(status),
      severidade: str(d.data.severidade), prioridade: str(d.data.prioridade), jira: jiraValues(d.data.jira).map(jiraLabel).join(', '),
      casos: [...new Set(linked)], criado, recorrencias: rec.filter(inWindow),
      nova: !!criado && criado.getTime() >= day0 && criado.getTime() <= end.getTime(), reaberta: rec.some(inWindow),
    };
  }).sort((a, b) => sevRank(a.severidade) - sevRank(b.severidade) || a.key.localeCompare(b.key, 'pt-BR', { numeric: true }));
  // os da coluna Bugs que não existem na pasta: abertos (não dá para saber)
  for (const c of casos) for (const b of c.bugs) if (!docs.get(b) && !bugs.some((x) => x.key.toLowerCase() === b.toLowerCase())) {
    bugs.push({ key: b, path: '', titulo: '', status: '', open: true, severidade: '', prioridade: '', jira: '', casos: [c.key], criado: null, recorrencias: [], nova: false, reaberta: false });
  }

  // plano de teste: o do vínculo `plano:`; senão o que cita mais casos da rodada
  const links = readLinks(exec.text);
  let plan: ReportData['plan'] = null;
  let planDoc: (typeof docs.all)[number] | null = null;
  const planRef = list(m.plano)[0];
  if (planRef) { planDoc = docs.get(planRef); if (planDoc) plan = { key: keyOfDoc(planDoc), titulo: str(planDoc.data.titulo), how: 'ligado à execução (campo plano:)' }; }
  if (!planDoc) {
    const ranked = docs.all.filter((d) => d.tipo === 'plano-de-teste').map((d) => ({ d, hits: new Set(targetsOf(d.text).filter((k) => caseKeys.has(k))).size }))
      .filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits || b.d.path.localeCompare(a.d.path));
    if (ranked[0]) { planDoc = ranked[0].d; plan = { key: keyOfDoc(planDoc), titulo: str(planDoc.data.titulo), how: `encontrado pelos casos que ele cita (${ranked[0].hits} desta rodada) — ligue com o campo plano: para fixar` }; }
  }
  const executados = summary.pass + summary.fail + summary.blocked;
  const evalData = { total: summary.total, executados, pct: summary.sucessoPct, blocked: summary.blocked, openBugs: bugs.filter((b) => b.open) };
  const fromPlan = planDoc ? planCriteria(planDoc.text) : [];
  const criteria = fromPlan.length
    ? fromPlan.map((c) => { const r = evalCriterion(c.texto, evalData, `plano ${plan?.key}`); return r.ok === null && c.done ? { ...r, obtido: 'marcado no plano', ok: true } : r; })
    : DEFAULT_CRITERIA.map((c) => evalCriterion(c, evalData, 'padrão do TestFlow'));

  // execução anterior: a #N-1 do mesmo ciclo; avulsa: a última execução encerrada antes, com casos em comum
  const ciclo = str(m.ciclo).replace(/^\[\[|\]\]$/g, '');
  const numero = Number(m.numero) || 0;
  const execs = docs.all.filter((d) => d.path !== exec.path && isCycle(d.text));
  let prev: (typeof docs.all)[number] | null = null;
  if (ciclo) prev = execs.filter((d) => str(d.data.ciclo).replace(/^\[\[|\]\]$/g, '').toLowerCase() === ciclo.toLowerCase() && (Number(d.data.numero) || 0) < numero).sort((a, b) => (Number(b.data.numero) || 0) - (Number(a.data.numero) || 0))[0] || null;
  if (!prev && inicio) {
    const mine = new Set(casos.map((c) => (docs.get(c.key)?.path || c.key).toLowerCase()));
    prev = execs.filter((d) => { const s = parseStart(d.data.inicio); return !!s && s < inicio && !!str(d.data.fim) && (cycleTable(d.text)?.rows || []).some((r) => mine.has((docs.get(r.key)?.path || r.key).toLowerCase())); })
      .sort((a, b) => (parseStart(b.data.inicio)?.getTime() || 0) - (parseStart(a.data.inicio)?.getTime() || 0))[0] || null;
  }
  let previous: ReportData['previous'] = null;
  if (prev) {
    const ps = cycleSummary(prev.text, now);
    const map = new Map<string, StatusWord | null>();
    for (const r of cycleTable(prev.text)?.rows || []) map.set((docs.get(r.key)?.path || r.key).toLowerCase(), r.status && r.status !== 'PENDING' ? r.status : null);
    previous = { key: keyOfDoc(prev), titulo: str(prev.data.titulo), numero: Number(prev.data.numero) || 0, casos: map, pct: ps?.sucessoPct ?? null };
  }

  return {
    execPath, execId: str(m.id) || baseName(execPath), titulo: summary.titulo, numero, ciclo, app: str(m.app), versao: str(m.versao), ambiente: str(m.ambiente),
    dispositivo: str(m.dispositivo), responsavel: str(m.responsavel), inicio, fim, closed: !!fim, overall: str(m.status) || 'PENDING', links, tags: list(m.tags),
    summary, casos, log, bugs, plan, criteria, previous, now,
  };
}

// ---------------------------------------------------------------- os documentos
export interface ReportFile { kind: ReportKind; path: string; id: string; titulo: string; tipo: string; text: string }

/** Pasta dos relatórios de uma execução: relatorios/<EXEC-ID>/ ao lado dela. */
export const reportsDir = (execPath: string, execId: string): string => [dirOf(execPath), REPORTS_DIR, execId.replace(/[\\/:*?"<>|]+/g, '-')].filter(Boolean).join('/');

function header(d: ReportData, r: (typeof REPORTS)[number], extra: Record<string, string> = {}): string[] {
  // herança da execução (que herdou do ciclo e dos casos): tags, ticket, épico, sprint, ciclo e plano
  const tags = [...new Map(['relatorio', ...d.tags].map((t) => [t.toLowerCase(), t])).values()];
  const f: Array<[string, string | string[]]> = [
    ['tipo', r.tipo], ['id', `${d.execId}-${r.suffix}`], ['titulo', `${r.titulo} — ${d.titulo}`], ['execucao', d.execId],
    ...(d.ciclo ? [['ciclo', d.ciclo] as [string, string]] : []),
    ...(d.plan ? [['plano', d.plan.key] as [string, string]] : []),
    ...(d.app ? [['app', d.app] as [string, string]] : []), ...(d.versao ? [['versao', d.versao] as [string, string]] : []),
    ...((d.links.jira || []).length ? [['jira', d.links.jira] as [string, string[]]] : []),
    ...((d.links.epico || []).length ? [['epico', d.links.epico] as [string, string[]]] : []),
    ...((d.links.sprint || []).length ? [['sprint', d.links.sprint[0]] as [string, string]] : []),
    ...Object.entries(extra),
    ['gerado', iso(d.now)], ['tags', tags], ['qa-md', '1'],
  ];
  return ['---', ...f.map(([k, v]) => `${k}: ${k === 'qa-md' ? v : formatValue(v)}`), '---', ''];
}

function intro(d: ReportData, r: (typeof REPORTS)[number]): string[] {
  const period = `${d.inicio ? `${dmy(d.inicio)} ${hm(d.inicio)}` : '?'} → ${d.fim ? `${dmy(d.fim)} ${hm(d.fim)}` : 'em andamento'}`;
  return [
    `# ${r.icon} ${r.titulo} — ${d.titulo}`, '',
    `Execução [[${d.execId}]]${d.ciclo ? ` (#${d.numero} do ciclo [[${d.ciclo}]])` : ''} · ${period}${d.versao ? ` · versão ${d.versao}` : ''}${d.ambiente ? ` · ${d.ambiente}` : ''}${d.dispositivo ? ` · ${d.dispositivo}` : ''}.`,
    ...(d.closed ? [] : ['', '> [!WARNING]', '> Parcial: a execução ainda não foi finalizada. Regere depois do 🏁 Finalizar execução.']),
    '',
  ];
}

const pctOf = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)}%` : '—');

function encerramento(d: ReportData): string {
  const r = REPORTS[0];
  const s = d.summary;
  const executados = s.pass + s.fail + s.blocked;
  const failed = d.criteria.filter((c) => c.ok === false);
  const pendingManual = d.criteria.filter((c) => c.ok === null);
  const openBugs = d.bugs.filter((b) => b.open);
  const rec = failed.length ? 'NÃO LIBERAR' : pendingManual.length || s.skip || s.pendente || openBugs.length ? 'LIBERAR COM RESSALVAS' : 'LIBERAR';
  const recWhy = failed.length
    ? `${failed.length} critério(s) de saída não atingido(s): ${failed.map((c) => c.texto).join('; ')}.`
    : [pendingManual.length && `${pendingManual.length} critério(s) para o QA avaliar`, s.skip && `${s.skip} caso(s) não executado(s) (SKIP)`, s.pendente && `${s.pendente} pendente(s)`, openBugs.length && `${openBugs.length} bug(s) aberto(s) de menor severidade`].filter(Boolean).join(' · ') || 'todos os critérios atingidos, nada pendente.';
  const mark = (ok: boolean | null) => (ok === true ? '✅' : ok === false ? '❌' : '⚠️ avaliar');
  const lines = [
    ...header(d, r, { status: d.overall, recomendacao: rec }),
    ...intro(d, r),
    '## Resultado geral', '',
    '| Indicador | Valor |', '| --- | --- |',
    `| Resultado | ${badge(d.overall)} |`,
    `| Casos | ${s.total} — ${s.pass} PASS · ${s.fail} FAIL · ${s.blocked} BLOCKED · ${s.skip} SKIP${s.pendente ? ` · ${s.pendente} pendente(s)` : ''} |`,
    `| Executados | ${executados} de ${s.total} (${pctOf(executados, s.total)}) |`,
    `| Sucesso | ${s.sucessoPct == null ? '—' : `${s.sucessoPct}%`} (PASS ÷ executados) |`,
    `| Duração | ${s.duracaoMs == null ? '—' : fmtMs(s.duracaoMs)} |`,
    `| Bugs | ${d.bugs.length} ligado(s) · ${openBugs.length} aberto(s) |`,
    ...(s.auto ? [`| Automatizados (${cell(s.auto.tool)}) | ${s.auto.total} — ${s.auto.pass} PASS · ${s.auto.fail} FAIL${s.auto.skip ? ` · ${s.auto.skip} SKIP` : ''}${s.auto.sucessoPct == null ? '' : ` (${s.auto.sucessoPct}%)`} |`] : []),
    ...(d.responsavel ? [`| Responsável | ${cell(d.responsavel)} |`] : []),
    '',
    '## Critérios de saída', '',
    d.plan ? `Do plano [[${d.plan.key}]]${d.plan.titulo ? ` — ${d.plan.titulo}` : ''} (${d.plan.how}).` : 'Nenhum plano de teste ligado a esta execução: critérios **padrão do TestFlow**. Ligue um plano com o campo `plano:` da execução (🔗 Vínculos) para usar os critérios dele.',
    '',
    '| Critério | Esperado | Obtido | Atingido |', '| --- | --- | --- | --- |',
    ...d.criteria.map((c) => `| ${cell(c.texto)} | ${cell(c.esperado)} | ${cell(c.obtido)} | ${mark(c.ok)} |`),
    '',
    '## Riscos e pendências', '',
    ...(s.problemas.length ? ['**Falhas e bloqueios:**', '', ...s.problemas.map((p) => `- [[${p.key}]] ${badge(p.status)}${p.bugs.length ? ` — ${p.bugs.map((b) => `[[${b}]]`).join(', ')}` : ' — sem bug ligado'}`), ''] : []),
    ...(s.skipped.length ? [`**Não executados (SKIP):** ${s.skipped.map((k) => `[[${k}]]`).join(', ')}`, ''] : []),
    ...(openBugs.length ? ['**Bugs abertos:**', '', ...openBugs.map((b) => `- [[${b.key}]]${b.titulo ? ` — ${cell(b.titulo)}` : ''}${b.severidade ? ` · severidade ${b.severidade}` : ''}${b.jira ? ` · ${b.jira}` : ''}`), ''] : []),
    ...(!s.problemas.length && !s.skipped.length && !openBugs.length ? ['Nenhuma falha, bloqueio, caso pulado ou bug aberto.', ''] : []),
    ...manual('riscos', '<!-- Riscos, contornos e observações do QA (preservado ao regerar) -->\n'),
    '',
    '## Recomendação', '',
    `**Sugestão do TestFlow: ${rec}** — ${recWhy}`, '',
    '> [!NOTE]', '> A sugestão sai dos critérios de saída. A decisão é do time: registre abaixo.', '',
    '## Decisão e aceite', '',
    ...manual('aceite', '| Campo | Valor |\n| --- | --- |\n| Decisão | (Liberar / Liberar com ressalvas / Não liberar) |\n| Ressalvas | |\n| Aprovado por | |\n| Data | |\n'),
    '',
  ];
  return lines.join('\n');
}

function defeitos(d: ReportData): string {
  const r = REPORTS[1];
  const s = d.summary;
  const executados = s.pass + s.fail + s.blocked;
  const novos = d.bugs.filter((b) => b.nova);
  const reabertos = d.bugs.filter((b) => b.reaberta && !b.nova);
  const abertos = d.bugs.filter((b) => b.open && !b.nova && !b.reaberta);
  const fechados = d.bugs.filter((b) => !b.open && !b.nova && !b.reaberta);
  const row = (b: BugInfo) => `| [[${b.key}]] | ${cell(b.titulo)} | ${cell(b.severidade) || '—'} | ${b.status ? badge(b.status) : '—'} | ${b.casos.map((k) => `[[${k}]]`).join(', ') || '—'} | ${cell(b.jira) || '—'} |`;
  const table = (bs: BugInfo[], empty: string) => (bs.length ? ['| Bug | Título | Severidade | Status | Casos | Jira |', '| --- | --- | --- | --- | --- | --- |', ...bs.map(row), ''] : [empty, '']);
  const bySev = new Map<number, number>();
  for (const b of d.bugs.filter((x) => x.open || x.nova || x.reaberta)) bySev.set(sevRank(b.severidade), (bySev.get(sevRank(b.severidade)) || 0) + 1);
  const found = novos.length + reabertos.length;
  const byCase = d.casos.map((c) => ({ c, bs: d.bugs.filter((b) => b.casos.includes(c.key)) })).filter((x) => x.bs.length);
  return [
    ...header(d, r),
    ...intro(d, r),
    '## Visão geral', '',
    '| Indicador | Valor |', '| --- | --- |',
    `| Novos nesta rodada | ${novos.length} |`,
    `| Reabertos (reincidência) | ${reabertos.length} |`,
    `| Ainda abertos (de antes) | ${abertos.length} |`,
    `| Fechados ligados aos casos | ${fechados.length} |`,
    `| Densidade | ${executados ? `${(found / executados).toFixed(2).replace('.', ',')} bug(s) novo(s)/reaberto(s) por caso executado (${found} em ${executados})` : '—'} |`,
    '',
    ...(bySev.size ? ['**Por severidade (novos, reabertos e abertos):** ' + [...bySev.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${SEV_LABEL[k]} ${n}`).join(' · '), ''] : []),
    '## 🆕 Novos', '', ...table(novos, 'Nenhum bug novo nesta rodada.'),
    '## 🔁 Reabertos (reincidências)', '', ...table(reabertos, 'Nenhuma reincidência registrada nesta rodada.'),
    '## ⏳ Ainda abertos', '', ...table(abertos, 'Nenhum bug de antes continua aberto.'),
    ...(fechados.length ? ['## ✅ Fechados (ligados aos casos da rodada)', '', ...table(fechados, '')] : []),
    '## Por caso', '',
    ...(byCase.length ? ['| Caso | Resultado | Bugs |', '| --- | --- | --- |', ...byCase.map(({ c, bs }) => `| [[${c.key}]] ${cell(c.titulo)} | ${badge(c.status)} | ${bs.map((b) => `[[${b.key}]]${b.open ? '' : ' (fechado)'}`).join(', ')} |`), ''] : ['Nenhum caso da rodada tem bug ligado.', '']),
    ...(s.problemas.some((p) => !p.bugs.length) ? [`> [!WARNING]\n> Falhas sem bug ligado: ${s.problemas.filter((p) => !p.bugs.length).map((p) => `[[${p.key}]]`).join(', ')}. Abra o caso e use 🐞 Bug novo (ou registre a reincidência).`, ''] : []),
    '## Comentários do QA', '',
    ...manual('comentarios', '<!-- Análise dos defeitos, causas prováveis, combinados com o time (preservado ao regerar) -->\n'),
    '',
  ].join('\n');
}

function rastreabilidade(d: ReportData, input: RDoc[]): string {
  const r = REPORTS[2];
  const docs = new Docs(input);
  const reqs = new Map<string, { label: string; kind: string; casos: string[] }>();
  const add = (key: string, kind: string, caso: string | null) => {
    const k = key.trim();
    if (!k) return;
    const e = reqs.get(k.toLowerCase()) || { label: k, kind, casos: [] };
    if (caso && !e.casos.includes(caso)) e.casos.push(caso);
    reqs.set(k.toLowerCase(), e);
  };
  const semReq: string[] = [];
  const auto: string[] = [];
  for (const c of d.casos) {
    const doc = c.path ? docs.get(c.path) : null;
    const jira = doc ? jiraValues(doc.data.jira).map(jiraLabel) : [];
    const epico = doc ? list(doc.data.epico) : [];
    for (const j of jira) add(j, 'Ticket', c.key);
    for (const e of epico) add(e, 'Épico', c.key);
    if (!jira.length && !epico.length) semReq.push(c.key);
    if (doc && str(doc.data.automacao)) auto.push(c.key);
  }
  // vínculos da própria execução: requisitos que ela cobre (podem não ter caso)
  for (const j of d.links.jira || []) add(jiraLabel(j), 'Ticket', null);
  for (const e of d.links.epico || []) add(e, 'Épico', null);
  const byKey = new Map(d.casos.map((c) => [c.key, c]));
  const bugsOf = (k: string) => d.bugs.filter((b) => b.casos.includes(k));
  const resumo = (ks: string[]) => {
    const st = ks.map((k) => byKey.get(k)?.status || null);
    const n = (w: string) => st.filter((x) => x === w).length;
    return [n('PASS') && `${n('PASS')} PASS`, n('FAIL') && `${n('FAIL')} FAIL`, n('BLOCKED') && `${n('BLOCKED')} BLOCKED`, n('SKIP') && `${n('SKIP')} SKIP`, st.filter((x) => !x).length && `${st.filter((x) => !x).length} pendente`].filter(Boolean).join(' · ') || '—';
  };
  const reqList = [...reqs.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label, 'pt-BR', { numeric: true }));
  const semCaso = reqList.filter((q) => !q.casos.length);
  const naoExec = d.casos.filter((c) => !c.status || c.status === 'SKIP');
  const onlyAuto = naoExec.filter((c) => auto.includes(c.key));
  const reqDoc = (label: string) => docs.all.find((x) => ['historia', 'epico'].includes(x.tipo) && (x.id.toLowerCase() === label.toLowerCase() || jiraValues(x.data.jira).map(jiraLabel).some((j) => j.toLowerCase() === label.toLowerCase())));
  const reqCell = (q: { label: string; kind: string }) => { const doc = reqDoc(q.label); return `${q.kind === 'Épico' ? '📚' : '🎫'} ${doc ? `[[${keyOfDoc(doc)}]]${doc.data.titulo ? ` ${cell(str(doc.data.titulo))}` : ''}` : cell(q.label)}`; };
  return [
    ...header(d, r),
    ...intro(d, r),
    '## Cobertura', '',
    '| Indicador | Valor |', '| --- | --- |',
    `| Requisitos (tickets/épicos) | ${reqList.length} — ${reqList.length - semCaso.length} com caso, ${semCaso.length} sem caso |`,
    `| Casos com requisito ligado | ${d.casos.length - semReq.length} de ${d.casos.length} (${pctOf(d.casos.length - semReq.length, d.casos.length)}) |`,
    `| Casos executados | ${d.casos.length - naoExec.length} de ${d.casos.length} (${pctOf(d.casos.length - naoExec.length, d.casos.length)}) |`,
    `| Casos com automação (campo automacao:) | ${auto.length} de ${d.casos.length} (${pctOf(auto.length, d.casos.length)}) |`,
    ...(d.summary.auto ? [`| Testes automatizados anexados | ${d.summary.auto.total} (${cell(d.summary.auto.tool)}) |`] : []),
    '',
    '## Matriz: requisito → casos → resultado → bugs', '',
    ...(reqList.length
      ? ['| Requisito | Casos | Resultado nesta rodada | Bugs |', '| --- | --- | --- | --- |',
        ...reqList.map((q) => `| ${reqCell(q)} | ${q.casos.map((k) => `[[${k}]] ${badge(byKey.get(k)?.status || null)}`).join('<br>') || '**sem caso**'} | ${q.casos.length ? resumo(q.casos) : '—'} | ${[...new Set(q.casos.flatMap((k) => bugsOf(k).map((b) => `[[${b.key}]]${b.open ? '' : ' (fechado)'}`)))].join(', ') || '—'} |`), '']
      : ['Nenhum caso desta rodada tem `jira:` ou `epico:` no cabeçalho, e a execução não tem vínculos. Preencha para ter a matriz.', '']),
    ...(semCaso.length ? ['## ⚠️ Requisitos sem caso', '', `Ligados à execução, mas nenhum caso da rodada cobre: ${semCaso.map((q) => cell(q.label)).join(', ')}.`, ''] : []),
    ...(semReq.length ? ['## Casos sem requisito ligado', '', semReq.map((k) => `[[${k}]]`).join(', '), ''] : []),
    ...(naoExec.length ? ['## Não executados nesta rodada', '', naoExec.map((c) => `[[${c.key}]] ${badge(c.status)}`).join(', '), ''] : []),
    ...(auto.length ? ['## Com automação', '', `${auto.map((k) => `[[${k}]]`).join(', ')}.${onlyAuto.length ? ` Sem execução manual nesta rodada (cobertos só pela automação): ${onlyAuto.map((c) => `[[${c.key}]]`).join(', ')}.` : ''}`, ''] : []),
    '## Comentários do QA', '',
    ...manual('comentarios', '<!-- Lacunas de cobertura, riscos aceitos, próximos casos a escrever (preservado ao regerar) -->\n'),
    '',
  ].join('\n');
}

function logReport(d: ReportData, input: RDoc[]): string {
  const r = REPORTS[3];
  const docs = new Docs(input);
  const total = d.log.reduce((a, l) => a + l.ms, 0);
  const ran = d.log.filter((l) => l.inicio);
  const prev = d.previous;
  const pk = (c: CaseRun) => (docs.get(c.key)?.path || c.key).toLowerCase();
  const bad = (s: StatusWord | null | undefined) => s === 'FAIL' || s === 'BLOCKED';
  const groups = { regressao: [] as string[], corrigido: [] as string[], continua: [] as string[], novo: [] as string[], estavel: [] as string[], outros: [] as string[] };
  if (prev) {
    for (const c of d.casos) {
      const before = prev.casos.has(pk(c)) ? prev.casos.get(pk(c)) ?? null : undefined;
      const line = `[[${c.key}]] ${badge(before ?? null)} → ${badge(c.status)}`;
      if (before === undefined) groups.novo.push(line);
      else if (before === 'PASS' && bad(c.status)) groups.regressao.push(line);
      else if (bad(before) && c.status === 'PASS') groups.corrigido.push(line);
      else if (bad(before) && bad(c.status)) groups.continua.push(line);
      else if (before === 'PASS' && c.status === 'PASS') groups.estavel.push(line);
      else groups.outros.push(line);
    }
  }
  const sect = (title: string, items: string[], empty: string) => [`### ${title} (${items.length})`, '', ...(items.length ? items.map((x) => `- ${x}`) : [empty]), ''];
  return [
    ...header(d, r),
    ...intro(d, r),
    '## Log da execução', '',
    `${ran.length} de ${d.casos.length} caso(s) com rodada registrada nesta execução · tempo somado nos casos: ${fmtMs(total)}${d.summary.duracaoMs == null ? '' : ` · duração total: ${fmtMs(d.summary.duracaoMs)}`}${d.dispositivo ? ` · dispositivo: ${d.dispositivo}` : ''}.`, '',
    '| # | Caso | Início | Fim | Duração | Quem | Ambiente | Resultado |', '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...d.log.map((l, i) => `| ${i + 1} | [[${l.key}]] ${cell(l.titulo)} | ${l.inicio ? `${dmy(l.inicio)} ${hm(l.inicio)}` : '—'} | ${l.fim ? hm(l.fim) : '—'} | ${cell(l.duracao) || '—'} | ${cell(l.responsavel) || '—'} | ${cell(l.ambiente) || '—'} | ${badge(l.resultado)} |`),
    '',
    ...(d.casos.some((c) => c.status === 'SKIP') ? ['> [!NOTE]', '> Casos sem início/fim não tiveram rodada registrada nesta execução (pulados ou marcados direto na tabela da execução).', ''] : []),
    '## Comparativo com a execução anterior', '',
    ...(prev
      ? [
        `Comparado com [[${prev.key}]]${prev.titulo ? ` — ${cell(prev.titulo)}` : ''}${prev.numero ? ` (#${prev.numero})` : ''}: sucesso ${prev.pct == null ? '—' : `${prev.pct}%`} → ${d.summary.sucessoPct == null ? '—' : `${d.summary.sucessoPct}%`}.`, '',
        ...sect('🔻 Passou a falhar (regressão)', groups.regressao, 'Nenhuma regressão.'),
        ...sect('✅ Corrigido', groups.corrigido, 'Nenhum.'),
        ...sect('❌ Continua falhando', groups.continua, 'Nenhum.'),
        ...sect('🆕 Novo nesta execução', groups.novo, 'Nenhum caso novo.'),
        ...(groups.estavel.length ? sect('Estável (PASS → PASS)', groups.estavel, '') : []),
        ...(groups.outros.length ? sect('Outras mudanças (SKIP, pendente)', groups.outros, '') : []),
      ]
      : ['Não há execução anterior para comparar (primeira execução deste ciclo, ou rodada avulsa sem execução encerrada antes com os mesmos casos).', '']),
    '## Comentários do QA', '',
    ...manual('comentarios', '<!-- Observações sobre o andamento, interrupções, ambiente (preservado ao regerar) -->\n'),
    '',
  ].join('\n');
}

/**
 * Os quatro relatórios de uma execução. `existing`: textos atuais dos relatórios (caminho → texto), para preservar o
 * que o QA escreveu ao regerar. Retorna null se `execPath` não for uma execução.
 */
export function buildReports(execPath: string, docs: RDoc[], { now = new Date(), existing = {} as Record<string, string | null | undefined> } = {}): { dir: string; data: ReportData; files: ReportFile[] } | null {
  const d = reportData(execPath, docs, now);
  if (!d) return null;
  const dir = reportsDir(execPath, d.execId);
  const texts: Record<ReportKind, string> = { encerramento: encerramento(d), defeitos: defeitos(d), rastreabilidade: rastreabilidade(d, docs), log: logReport(d, docs) };
  const files = REPORTS.map((r) => {
    const path = `${dir}/${r.file}`;
    return { kind: r.kind, path, id: `${d.execId}-${r.suffix}`, titulo: `${r.titulo} — ${d.titulo}`, tipo: r.tipo, text: keepManual(existing[path], texts[r.kind]) };
  });
  return { dir, data: d, files };
}

const LINKS_TITLE = /^relat[oó]rios\b/i;

/** Seção "## Relatórios" na execução com os [[links]] (troca a que já existe). Não mexe no resto. */
export function linkReports(execText: string, files: Array<{ id: string; titulo: string; kind: ReportKind }>, now = new Date()): string {
  const block = [
    `Gerados em ${dmy(now)} às ${hm(now)} (📑 Relatórios regera; o que você escrever nos trechos de comentário e aceite fica).`, '',
    ...files.map((f) => { const r = REPORTS.find((x) => x.kind === f.kind); return `- ${r?.icon || '📄'} [[${f.id}]] — ${r?.titulo || f.titulo}`; }),
    '',
  ];
  const lines = execText.replace(/\n+$/, '').split('\n');
  const sec = findSection(lines, LINKS_TITLE, { minLevel: 2, maxLevel: 2 });
  if (sec) lines.splice(sec.start, sec.end - sec.start, '', ...block);
  else lines.push('', '## Relatórios', '', ...block);
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '')}\n`;
}

/** É um dos relatórios gerados? */
export const isReport = (tipo: string): boolean => REPORT_TYPES.includes(tipo);
export { EXEC_TYPE };
