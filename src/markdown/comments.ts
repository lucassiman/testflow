/**
 * Comentários de revisão (funções puras). Convenção legível em qualquer lugar (GitHub, hub, Notion):
 *
 *   > [!COMMENT] @Lucas · 29/09/2026 14:02
 *   > O passo 3 não diz qual usuário usar.
 *   >
 *   > ↳ **@Ana** · 29/09/2026 15:10 — usar o usuário padrão de HML.
 *
 * Resolvido: o marcador vira [!RESOLVED] e ganha a linha "> ✓ Resolvido por @Ana · 29/09/2026 15:12".
 */

export const COMMENT_MARK = /^\s{0,3}>\s?\[!(COMMENT|RESOLVED)\][ \t]*(.*)$/i;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const QUOTE = /^\s{0,3}>/;

export interface ReviewComment {
  /** linha do marcador */
  start: number;
  /** última linha da citação */
  end: number;
  resolved: boolean;
  /** "@Lucas · 29/09/2026 14:02" */
  head: string;
  author: string;
  /** primeira linha do texto (para listas) */
  summary: string;
  replies: number;
  /** recuo do comentário (dentro de item de lista): as linhas novas usam o mesmo */
  indent: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');
export const stamp = (d = new Date()): string => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const at = (who: string): string => `@${who.trim().replace(/^@+/, '').replace(/\s+/g, ' ') || 'revisor'}`;
const unquote = (l: string): string => l.replace(/^\s{0,3}>\s?/, '');

/** Comentários do documento (fora de blocos de código). */
export function findComments(text: string): ReviewComment[] {
  const lines = text.split('\n');
  const out: ReviewComment[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const f = FENCE.exec(lines[i]);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length && lines[i].trim() === f[1]) fence = null; continue; }
    if (f) { fence = f[1]; continue; }
    const m = COMMENT_MARK.exec(lines[i]);
    if (!m) continue;
    let end = i;
    while (end + 1 < lines.length && QUOTE.test(lines[end + 1])) end++;
    const body = lines.slice(i + 1, end + 1).map(unquote);
    const head = m[2].trim();
    out.push({
      start: i, end,
      resolved: m[1].toUpperCase() === 'RESOLVED',
      head,
      author: (/@(.+?)\s*·/.exec(head) || /@(\S+)/.exec(head))?.[1]?.trim() || '',
      summary: body.find((l) => l.trim() && !l.startsWith('↳') && !l.startsWith('✓'))?.trim() || '',
      replies: body.filter((l) => l.startsWith('↳')).length,
      indent: /^\s*/.exec(lines[i])?.[0] || '',
    });
    i = end;
  }
  return out;
}

export function countComments(text: string): { open: number; resolved: number } {
  if (!text.includes('[!')) return { open: 0, resolved: 0 };
  const list = findComments(text);
  return { open: list.filter((c) => !c.resolved).length, resolved: list.filter((c) => c.resolved).length };
}

/** O bloco de um comentário novo. */
export function commentBlock(who: string, body: string, when = new Date()): string {
  const text = body.trim() ? body.trim().split('\n').map((l) => (l.trim() ? `> ${l}` : '>')) : ['> '];
  return [`> [!COMMENT] ${at(who)} · ${stamp(when)}`, ...text].join('\n');
}

function find(text: string, start: number): { lines: string[]; c: ReviewComment } | null {
  const c = findComments(text).find((x) => x.start === start);
  return c ? { lines: text.split('\n'), c } : null;
}

/** Resolver: [!COMMENT] → [!RESOLVED] + "✓ Resolvido por". */
export function resolveComment(text: string, start: number, who: string, when = new Date()): string {
  const f = find(text, start);
  if (!f || f.c.resolved) return text;
  const { lines, c } = f;
  lines[c.start] = lines[c.start].replace(/\[!COMMENT\]/i, '[!RESOLVED]');
  lines.splice(c.end + 1, 0, `${c.indent}>`, `${c.indent}> ✓ Resolvido por ${at(who)} · ${stamp(when)}`);
  return lines.join('\n');
}

/** Reabrir: volta a [!COMMENT] e tira a linha "✓ Resolvido por". */
export function reopenComment(text: string, start: number): string {
  const f = find(text, start);
  if (!f || !f.c.resolved) return text;
  const { lines, c } = f;
  lines[c.start] = lines[c.start].replace(/\[!RESOLVED\]/i, '[!COMMENT]');
  let last = c.end;
  if (/^✓ Resolvido por/.test(unquote(lines[last]).trim())) {
    lines.splice(last, 1);
    last--;
    if (last > c.start && !unquote(lines[last]).trim()) lines.splice(last, 1);
  }
  return lines.join('\n');
}

/** Responder: "↳ **@Ana** · data — texto" no fim do comentário (antes do "✓ Resolvido", se houver). */
export function replyComment(text: string, start: number, who: string, reply: string, when = new Date()): string {
  const f = find(text, start);
  if (!f || !reply.trim()) return text;
  const { lines, c } = f;
  let pos = c.end + 1;
  if (c.resolved && /^✓ Resolvido por/.test(unquote(lines[c.end]).trim())) pos = c.end - (unquote(lines[c.end - 1] || '').trim() ? 0 : 1);
  const one = reply.trim().replace(/\s*\n\s*/g, ' ');
  lines.splice(pos, 0, `${c.indent}>`, `${c.indent}> ↳ **${at(who)}** · ${stamp(when)} — ${one}`);
  return lines.join('\n');
}

/** O texto sem os comentários (para Jira, hub, Notion: são notas internas de revisão). */
export function stripComments(text: string): string {
  const list = findComments(text);
  if (!list.length) return text;
  const lines = text.split('\n');
  for (const c of [...list].reverse()) {
    let end = c.end;
    // leva junto uma linha em branco, para não sobrar duas seguidas
    if (!(lines[end + 1] ?? 'x').trim() && (c.start === 0 || !lines[c.start - 1].trim())) end++;
    lines.splice(c.start, end - c.start + 1);
  }
  return lines.join('\n');
}
