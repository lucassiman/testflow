import { TYPE_LABELS } from './frontmatter.ts';
import { statusKind } from './qa.ts';
import { STATUS_COLORS } from './status.ts';
import type { DashboardFilters, DashboardRow, DocEntry, StatusCounts, StatusKind } from '../types';

/** Ordenação em português com números naturais (um Collator só: localeCompare com opções é lento em listas grandes). */
const COLLATOR = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/**
 * Painel da pasta: uma linha por documento (status, progresso, prioridade, tags…),
 * com filtro, ordenação e exportação como Markdown. Funções puras.
 */

export type RowStatus = StatusKind | 'none';
export const STATUS_ORDER: RowStatus[] = ['fail', 'blocked', 'pending', 'skip', 'pass', 'none'];
export const STATUS_LABEL: Record<RowStatus, string> = { fail: 'FAIL', blocked: 'BLOCKED', pending: 'PENDING', skip: 'SKIP', pass: 'PASS', none: 'Sem status' };
const PRIORITY_ORDER = ['crítica', 'critica', 'alta', 'média', 'media', 'baixa'];

const norm = (s: unknown): string => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Entradas do índice da pasta → linhas do painel. */
export function buildRows(entries: DocEntry[]): DashboardRow[] {
  return entries.map((e): DashboardRow => {
    const kind: RowStatus = statusKind(e.overall || '') || 'none';
    const counts = e.counts || { pass: 0, fail: 0, blocked: 0, skip: 0, pending: 0, total: 0 };
    const tasks = e.tasks || { total: 0, done: 0 };
    // progresso: passos executados (tabelas de status); sem passos, itens de checklist marcados
    const progress: DashboardRow['progress'] = counts.total
      ? { done: counts.total - counts.pending, total: counts.total, kind: 'steps' }
      : { done: tasks.done, total: tasks.total, kind: 'tasks' };
    const folder = e.path.includes('/') ? e.path.split('/').slice(0, -1).join('/') : '';
    return {
      path: e.path,
      name: e.name,
      folder,
      id: e.id || '',
      title: e.titulo || e.heading || e.name.replace(/\.(md|markdown)$/i, ''),
      tipo: e.tipo || '',
      tipoLabel: TYPE_LABELS[e.tipo] || e.tipo || '',
      app: e.app || '',
      status: kind,
      prioridade: e.prioridade || e.severidade || '',
      counts,
      progress,
      tags: e.tags || [],
      responsavel: e.responsavel || '',
      ambiente: e.ambiente || '',
      data: e.data || '',
      lastModified: e.lastModified || 0,
      comments: e.comments?.open || 0,
      entry: e,
    };
  });
}

export function filterRows(rows: DashboardRow[], filters: DashboardFilters = {}): DashboardRow[] {
  const { text = '', statuses = [], tipo = '', tag = '', folder = '', app = '', comments = false } = filters;
  const q = norm(text).trim();
  return rows.filter((r) => {
    if (statuses.length && !statuses.includes(r.status)) return false;
    if (tipo && r.tipo !== tipo) return false;
    if (comments && !r.comments) return false;
    if (tag && !r.tags.includes(tag)) return false;
    if (app && r.app.toLowerCase() !== app.toLowerCase()) return false;
    if (folder && r.folder !== folder && !r.folder.startsWith(`${folder}/`)) return false;
    if (q && !norm([r.id, r.title, r.name, r.path, r.tags.join(' '), r.responsavel, r.prioridade, r.ambiente, r.app].join(' ')).includes(q)) return false;
    return true;
  });
}

const rank = (list: string[], v: string): number => { const i = list.indexOf(norm(v)); return i < 0 ? list.length : i; };

export type SortKey = 'status' | 'id' | 'title' | 'tipo' | 'prioridade' | 'progress' | 'responsavel' | 'updated' | 'folder';
type RowCompare = (a: DashboardRow, b: DashboardRow) => number;

export function sortRows(rows: DashboardRow[], key: SortKey | string = 'status', dir = 1): DashboardRow[] {
  const cmpText = (a: unknown, b: unknown): number => COLLATOR.compare(String(a), String(b));
  const by: RowCompare = ({
    status: (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
    id: (a, b) => cmpText(a.id || '~', b.id || '~'),
    title: (a, b) => cmpText(a.title, b.title),
    tipo: (a, b) => cmpText(a.tipoLabel || '~', b.tipoLabel || '~'),
    prioridade: (a, b) => rank(PRIORITY_ORDER, a.prioridade) - rank(PRIORITY_ORDER, b.prioridade),
    progress: (a, b) => (a.progress.total ? a.progress.done / a.progress.total : -1) - (b.progress.total ? b.progress.done / b.progress.total : -1),
    responsavel: (a, b) => cmpText(a.responsavel || '~', b.responsavel || '~'),
    updated: (a, b) => a.lastModified - b.lastModified,
    folder: (a, b) => cmpText(a.folder, b.folder),
  } as Record<string, RowCompare>)[key] || (() => 0);
  return [...rows].sort((a, b) => by(a, b) * dir || cmpText(a.id || a.title, b.id || b.title));
}

export function summarize(rows: DashboardRow[]): { docs: number; byStatus: Record<RowStatus, number>; steps: StatusCounts; comments: number } {
  const byStatus = Object.fromEntries(STATUS_ORDER.map((k) => [k, 0])) as Record<RowStatus, number>;
  const steps: StatusCounts = { pass: 0, fail: 0, blocked: 0, skip: 0, pending: 0, total: 0 };
  for (const r of rows) {
    byStatus[r.status]++;
    for (const k of Object.keys(steps) as Array<keyof StatusCounts>) steps[k] += r.counts[k] || 0;
  }
  return { docs: rows.length, byStatus, steps, comments: rows.filter((r) => r.comments).length };
}

const cell = (s: unknown): string => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** Painel como documento Markdown (tabela + resumo + gráfico). */
export function dashboardMarkdown(
  rows: DashboardRow[],
  { title = 'Painel da pasta', filters = '', now = new Date() }: { title?: string; filters?: string; now?: Date } = {},
): string {
  const s = summarize(rows);
  const stamp = now.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const out = [`# ${title}`, '', `_Gerado em ${stamp} · ${s.docs} documento${s.docs === 1 ? '' : 's'}${filters ? ` · filtro: ${filters}` : ''}_`, ''];
  const present = STATUS_ORDER.filter((k) => s.byStatus[k]);
  if (present.length) {
    out.push('| Status | Documentos |', '| --- | --- |', ...present.map((k) => `| ${k === 'none' ? 'Sem status' : `\`${STATUS_LABEL[k]}\``} | ${s.byStatus[k]} |`), '');
    const slices = present.filter((k) => k !== 'none');
    if (slices.length) {
      const vars = slices.map((k, i) => `"pie${i + 1}": "${STATUS_COLORS[k as StatusKind]}"`).join(', ');
      out.push('```mermaid', `%%{init: {"themeVariables": {${vars}, "pieOpacity": "0.9"}}}%%`, 'pie showData', '    title Documentos por status', ...slices.map((k) => `    "${STATUS_LABEL[k]}" : ${s.byStatus[k]}`), '```', '');
    }
  }
  if (s.steps.total) {
    out.push(`**Passos:** ${s.steps.total - s.steps.pending} de ${s.steps.total} executados · PASS ${s.steps.pass} · FAIL ${s.steps.fail} · BLOCKED ${s.steps.blocked} · SKIP ${s.steps.skip} · PENDING ${s.steps.pending}`, '');
  }
  out.push('| Status | Documento | Tipo | Prioridade | Progresso | Tags | Responsável | Pasta |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const link = r.id ? `[[${r.id}]]` : `[[${r.name.replace(/\.(md|markdown)$/i, '')}]]`;
    const label = r.id ? `${link} ${r.title}` : link;
    const progress = r.progress.total ? `${r.progress.done}/${r.progress.total}${r.progress.kind === 'tasks' ? ' ☑' : ''}` : '';
    out.push(`| ${r.status === 'none' ? '' : `\`${STATUS_LABEL[r.status]}\``} | ${cell(label)} | ${cell(r.tipoLabel)} | ${cell(r.prioridade)} | ${progress} | ${cell(r.tags.join(', '))} | ${cell(r.responsavel)} | ${cell(r.folder)} |`);
  }
  return `${out.join('\n')}\n`;
}
