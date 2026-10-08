import type { DocInfo } from '../types';
import { TYPE_LABELS } from './frontmatter.ts';
import { statusKind } from './qa.ts';
import { publishInfo } from './docState.ts';
import { jiraLinks } from './jiraLink.ts';

/**
 * O que a prévia de um [[link]] mostra ao passar o mouse (função pura: recebe o texto do documento ligado).
 */
export interface LastRound { round: number; date: string; overall: string }

/** Última rodada arquivada no "Histórico de execuções" (### Rodada N — data — `STATUS`). */
export function lastRound(text: string): LastRound | null {
  let best: LastRound | null = null;
  for (const m of text.matchAll(/^#{3,6}\s+Rodada\s+(\d+)\s*[—–-]\s*([^—–\n]*?)\s*(?:[—–-]\s*`?([A-Z]+)`?)?\s*$/gim)) {
    const round = Number(m[1]);
    if (!best || round > best.round) best = { round, date: m[2].trim(), overall: (m[3] || '').toUpperCase() };
  }
  return best;
}

export interface LinkCard {
  id: string;
  title: string;
  typeLabel: string;
  status: string;
  statusKind: string | null;
  app: string;
  path: string;
  /** "3/5 passos executados · 1 FAIL" (vazio sem tabela de passos) */
  progress: string;
  last: LastRound | null;
  published: string;
  jira: Array<{ key: string; url: string }>;
}

export function linkCard(info: DocInfo, text: string, o: { path?: string; jiraBase?: string } = {}): LinkCard {
  const c = info.counts;
  const done = c.total - c.pending;
  const bad = [c.fail ? `${c.fail} FAIL` : '', c.blocked ? `${c.blocked} BLOCKED` : ''].filter(Boolean).join(' · ');
  const progress = c.total ? `${done}/${c.total} passos executados${bad ? ` · ${bad}` : ''}` : info.tasks.total ? `${info.tasks.done}/${info.tasks.total} itens do checklist` : '';
  const p = publishInfo(text);
  const status = info.overall || info.status || '';
  return {
    id: info.id,
    title: info.titulo || info.heading || '',
    typeLabel: TYPE_LABELS[info.tipo] || info.tipo || 'Documento',
    status,
    statusKind: status ? statusKind(status) : null,
    app: info.app,
    path: o.path || '',
    progress,
    last: lastRound(text),
    published: p.state === 'published' ? `🏛 publicado r${p.revisao}` : p.state === 'changed' ? `✎ alterado desde a r${p.revisao}` : '',
    jira: jiraLinks(info.jira, o.jiraBase || ''),
  };
}
