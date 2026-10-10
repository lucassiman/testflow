/**
 * Convenções visuais de QA — tudo continua Markdown padrão (GitHub/GFM):
 *
 * 1) Badges de status: código inline com uma palavra de status vira etiqueta colorida.
 *    `PASS` `FAIL` `BLOCKED` `SKIP` `PENDING` (e sinônimos em português)
 *
 * 2) Caixas de destaque (alertas do GitHub):
 *    > [!NOTE]  > [!TIP]  > [!IMPORTANT]  > [!WARNING]  > [!CAUTION]
 */

import type { MarkdownIt, RendererRule } from 'markdown-it';
import type { StatusKind } from '../types';

export const STATUS: Record<StatusKind, string[]> = {
  pass: ['PASS', 'PASSED', 'OK', 'SUCESSO', 'APROVADO', 'PASSOU'],
  fail: ['FAIL', 'FAILED', 'NOK', 'FALHOU', 'FALHA', 'REPROVADO', 'ERRO', 'ERROR'],
  blocked: ['BLOCKED', 'BLOQUEADO', 'IMPEDIDO'],
  skip: ['SKIP', 'SKIPPED', 'N/A', 'NA', 'IGNORADO', 'NÃO SE APLICA'],
  pending: ['PENDING', 'PENDENTE', 'WIP', 'EM ANDAMENTO', 'RETEST', 'RETESTE', 'TODO'],
};
const STATUS_OF = new Map<string, StatusKind>();
(Object.entries(STATUS) as Array<[StatusKind, string[]]>).forEach(([kind, words]) => words.forEach((w) => STATUS_OF.set(w, kind)));

export function statusKind(text: unknown): StatusKind | null {
  return STATUS_OF.get(String(text).trim().toUpperCase()) || null;
}

// ---------------------------------------------------------------- status personalizados (11.3)
/** Status a mais da pasta (ex.: RETESTE, FALHA CONHECIDA): a palavra, como conta (um dos 5), a cor e a descrição. */
export interface CustomStatus { word: string; kind: StatusKind; color: string; label: string }
const BASE_STATUS = new Map(STATUS_OF);
let custom: CustomStatus[] = [];
let customSig = '';
/** Registra os status personalizados (troca os anteriores). As palavras valem em toda contagem como o tipo delas. */
export function setCustomStatuses(list: CustomStatus[]): boolean {
  // as 5 palavras de sempre não mudam; sinônimos (ex.: RETESTE) podem ganhar cor e outra regra
  const clean = list.filter((c) => c.word.trim() && !['PASS', 'FAIL', 'BLOCKED', 'SKIP', 'PENDING'].includes(c.word.trim().toUpperCase()));
  const sig = JSON.stringify(clean);
  if (sig === customSig) return false;
  customSig = sig;
  STATUS_OF.clear();
  BASE_STATUS.forEach((k, w) => STATUS_OF.set(w, k));
  custom = clean.map((c) => ({ ...c, word: c.word.trim().toUpperCase() }));
  for (const c of custom) STATUS_OF.set(c.word, c.kind);
  return true;
}
export const customStatuses = (): CustomStatus[] => custom;
/** O status personalizado desta palavra (ou undefined). */
export const customOf = (word: unknown): CustomStatus | undefined => custom.find((c) => c.word === String(word ?? '').replace(/[`*_]/g, '').trim().toUpperCase());
/** Muda quando os status personalizados mudam (o Preview redesenha as etiquetas). */
export const statusSig = (): string => customSig;
/** Etiqueta HTML de um status (com a cor do personalizado). */
export function badgeHtml(word: string, esc: (s: string) => string): string {
  const kind = statusKind(word);
  if (!kind) return esc(word);
  const c = customOf(word);
  return c ? `<code class="badge badge-${kind} badge-custom" style="--badge:${esc(c.color)}" title="${esc(c.label || word)} — conta como ${kind.toUpperCase()}">${esc(word)}</code>` : `<code class="badge badge-${kind}">${esc(word)}</code>`;
}

export type AlertType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';

export const ALERTS: Record<AlertType, { label: string; icon: string }> = {
  NOTE: { label: 'Nota', icon: 'ℹ️' },
  TIP: { label: 'Dica', icon: '💡' },
  IMPORTANT: { label: 'Importante', icon: '📌' },
  WARNING: { label: 'Atenção', icon: '⚠️' },
  CAUTION: { label: 'Cuidado', icon: '⛔' },
};
const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;
/** Comentário de revisão: > [!COMMENT] @fulano · data (ver comments.ts) */
const COMMENT_RE = /^\[!(COMMENT|RESOLVED)\][ \t]*(.*)$/i;

export function qaPlugin(md: MarkdownIt): void {
  // ---- badges
  const defaultCode = md.renderer.rules.code_inline as RendererRule;
  md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
    const kind = statusKind(tokens[idx].content);
    if (kind) return badgeHtml(tokens[idx].content, md.utils.escapeHtml);
    return defaultCode(tokens, idx, options, env, self);
  };

  // ---- alertas: > [!NOTE] na primeira linha da citação
  md.core.ruler.after('inline', 'qa-alerts', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length - 2; i++) {
      if (tokens[i].type !== 'blockquote_open') continue;
      const para = tokens[i + 1];
      const inline = tokens[i + 2];
      if (para?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;
      const firstLine = inline.content.split('\n')[0];
      const m = ALERT_RE.exec(firstLine);
      const cm = m ? null : COMMENT_RE.exec(firstLine);
      if (!m && !cm) continue;
      if (m) tokens[i].meta = { ...(tokens[i].meta || {}), alert: m[1].toUpperCase() as AlertType };
      else if (cm) tokens[i].meta = { ...(tokens[i].meta || {}), comment: { resolved: cm[1].toUpperCase() === 'RESOLVED', head: cm[2].trim() } };

      // remove a linha do marcador (e a quebra seguinte) do conteúdo
      const kids = inline.children || [];
      let cut = 0;
      while (cut < kids.length && kids[cut].type !== 'softbreak' && kids[cut].type !== 'hardbreak') cut++;
      inline.children = kids.slice(cut + 1);
      inline.content = inline.content.split('\n').slice(1).join('\n');
      if (!inline.children.length) {
        // marcador sozinho no parágrafo: esconde o parágrafo vazio
        para.hidden = true;
        tokens[i + 3].hidden = true;
      }
    }
  });

  const defaultBlockquote: RendererRule = md.renderer.rules.blockquote_open
    || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
    const comment = tokens[idx].meta?.comment as { resolved: boolean; head: string } | undefined;
    if (comment) {
      const kind = comment.resolved ? 'resolved' : 'comment';
      return `<blockquote class="alert alert-${kind}" data-comment="${kind}">\n`
        + `<p class="alert-title"><span aria-hidden="true">${comment.resolved ? '✅' : '💬'}</span> ${comment.resolved ? 'Comentário resolvido' : 'Comentário'}${comment.head ? ` <span class="comment-head">${md.utils.escapeHtml(comment.head)}</span>` : ''}</p>\n`;
    }
    const type = tokens[idx].meta?.alert as AlertType | undefined;
    if (!type) return defaultBlockquote(tokens, idx, options, env, self);
    const { label, icon } = ALERTS[type];
    return `<blockquote class="alert alert-${type.toLowerCase()}" data-alert="${type}">\n`
      + `<p class="alert-title ui-only"><span aria-hidden="true">${icon}</span> ${label}</p>\n`;
  };
}
