import { segmentMembers } from './segment.ts';
import { parseDevice } from './device.ts';
import type { StatusCounts, TaskCounts } from '../types';
import { TYPE_LABELS, formatValue } from './frontmatter.ts';
import { statusKind } from './qa.ts';
import { jiraLabel } from './jiraLink.ts';
import { VIEW_OPEN, VIEW_CLOSE, findViewBlocks } from './viewBlocks.ts';
import { buildTrend, monthLabel, durLabel } from './trend.ts';

/**
 * Visões: consultas salvas sobre os documentos da pasta de trabalho (funções puras).
 *
 * A consulta fica num bloco de código ```qa-visao dentro de um .md comum (legível fora do app):
 *
 *   ```qa-visao
 *   titulo: Casos ainda não executados
 *   tipo: caso-de-teste, cenario-bdd
 *   execucao: nunca
 *   agrupar: app
 *   colunas: id, titulo, prioridade, jira
 *   ```
 *
 * Filtros: tipo, app, status, tags, jira, epico, sprint, dispositivo (web, mobile, ios, android), versao, pasta, responsavel, prioridade, texto, execucao, automacao.
 * Listas separadas por vírgula; "!" na frente exclui (status: !PASS).
 * Formatos: lista (padrão) · quadro · cobertura (medida: execucao | automacao) · jira · rastreabilidade · tendencia (rodadas ao longo do tempo).
 */

export type ViewFormat = 'lista' | 'quadro' | 'cobertura' | 'jira' | 'rastreabilidade' | 'tendencia';

export interface ViewSpec {
  titulo: string;
  formato: ViewFormat;
  medida: 'execucao' | 'automacao';
  filters: Record<string, { include: string[]; exclude: string[] }>;
  texto: string;
  agrupar: string;
  colunas: string[];
  ordenar: string;
  desc: boolean;
  limite: number;
}

/** O que a visão precisa saber de cada documento (vem do índice da pasta). */
export interface ViewDoc {
  path: string;
  name: string;
  id: string;
  titulo: string;
  heading?: string;
  tipo: string;
  app: string;
  status: string;
  overall: string;
  prioridade: string;
  responsavel: string;
  versao: string;
  jira: string;
  epico?: string;
  sprint?: string;
  dispositivo?: string;
  tags: string[];
  origem?: string[];
  automacao?: string;
  ambiente?: string;
  comments?: { open: number; resolved: number };
  counts: StatusCounts;
  tasks: TaskCounts;
  targets: string[];
  ids: string[];
  lastModified?: number;
  /** última rodada arquivada (### Rodada N — data — STATUS) */
  last?: { round: number; date: string; overall: string } | null;
  /** texto do documento (a tendência lê as execuções, o histórico dos casos e a data dos bugs) */
  text?: string;
}

const FILTER_KEYS = ['segmento', 'tipo', 'app', 'status', 'tags', 'jira', 'epico', 'sprint', 'dispositivo', 'versao', 'pasta', 'responsavel', 'prioridade', 'execucao', 'automacao', 'comentarios'];
const FORMATS: ViewFormat[] = ['lista', 'quadro', 'cobertura', 'jira', 'rastreabilidade', 'tendencia'];
export const VIEW_COLUMNS: Record<string, string> = {
  id: 'ID', titulo: 'Título', tipo: 'Tipo', status: 'Status', app: 'App', prioridade: 'Prioridade', responsavel: 'Responsável',
  jira: 'Jira', tags: 'Tags', progresso: 'Progresso', rodada: 'Última rodada', automacao: 'Automação', pasta: 'Pasta', versao: 'Versão',
  bugs: 'Bugs abertos', comentarios: 'Comentários',
};
const DEFAULT_COLUMNS = ['id', 'titulo', 'status', 'app', 'progresso'];

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const list = (v: string): string[] => v.split(/[,;]/).map((x) => x.trim()).filter(Boolean);

/** Lê o bloco ```qa-visao. Linhas inválidas viram avisos (a visão funciona com o resto). */
export function parseView(src: string): { spec: ViewSpec; errors: string[] } {
  const spec: ViewSpec = { titulo: '', formato: 'lista', medida: 'execucao', filters: {}, texto: '', agrupar: '', colunas: [], ordenar: '', desc: false, limite: 500 };
  const errors: string[] = [];
  for (const raw of src.split('\n')) {
    // comentário: linha começando com "#", ou " # " no fim da linha (tags: #regressao continua valendo)
    const line = raw.replace(/\s+#\s.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([a-zà-ú_-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) { errors.push(`linha sem "chave: valor": ${line}`); continue; }
    const key = norm(m[1]).replace(/-/g, '_');
    const value = m[2].trim();
    if (key === 'titulo') spec.titulo = value;
    else if (key === 'formato') {
      const f = norm(value) as ViewFormat;
      if (FORMATS.includes(f)) spec.formato = f; else errors.push(`formato "${value}" desconhecido (${FORMATS.join(', ')})`);
    } else if (key === 'medida') spec.medida = norm(value).startsWith('auto') ? 'automacao' : 'execucao';
    else if (key === 'texto' || key === 'busca') spec.texto = value;
    else if (key === 'agrupar' || key === 'agrupar_por') spec.agrupar = norm(value);
    else if (key === 'colunas') spec.colunas = list(value).map(norm).filter((c) => { const ok = c in VIEW_COLUMNS; if (!ok) errors.push(`coluna "${c}" desconhecida`); return ok; });
    else if (key === 'ordenar' || key === 'ordem') { spec.desc = value.startsWith('-'); spec.ordenar = norm(value.replace(/^[-+]/, '')); }
    else if (key === 'limite') spec.limite = Math.max(1, Math.min(5000, parseInt(value, 10) || 500));
    else if (FILTER_KEYS.includes(key)) {
      let items = list(value);
      if (key === 'tags') items = items.map((x) => x.replace(/^(!?)#/, '$1'));
      if (key === 'jira') items = items.map((x) => (x.startsWith('!') ? `!${jiraLabel(x.slice(1))}` : jiraLabel(x)));
      if (key === 'status') items = items.map((x) => { const neg = x.startsWith('!'); const w = neg ? x.slice(1) : x; const k = statusKind(w); return `${neg ? '!' : ''}${k ? k.toUpperCase() : /^(none|sem[- ]?status|vazio)$/i.test(w) ? SEM_STATUS : w}`; });
      if (!items.length) { errors.push(`"${m[1]}" sem valor (filtro ignorado)`); continue; }
      spec.filters[key] = { include: items.filter((x) => !x.startsWith('!')).map(norm), exclude: items.filter((x) => x.startsWith('!')).map((x) => norm(x.slice(1))) };
    } else errors.push(`chave "${m[1]}" desconhecida`);
  }
  return { spec, errors };
}

// ---------------------------------------------------------------- situação de cada documento
const isView = (d: ViewDoc): boolean => d.tipo === 'visao';
const isCase = (d: ViewDoc): boolean => d.tipo === 'caso-de-teste' || d.tipo === 'cenario-bdd' || d.tipo === 'checklist';
const isBug = (d: ViewDoc): boolean => d.tipo === 'bug';
const SEM_STATUS = 'sem-status';
/** Status como no Painel: Falhou/Reprovado/NOK = FAIL, Aprovado = PASS…; palavra desconhecida fica como está. */
const statusWord = (d: ViewDoc): string => { const w = (d.overall || d.status || '').toUpperCase(); const k = statusKind(w); return k ? k.toUpperCase() : w; };

/** nunca (nenhum passo executado e nenhuma rodada) · andamento · executado */
export function execState(d: ViewDoc): 'nunca' | 'andamento' | 'executado' {
  const c = d.counts;
  if (c.total > 0) {
    if (c.pending === 0) return 'executado';
    if (c.pending < c.total) return 'andamento';
    return d.last ? 'andamento' : 'nunca';
  }
  if (d.tasks.total > 0) return d.tasks.done === d.tasks.total ? 'executado' : d.tasks.done ? 'andamento' : 'nunca';
  const s = statusKind(statusWord(d));
  return s && s !== 'pending' ? 'executado' : d.last ? 'andamento' : 'nunca';
}

const hasFailure = (d: ViewDoc): boolean => d.counts.fail + d.counts.blocked > 0 || ['fail', 'blocked'].includes(statusKind(statusWord(d)) || '');

/** Bug aberto: status do bug não é PASS/SKIP nem "fechado/resolvido". */
export function bugOpen(d: ViewDoc): boolean {
  const s = norm(d.status || d.overall || '');
  if (['pass', 'skip'].includes(statusKind(s.toUpperCase()) || '')) return false;
  return !/^(fechad|resolvid|closed|done|conclu|corrigid|cancelad)/.test(s);
}

const keyOf = (d: ViewDoc): string => (d.id || d.name.replace(/\.(md|markdown)$/i, '')).toLowerCase();
const jiraKeys = (d: ViewDoc): string[] => [...new Set(d.jira.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean).map(jiraLabel))];
const dirOf = (p: string): string => p.split('/').slice(0, -1).join('/');

/** Índice "chave citada → bugs" (uma vez por lista de documentos; evita varrer tudo a cada linha). */
const bugIndexCache = new WeakMap<ViewDoc[], Map<string, ViewDoc[]>>();
function bugIndex(docs: ViewDoc[]): Map<string, ViewDoc[]> {
  let idx = bugIndexCache.get(docs);
  if (idx) return idx;
  idx = new Map();
  for (const b of docs) {
    if (!isBug(b)) continue;
    const keys = new Set([...b.targets.map((t) => t.split('#')[0].trim().toLowerCase().replace(/\.(md|markdown)$/i, '')), ...b.ids.map((x) => x.toLowerCase())]);
    for (const k of keys) if (k) idx.set(k, [...(idx.get(k) || []), b]);
  }
  bugIndexCache.set(docs, idx);
  return idx;
}

/** Bugs que citam o documento ([[TC-5]] ou TC-5 no texto). */
export function bugsFor(d: ViewDoc, docs: ViewDoc[]): ViewDoc[] {
  const idx = bugIndex(docs);
  const found = new Set([...(idx.get(keyOf(d)) || []), ...(d.id ? idx.get(d.id.toLowerCase()) || [] : [])]);
  found.delete(d);
  return [...found];
}

const splitList = (v?: string): string[] => String(v || '').split(/[,;]+/).map((x) => x.trim()).filter(Boolean);

function fieldValues(d: ViewDoc, key: string): string[] {
  switch (key) {
    case 'tipo': return [d.tipo];
    case 'app': return [d.app || ''];
    case 'status': return [statusWord(d) || SEM_STATUS];
    case 'tags': return d.tags;
    case 'jira': return jiraKeys(d);
    case 'versao': return [d.versao];
    case 'epico': return splitList(d.epico);
    case 'sprint': return [d.sprint || ''];
    case 'dispositivo': { const dv = parseDevice(d.dispositivo); return dv ? [...dv.kind.tags, dv.kind.key] : [d.dispositivo || '']; }
    case 'pasta': return [dirOf(d.path)];
    case 'responsavel': return [d.responsavel];
    case 'prioridade': return [d.prioridade];
    case 'execucao': return [execState(d), ...(hasFailure(d) ? ['com-falha', 'falha'] : [])];
    case 'automacao': return [(d.automacao || '').trim() ? 'sim' : 'nao'];
    // comentarios: pendentes · resolvidos · nenhum
    case 'comentarios': return [...(d.comments?.open ? ['pendentes', 'pendente', 'sim'] : []), ...(d.comments?.resolved ? ['resolvidos', 'resolvido'] : []), ...(!d.comments?.open && !d.comments?.resolved ? ['nenhum', 'nao'] : [])];
    default: return [];
  }
}

/** Membros de cada segmento por lista de documentos (calculado uma vez por busca). */
const segCache = new WeakMap<ViewDoc[], Map<string, Set<string>>>();
function inSegment(d: ViewDoc, key: string, docs: ViewDoc[]): boolean {
  let byKey = segCache.get(docs);
  if (!byKey) { byKey = new Map(); segCache.set(docs, byKey); }
  let set = byKey.get(key);
  if (!set) { set = new Set(segmentMembers(key, docs).map((x) => x.path)); byKey.set(key, set); }
  return set.has(d.path);
}

function matches(d: ViewDoc, spec: ViewSpec, docs: ViewDoc[] = []): boolean {
  for (const [key, f] of Object.entries(spec.filters)) {
    if (key === 'segmento') {
      // seg:PORTAL-10 — tudo o que nasceu do épico/ticket/execução/ciclo/tag (ver segment.ts)
      if (f.include.length && !f.include.some((k) => inSegment(d, k, docs))) return false;
      if (f.exclude.some((k) => inSegment(d, k, docs))) return false;
      continue;
    }
    const vals = fieldValues(d, key).map(norm);
    // pasta e versão: por começo (pasta: aplicacoes/Portal pega as subpastas; versao: 2.14 pega 2.14.1)
    const hit = (want: string) => (key === 'pasta' || key === 'versao' ? vals.some((v) => v === want || v.startsWith(`${want}${key === 'pasta' ? '/' : '.'}`)) : vals.includes(want));
    if (f.include.length && !f.include.some(hit)) return false;
    if (f.exclude.some(hit)) return false;
  }
  if (spec.texto) {
    const q = norm(spec.texto);
    // mesmos campos da busca do Painel, e mais o ticket
    if (!norm([d.id, d.titulo, d.heading || '', d.name, d.path, d.tags.join(' '), d.jira, d.responsavel, d.prioridade, d.ambiente || '', d.app].join(' ')).includes(q)) return false;
  }
  return true;
}

/** O documento passa nos filtros da visão (mesma regra das visões e da busca com filtros). */
export const viewMatches = (d: ViewDoc, spec: ViewSpec, docs: ViewDoc[] = []): boolean => matches(d, spec, docs);

// ---------------------------------------------------------------- busca com filtros (Ctrl+Shift+F)
/** Nome do filtro na busca → chave da visão (singular, sem acento, em inglês…). */
const SEARCH_ALIASES: Record<string, string> = {
  seg: 'segmento', segmento: 'segmento', tag: 'tags', tags: 'tags', status: 'status', tipo: 'tipo', type: 'tipo', app: 'app', aplicacao: 'app', jira: 'jira', ticket: 'jira',
  epico: 'epico', sprint: 'sprint', dispositivo: 'dispositivo', device: 'dispositivo', versao: 'versao', pasta: 'pasta',
  responsavel: 'responsavel', resp: 'responsavel', prioridade: 'prioridade', prio: 'prioridade', execucao: 'execucao',
  automacao: 'automacao', comentarios: 'comentarios', comentario: 'comentarios',
};

export interface SearchQuery {
  /** o que sobrou para buscar no texto */
  text: string;
  /** filtros (null = nenhum) */
  spec: ViewSpec | null;
  /** os filtros reconhecidos, como digitados (para mostrar) */
  tokens: string[];
  errors: string[];
}

/**
 * Separa `status:FAIL tag:regressao jira:ABC-123 senha` em filtros (sintaxe das visões) + texto.
 * `-tag:x` ou `tag:!x` excluem; vírgula = "ou" (`status:FAIL,BLOCKED`); aspas para valor com espaço.
 * Palavra com ":" que não é filtro conhecido (ex.: http://…) continua no texto.
 */
export function parseSearch(query: string): SearchQuery {
  const lines: string[] = [];
  const tokens: string[] = [];
  const byKey = new Map<string, string[]>();
  const text = String(query || '').replace(/(^|\s)(-?)([a-zà-ú_]+):("([^"]*)"|[^\s"]*)/gi, (all, pre: string, neg: string, rawKey: string, val: string, quoted?: string) => {
    const key = SEARCH_ALIASES[norm(rawKey)];
    if (!key) return all;
    const value = quoted ?? val;
    tokens.push(all.trim());
    const items = value.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (neg && !x.startsWith('!') ? `!${x}` : x));
    if (items.length) byKey.set(key, [...(byKey.get(key) || []), ...items]);
    return pre;
  }).replace(/\s+/g, ' ').trim();
  for (const [k, items] of byKey) lines.push(`${k}: ${items.join(', ')}`);
  if (!lines.length) return { text, spec: null, tokens, errors: [] };
  const { spec, errors } = parseView(lines.join('\n'));
  return { text, spec: Object.keys(spec.filters).length ? spec : null, tokens, errors };
}

/** Atalhos da busca (chips embaixo do campo). */
export const SEARCH_PRESETS: Array<{ label: string; query: string; hint: string }> = [
  { label: '❌ Falharam', query: 'status:FAIL', hint: 'Documentos com resultado FAIL' },
  { label: '⛔ Bloqueados', query: 'status:BLOCKED', hint: 'Documentos com resultado BLOCKED' },
  { label: '⏳ Não executados', query: 'execucao:nunca tipo:caso-de-teste', hint: 'Casos sem nenhum passo executado' },
  { label: '🐞 Bugs', query: 'tipo:bug', hint: 'Todos os bugs (combine com status: ou app:)' },
  { label: '🔁 Regressão', query: 'tag:regressao', hint: 'Documentos com a tag regressao' },
  { label: '💬 Comentários pendentes', query: 'comentarios:pendentes', hint: 'Documentos com comentário de revisão em aberto' },
];

const PRIORITY = ['critica', 'alta', 'media', 'baixa'];
const STATUS_RANK = ['FAIL', 'BLOCKED', 'PENDING', 'SKIP', 'PASS'];
const COLL = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

function sortValue(d: ViewDoc, key: string): string | number {
  switch (key) {
    case 'prioridade': { const i = PRIORITY.indexOf(norm(d.prioridade)); return i < 0 ? 9 : i; }
    case 'status': { const i = STATUS_RANK.indexOf(statusWord(d)); return i < 0 ? 9 : i; }
    case 'atualizado': return -(d.lastModified || 0);
    case 'progresso': return d.counts.total ? (d.counts.total - d.counts.pending) / d.counts.total : -1;
    case 'titulo': return d.titulo || d.heading || d.name;
    case 'pasta': return d.path;
    default: return fieldValues(d, key)[0] ?? d.id ?? '';
  }
}

// ---------------------------------------------------------------- resultado
export interface ViewCell { text: string; link?: string; badge?: string }
export interface ViewTable { head: string[]; rows: ViewCell[][]; group?: string }
export interface ViewChart {
  title: string;
  /** '%' (0–100) ou 'n' (contagem) */
  unit: '%' | 'n';
  /** séries: uma barra por série em cada ponto (ex.: bugs abertos × fechados) */
  series: Array<{ name: string; kind?: string }>;
  /** kind: cor do ponto (sobrepõe a da série — ex.: % de sucesso verde/amarelo/vermelho) */
  points: Array<{ label: string; values: Array<number | null>; link?: string; hint?: string; kind?: string }>;
}

export interface ViewResult {
  title: string;
  /** lista/quadro/cobertura/jira/rastreabilidade */
  format: ViewFormat;
  /** tabelas (lista agrupada = uma por grupo) */
  tables: ViewTable[];
  /** quadro: colunas com cartões */
  board?: Array<{ title: string; badge?: string; cards: ViewCell[] }>;
  /** tendência: gráficos de barras (um ponto por rodada / mês) */
  charts?: ViewChart[];
  total: number;
  summary: string;
  errors: string[];
}

const idCell = (d: ViewDoc): ViewCell => ({ text: d.id || d.name.replace(/\.(md|markdown)$/i, ''), link: d.id || d.path.replace(/\.(md|markdown)$/i, '') });
const statusCell = (w: string): ViewCell => ({ text: w || '—', badge: statusKind(w) || undefined });
const pct = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)}%` : '—');

function progress(d: ViewDoc): string {
  const c = d.counts;
  if (c.total) {
    const bad = [c.fail ? `${c.fail} FAIL` : '', c.blocked ? `${c.blocked} BLOCKED` : ''].filter(Boolean).join(' · ');
    return `${c.total - c.pending}/${c.total}${bad ? ` · ${bad}` : ''}`;
  }
  return d.tasks.total ? `${d.tasks.done}/${d.tasks.total} ☑` : '';
}

function cell(d: ViewDoc, col: string, docs: ViewDoc[]): ViewCell {
  switch (col) {
    case 'id': return idCell(d);
    case 'titulo': return { text: d.titulo || d.heading || d.name };
    case 'tipo': return { text: TYPE_LABELS[d.tipo] || d.tipo };
    case 'status': return statusCell(statusWord(d) || (isCase(d) && execState(d) === 'nunca' ? 'PENDING' : ''));
    case 'app': return { text: d.app };
    case 'prioridade': return { text: d.prioridade };
    case 'responsavel': return { text: d.responsavel };
    case 'jira': return { text: jiraKeys(d).join(', ') };
    case 'tags': return { text: d.tags.map((t) => `#${t}`).join(' ') };
    case 'progresso': return { text: progress(d) };
    case 'rodada': return d.last ? { text: `${d.last.round}${d.last.date ? ` — ${d.last.date}` : ''}${d.last.overall ? ` — ${d.last.overall}` : ''}`, badge: statusKind(d.last.overall) || undefined } : { text: '—' };
    case 'automacao': return { text: (d.automacao || '').trim() ? '✓' : '—' };
    case 'comentarios': return { text: d.comments?.open ? `💬 ${d.comments.open} pendente(s)` : d.comments?.resolved ? `✓ ${d.comments.resolved}` : '—' };
    case 'pasta': return { text: dirOf(d.path) };
    case 'versao': return { text: d.versao };
    case 'bugs': { const b = bugsFor(d, docs).filter(bugOpen); return { text: b.map((x) => x.id || x.name).join(', ') || '—' }; }
    default: return { text: '' };
  }
}

function groupKey(d: ViewDoc, by: string): string[] {
  if (!by) return [''];
  const v = fieldValues(d, by === 'status' ? 'status' : by);
  if (by === 'execucao') return [execState(d)];
  return v.length ? v.map((x) => (x && x !== SEM_STATUS ? x : '(sem)')) : ['(sem)'];
}

const EXEC_LABEL: Record<string, string> = { nunca: 'Nunca executado', andamento: 'Em andamento', executado: 'Executado' };
const groupLabel = (by: string, k: string): string => (by === 'execucao' ? EXEC_LABEL[k] || k : by === 'tipo' ? TYPE_LABELS[k] || k : k);

/** Roda a visão sobre os documentos da pasta. */
export function runView(spec: ViewSpec, all: ViewDoc[], errors: string[] = []): ViewResult {
  const docs = all.filter((d) => !isView(d));
  let rows = docs.filter((d) => matches(d, spec, all));
  const by = spec.ordenar || (spec.formato === 'lista' ? 'id' : '');
  if (by) rows = [...rows].sort((a, b) => { const x = sortValue(a, by); const y = sortValue(b, by); const r = typeof x === 'number' && typeof y === 'number' ? x - y : COLL.compare(String(x), String(y)); return (spec.desc ? -r : r) || COLL.compare(a.id || a.name, b.id || b.name); });
  const title = spec.titulo || 'Visão';
  const base = { title, format: spec.formato, total: rows.length, errors };
  // o limite vale só para as linhas mostradas (lista/quadro); cobertura, Jira e rastreabilidade contam tudo
  const truncated = (spec.formato === 'lista' || spec.formato === 'quadro') && rows.length > spec.limite;
  if (truncated) rows = rows.slice(0, spec.limite);

  if (spec.formato === 'tendencia') return trendView(spec, docs, rows, base);

  if (spec.formato === 'cobertura') {
    const g = spec.agrupar || 'app';
    const groups = new Map<string, ViewDoc[]>();
    for (const d of rows) for (const k of groupKey(d, g)) groups.set(k, [...(groups.get(k) || []), d]);
    const auto = spec.medida === 'automacao';
    const head = auto ? [VIEW_COLUMNS[g] || g, 'Casos', 'Automatizados', 'Cobertura'] : [VIEW_COLUMNS[g] || g, 'Casos', 'Executados', 'Com falha', 'Nunca executados', 'Cobertura'];
    const body: ViewCell[][] = [];
    let tot = 0; let ok = 0;
    for (const [k, list] of [...groups].sort((a, b) => COLL.compare(a[0], b[0]))) {
      const n = list.length;
      const done = auto ? list.filter((d) => (d.automacao || '').trim()).length : list.filter((d) => execState(d) === 'executado').length;
      tot += n; ok += done;
      body.push(auto
        ? [{ text: groupLabel(g, k) }, { text: String(n) }, { text: String(done) }, { text: pct(done, n) }]
        : [{ text: groupLabel(g, k) }, { text: String(n) }, { text: String(done) }, { text: String(list.filter(hasFailure).length) }, { text: String(list.filter((d) => execState(d) === 'nunca').length) }, { text: pct(done, n) }]);
    }
    if (groups.size > 1) body.push(auto ? [{ text: 'Total' }, { text: String(tot) }, { text: String(ok) }, { text: pct(ok, tot) }] : [{ text: 'Total' }, { text: String(tot) }, { text: String(ok) }, { text: String(rows.filter(hasFailure).length) }, { text: String(rows.filter((d) => execState(d) === 'nunca').length) }, { text: pct(ok, tot) }]);
    return { ...base, tables: [{ head, rows: body }], summary: `${auto ? 'Automatizados' : 'Executados'}: ${ok} de ${tot} (${pct(ok, tot)})` };
  }

  if (spec.formato === 'jira' || spec.formato === 'rastreabilidade') {
    const byKey = new Map<string, ViewDoc[]>();
    for (const d of rows) for (const k of jiraKeys(d).length ? jiraKeys(d) : spec.formato === 'rastreabilidade' ? ['(sem ticket)'] : []) byKey.set(k, [...(byKey.get(k) || []), d]);
    const keys = [...byKey.keys()].sort((a, b) => (a === '(sem ticket)' ? 1 : b === '(sem ticket)' ? -1 : COLL.compare(a, b)));
    if (spec.formato === 'jira') {
      const head = ['Ticket', 'Casos', 'Executados', 'PASS', 'FAIL / BLOCKED', 'Bugs abertos', 'Situação'];
      const body = keys.map((k) => {
        const list = byKey.get(k) || [];
        const cases = list.filter(isCase);
        const done = cases.filter((d) => execState(d) === 'executado');
        const pass = cases.filter((d) => statusWord(d) === 'PASS').length;
        const bad = cases.filter(hasFailure).length;
        const bugs = new Set<ViewDoc>([...list.filter((d) => isBug(d) && bugOpen(d)), ...cases.flatMap((c) => bugsFor(c, docs).filter(bugOpen))]);
        const situ = bad || bugs.size ? 'FAIL' : cases.length && done.length === cases.length ? 'PASS' : 'PENDING';
        return [{ text: k, link: `jira:${k}` }, { text: String(cases.length) }, { text: `${done.length}/${cases.length}` }, { text: String(pass) }, { text: String(bad) }, { text: [...bugs].map((b) => b.id || b.name).join(', ') || '0' }, statusCell(situ)];
      });
      return { ...base, tables: [{ head, rows: body }], total: keys.length, summary: `${keys.length} ticket(s) · ${rows.filter(isCase).length} caso(s)` };
    }
    const head = ['Ticket', 'Caso', 'Título', 'Status', 'Última rodada', 'Bugs'];
    const body: ViewCell[][] = [];
    for (const k of keys) {
      const list = (byKey.get(k) || []).filter((d) => !isBug(d));
      const bugsOnly = (byKey.get(k) || []).filter(isBug);
      for (const d of list) body.push([{ text: k, link: k.startsWith('(') ? undefined : `jira:${k}` }, idCell(d), { text: d.titulo || d.heading || d.name }, cell(d, 'status', docs), cell(d, 'rodada', docs), { text: bugsFor(d, docs).map((b) => `${b.id || b.name}${bugOpen(b) ? '' : ' ✓'}`).join(', ') || '—' }]);
      for (const b of bugsOnly) body.push([{ text: k, link: k.startsWith('(') ? undefined : `jira:${k}` }, idCell(b), { text: b.titulo || b.name }, statusCell(statusWord(b)), { text: '—' }, { text: bugOpen(b) ? 'aberto' : 'fechado ✓' }]);
    }
    return { ...base, tables: [{ head, rows: body }], summary: `${keys.filter((k) => !k.startsWith('(')).length} ticket(s) · ${body.length} linha(s)` };
  }

  if (spec.formato === 'quadro') {
    const g = spec.agrupar || 'status';
    const groups = new Map<string, ViewDoc[]>();
    for (const d of rows) for (const k of groupKey(d, g)) groups.set(k, [...(groups.get(k) || []), d]);
    const order = g === 'status' ? [...STATUS_RANK, ''] : [];
    const keys = [...groups.keys()].sort((a, b) => (order.length ? (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)) : 0) || COLL.compare(a, b));
    const board = keys.map((k) => ({ title: `${groupLabel(g, k) || '(sem)'} (${groups.get(k)?.length || 0})`, badge: g === 'status' ? statusKind(k) || undefined : undefined, cards: (groups.get(k) || []).map((d) => ({ text: `${d.id ? `${d.id} — ` : ''}${d.titulo || d.heading || d.name}`, link: idCell(d).link })) }));
    return { ...base, tables: [], board, summary: `${rows.length} documento(s)${truncated ? ` (primeiros ${spec.limite})` : ''}` };
  }

  // lista (agrupada ou não)
  const cols = spec.colunas.length ? spec.colunas : DEFAULT_COLUMNS;
  const head = cols.map((c) => VIEW_COLUMNS[c] || c);
  const g = spec.agrupar;
  const tables: ViewTable[] = [];
  if (g) {
    const groups = new Map<string, ViewDoc[]>();
    for (const d of rows) for (const k of groupKey(d, g)) groups.set(k, [...(groups.get(k) || []), d]);
    for (const [k, list] of [...groups].sort((a, b) => COLL.compare(a[0], b[0]))) tables.push({ group: `${groupLabel(g, k)} (${list.length})`, head, rows: list.map((d) => cols.map((c) => cell(d, c, docs))) });
  } else tables.push({ head, rows: rows.map((d) => cols.map((c) => cell(d, c, docs))) });
  return { ...base, tables, summary: `${rows.length} documento(s)${truncated ? ` (primeiros ${spec.limite})` : ''}` };
}

// ---------------------------------------------------------------- tendência entre rodadas
const signed = (n: number | null): string => (n === null ? '—' : n > 0 ? `▲ ${n} pp` : n < 0 ? `▼ ${-n} pp` : '= 0 pp');
const shortDate = (d: Date | null): string => (d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '—');

function trendView(spec: ViewSpec, docs: ViewDoc[], rows: ViewDoc[], base: { title: string; format: ViewFormat; total: number; errors: string[] }): ViewResult {
  const isExec = (d: ViewDoc): boolean => d.tipo === 'execucao' || d.tipo === 'ciclo-regressao';
  const ref = (d: ViewDoc) => ({ id: d.id || d.name.replace(/\.(md|markdown)$/i, ''), link: idCell(d).link || '', titulo: d.titulo || d.heading || d.name, text: d.text || '' });
  const t = buildTrend({
    execs: rows.filter(isExec).map((d) => ({ ...ref(d), sprint: d.sprint || '' })),
    cases: rows.filter(isCase).map(ref),
    bugs: rows.filter(isBug).map((d) => ({ ...ref(d), open: bugOpen(d) })),
    limite: spec.limite && spec.limite !== 500 ? spec.limite : 12,
  });
  const tables: ViewTable[] = [];
  const charts: ViewChart[] = [];
  if (t.rounds.length) {
    charts.push({
      title: '% de sucesso por rodada', unit: '%', series: [{ name: '% de sucesso', kind: 'pass' }],
      points: t.rounds.map((r) => ({ label: shortDate(r.inicio).slice(0, 5), values: [r.sucessoPct], link: r.link, kind: r.sucessoPct === null ? undefined : r.sucessoPct >= 90 ? 'pass' : r.sucessoPct >= 70 ? 'blocked' : 'fail', hint: `${r.titulo}: ${r.sucessoPct ?? '—'}% (${r.pass} PASS · ${r.fail} FAIL · ${r.blocked} BLOCKED)` })),
    });
    tables.push({
      group: 'Por rodada', head: ['Rodada', 'Início', 'Sprint', 'Casos', 'PASS', 'FAIL', 'BLOCKED', 'SKIP', '% sucesso', 'Variação', 'Bugs novos', 'Duração'],
      rows: [...t.rounds].reverse().map((r) => [
        { text: r.id, link: r.link }, { text: shortDate(r.inicio) }, { text: r.sprint || '—' }, { text: String(r.total) },
        { text: String(r.pass) }, { text: String(r.fail) }, { text: String(r.blocked) }, { text: String(r.skip) },
        { text: r.sucessoPct === null ? '—' : `${r.sucessoPct}%`, badge: r.sucessoPct === null ? undefined : r.sucessoPct >= 90 ? 'pass' : r.sucessoPct >= 70 ? 'blocked' : 'fail' },
        { text: signed(r.deltaPct) }, { text: r.bugsNovos.join(', ') || '0' }, { text: r.encerrada ? durLabel(r.duracaoMs) : 'em andamento' },
      ]),
    });
  }
  if (t.sprints.length > 1 || (t.sprints.length === 1 && t.rounds.length > 1)) {
    tables.push({
      group: 'Por sprint', head: ['Sprint', 'Rodadas', '% sucesso', 'Bugs novos', 'Ainda abertos'],
      rows: t.sprints.map((s) => [{ text: s.sprint }, { text: String(s.rodadas) }, { text: s.sucessoPct === null ? '—' : `${s.sucessoPct}%` }, { text: String(s.bugsNovos) }, { text: String(s.bugsAbertos) }]),
    });
  }
  if (t.cases.length) {
    tables.push({
      group: 'Casos que mais falham', head: ['Caso', 'Título', 'Rodadas', 'FAIL/BLOCKED', 'Taxa de falha', 'Última', 'Tempo médio'],
      rows: t.cases.map((c) => [{ text: c.id, link: c.link }, { text: c.titulo }, { text: String(c.rodadas) }, { text: String(c.falhas) }, { text: `${c.taxa}%` }, { text: c.ultima ? `${c.ultima} ${shortDate(c.ultimaData)}` : '—', badge: statusKind(c.ultima) || undefined }, { text: durLabel(c.mediaMs) }]),
    });
  }
  if (t.bugMonths.length) {
    charts.push({
      title: 'Bugs por mês de abertura', unit: 'n', series: [{ name: 'Ainda abertos', kind: 'fail' }, { name: 'Já fechados', kind: 'pass' }],
      points: t.bugMonths.map((m) => ({ label: monthLabel(m.mes), values: [m.aindaAbertos, m.fechados], hint: `${monthLabel(m.mes)}: ${m.abertos} aberto(s) no mês — ${m.fechados} já fechado(s), ${m.aindaAbertos} ainda aberto(s)` })),
    });
    tables.push({
      group: 'Bugs por mês de abertura', head: ['Mês', 'Abertos no mês', 'Já fechados', 'Ainda abertos'],
      rows: [...t.bugMonths].reverse().map((m) => [{ text: monthLabel(m.mes) }, { text: String(m.abertos) }, { text: String(m.fechados) }, { text: String(m.aindaAbertos) }]),
    });
  }
  const withPct = t.rounds.filter((r) => r.sucessoPct !== null);
  const first = withPct[0];
  const last = withPct.at(-1);
  const parts: string[] = [];
  if (last) parts.push(withPct.length > 1 && first ? `% de sucesso: ${first.sucessoPct}% → ${last.sucessoPct}% em ${withPct.length} rodadas (${signed((last.sucessoPct as number) - (first.sucessoPct as number))})` : `% de sucesso na rodada: ${last.sucessoPct}%`);
  else parts.push('Nenhuma rodada com casos executados ainda');
  if (t.cases[0]) parts.push(`caso que mais falha: ${t.cases[0].id} (${t.cases[0].falhas} de ${t.cases[0].rodadas})`);
  if (t.tempoMedioMs) parts.push(`tempo médio por caso: ${durLabel(t.tempoMedioMs)}`);
  const open = rows.filter((d) => isBug(d) && bugOpen(d)).length;
  if (rows.some(isBug)) parts.push(`${open} bug(s) aberto(s)`);
  return { ...base, total: t.rounds.length, tables, charts, summary: parts.join(' · ') };
}

// ---------------------------------------------------------------- Markdown (cópia gerada, para ler fora do app)
const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function cellMd(c: ViewCell): string {
  if (c.link && !c.link.startsWith('jira:')) return `[[${esc(c.link)}${c.text !== c.link ? `\\|${esc(c.text)}` : ''}]]`;
  if (c.badge) return `\`${esc(c.text)}\``;
  return esc(c.text);
}

/** A visão como Markdown (tabelas / listas). */
export function viewMarkdown(r: ViewResult): string {
  const out: string[] = [];
  if (r.board) {
    for (const col of r.board) {
      out.push(`**${col.title}**`, '');
      out.push(...(col.cards.length ? col.cards.map((c) => `- ${c.link ? `[[${c.link}]] ` : ''}${c.link ? c.text.replace(/^[^—]*— /, '') : c.text}`) : ['- —']), '');
    }
  }
  // gráficos como barras de texto (legível no GitHub/Notion)
  for (const c of r.charts || []) {
    const max = c.unit === '%' ? 100 : Math.max(1, ...c.points.map((p) => p.values.reduce((a: number, v) => a + (v || 0), 0)));
    out.push(`**${c.title}**${c.series.length > 1 ? ` (${c.series.map((x) => x.name).join(' · ')})` : ''}`, '', '```text');
    const w = Math.max(...c.points.map((p) => p.label.length));
    for (const p of c.points) {
      const tot = p.values.reduce((a: number, v) => a + (v || 0), 0);
      const bar = '█'.repeat(Math.round((tot / max) * 24));
      out.push(`${p.label.padEnd(w)}  ${bar.padEnd(24)}  ${p.values[0] === null && p.values.length === 1 ? '—' : c.unit === '%' ? `${p.values[0]}%` : p.values.join(' · ')}`);
    }
    out.push('```', '');
  }
  for (const t of r.tables) {
    if (t.group) out.push(`**${t.group}**`, '');
    if (!t.rows.length) { out.push('_Nenhum documento._', ''); continue; }
    out.push(`| ${t.head.map(esc).join(' | ')} |`, `| ${t.head.map(() => '---').join(' | ')} |`, ...t.rows.map((row) => `| ${row.map(cellMd).join(' | ')} |`), '');
  }
  if (!r.board && !r.tables.length && !(r.charts || []).length) out.push(r.format === 'tendencia' ? '_Nenhuma rodada ainda._' : '_Nenhum documento._', '');
  return out.join('\n').trimEnd();
}

// ---------------------------------------------------------------- blocos ```qa-visao e cópia gerada no arquivo
export { VIEW_OPEN, VIEW_CLOSE, findViewBlocks, snapshotRanges, blankSnapshots } from './viewBlocks.ts';
export type { ViewBlock } from './viewBlocks.ts';

/**
 * Atualiza (ou cria) a cópia gerada de cada visão: Markdown comum entre os marcadores, para quem abre o
 * arquivo fora do editor (GitHub, hub, Notion). `render` roda a visão e devolve o Markdown.
 * Cópia com o marcador de fim apagado não é tocada (não apaga texto do usuário).
 */
export function syncViewSnapshots(text: string, render: (src: string) => string, stamp: string): string {
  const blocks = findViewBlocks(text);
  if (!blocks.length) return text;
  const lines = text.split('\n');
  for (const b of [...blocks].reverse()) {
    if (b.broken) continue;
    const body = render(b.src);
    const ind = (l: string): string => (l ? b.indent + l : l);
    const snap = [VIEW_OPEN, `_Cópia gerada pelo TestFlow em ${stamp} — atualizada ao salvar._`, '', ...body.split('\n'), VIEW_CLOSE].map(ind);
    if (b.snapshot) {
      const old = lines.slice(b.snapshot.open + 2, b.snapshot.close).map((l) => (l.startsWith(b.indent) ? l.slice(b.indent.length) : l)).join('\n').trim();
      if (old === body.trim()) continue; // nada mudou: não mexe (nem na data)
      lines.splice(b.snapshot.open, b.snapshot.close - b.snapshot.open + 1, ...snap);
    } else lines.splice(b.end + 1, 0, '', ...snap);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- visões prontas
export interface ViewPreset { id: string; label: string; hint: string; file: string; text: string }

const doc = (titulo: string, intro: string, query: string): string =>
  `---\ntipo: visao\ntitulo: ${formatValue(titulo)}\nqa-md: 1\n---\n\n# ${titulo}\n\n${intro}\n\n\`\`\`qa-visao\n${query.trim()}\n\`\`\`\n`;

export const VIEW_PRESETS: ViewPreset[] = [
  {
    id: 'nao-executados', label: 'Casos ainda não executados', hint: 'nenhum passo com status e nenhuma rodada, por aplicação', file: 'casos-nao-executados.md',
    text: doc('Casos ainda não executados', 'Casos e cenários sem nenhum passo executado e sem rodada no histórico, por aplicação. Clique num ID para abrir.',
      'titulo: Casos ainda não executados\ntipo: caso-de-teste, cenario-bdd\nexecucao: nunca\nagrupar: app\ncolunas: id, titulo, prioridade, jira, pasta\nordenar: prioridade'),
  },
  {
    id: 'tickets', label: 'Tickets / épicos em teste', hint: 'por chave do Jira: casos, executados, falhas e bugs abertos', file: 'tickets-em-teste.md',
    text: doc('Tickets e épicos em teste', 'Um ticket por linha (campo `jira` do cabeçalho): quantos casos, quantos executados, quantos com falha e os bugs abertos ligados a eles.',
      'titulo: Tickets e épicos em teste\nformato: jira\ntipo: caso-de-teste, cenario-bdd, bug'),
  },
  {
    id: 'regressao', label: 'Cobertura da regressão', hint: 'casos com tag regressao: executados na rodada atual, por aplicação', file: 'cobertura-regressao.md',
    text: doc('Cobertura da regressão', 'Casos com a tag `regressao`: quantos já foram executados na rodada atual (todos os passos com status), por aplicação. Para uma nova regressão, use 🔁 Nova rodada nos casos.',
      'titulo: Cobertura da regressão\nformato: cobertura\nmedida: execucao\ntipo: caso-de-teste, cenario-bdd\ntags: regressao\nagrupar: app'),
  },
  {
    id: 'automacao', label: 'Cobertura de automação', hint: 'casos com automacao: preenchido, por aplicação', file: 'cobertura-automacao.md',
    text: doc('Cobertura de automação', 'Casos funcionais com o campo `automacao:` preenchido (o spec do teste automatizado), por aplicação.',
      'titulo: Cobertura de automação\nformato: cobertura\nmedida: automacao\ntipo: caso-de-teste, cenario-bdd\nagrupar: app'),
  },
  {
    id: 'tendencia', label: 'Tendência entre rodadas', hint: '% de sucesso por rodada e sprint, casos que mais falham, bugs no tempo', file: 'tendencia.md',
    text: doc('Tendência entre rodadas', 'Como a qualidade evolui: % de sucesso por rodada (e a variação para a anterior), por sprint, os casos que mais falham no histórico e os bugs por mês de abertura. Para uma aplicação só, preencha `app:`; para as últimas N rodadas, `limite: N`.',
      'titulo: Tendência entre rodadas\nformato: tendencia\n# app: Portal\n# sprint: Sprint 9\n# limite: 12'),
  },
  {
    id: 'rastreabilidade', label: 'Rastreabilidade (ticket → casos → bugs)', hint: 'para uma versão: o que cada ticket cobre e o que ficou vermelho', file: 'rastreabilidade.md',
    text: doc('Rastreabilidade', 'Ticket do Jira → casos (status e última rodada) → bugs. Para ver só uma versão, preencha `versao:` (ex.: `versao: 2.14`).',
      'titulo: Rastreabilidade\nformato: rastreabilidade\ntipo: caso-de-teste, cenario-bdd, bug\n# versao: 2.14'),
  },
];

/** Consulta de uma visão a partir dos filtros do Painel. */
export function viewFromFilters(f: { titulo: string; statuses?: string[]; tipo?: string; tag?: string; folder?: string; app?: string; text?: string; comments?: boolean }): string {
  const lines = [`titulo: ${f.titulo}`];
  if (f.tipo) lines.push(`tipo: ${f.tipo}`);
  if (f.app) lines.push(`app: ${f.app}`);
  if (f.statuses?.length) lines.push(`status: ${f.statuses.map((s) => (s === 'none' ? SEM_STATUS : s.toUpperCase())).join(', ')}`);
  if (f.tag) lines.push(`tags: ${f.tag}`);
  if (f.folder) lines.push(`pasta: ${f.folder}`);
  if (f.text) lines.push(`texto: ${f.text}`);
  if (f.comments) lines.push('comentarios: pendentes');
  lines.push(`colunas: id, titulo, status, app, progresso${f.comments ? ', comentarios' : ''}`);
  return doc(f.titulo, 'Visão salva a partir do 📊 Painel.', lines.join('\n'));
}
