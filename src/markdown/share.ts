import { imageAlt } from './images.ts';
import { detectFrontMatter, parseFrontMatter, TYPE_LABELS } from './frontmatter.ts';
import type { FrontMatterValue } from './frontmatter.ts';
import type { StatusKind } from '../types';
import { collectStatusTables, splitRow, countStatuses, deriveOverall, countTasks, HISTORY_TITLE, cellStatus } from './status.ts';
import { findSection, cellToText, countNotes } from './runs.ts';

/**
 * "Copiar para o Claude": trechos do documento já montados para colar no chat,
 * com contexto (cabeçalho) e um pedido pronto no fim.
 */

type Meta = Record<string, FrontMatterValue>;

function meta(source: string): Meta {
  const fm = detectFrontMatter(source);
  return fm ? parseFrontMatter(source.split('\n').slice(0, fm.end).join('\n')).data : {};
}

function contextLines(data: Meta, fileName: string): string[] {
  const out: string[] = [];
  const title = [data.id, data.titulo].filter(Boolean).join(' — ') || fileName;
  out.push(`**Documento:** ${title}${data.tipo ? ` (${TYPE_LABELS[String(data.tipo)] || data.tipo})` : ''}`);
  const env = [['Ambiente', data.ambiente], ['Browser', data.browser], ['Dispositivo', data.dispositivo], ['Versão', data.versao], ['Data', data.data], ['Jira', Array.isArray(data.jira) ? data.jira.join(', ') : data.jira], ['Status do documento', data.status]]
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${v}`);
  if (env.length) out.push(`**Contexto:** ${env.join(' · ')}`);
  return out;
}

/** Linhas de tabelas de execução com um dos status pedidos, como texto legível. */
function rowsWith(source: string, kinds: StatusKind[]): string[] {
  const lines = source.split('\n');
  const out: string[] = [];
  for (const t of collectStatusTables(source)) {
    const head = splitRow(lines[t.header]).map((h) => cellToText(h).replace(/[`*_]/g, ''));
    for (const r of t.rows) {
      if (!r.status || !kinds.includes(r.status) || !(r.raw || '').replace(/[`\s]/g, '')) continue;
      const cells = splitRow(lines[r.line]);
      const parts = head.map((h, i) => [h, cellToText(cells[i] || '').replace(/`/g, '').trim()])
        .filter(([h, v], i) => v && i !== t.col && h)
        .map(([h, v]) => `${h}: ${v.replace(/\n/g, ' / ')}`);
      out.push(`- **${(r.raw || '').replace(/`/g, '').trim().toUpperCase()}** — ${parts.join(' · ')}`);
    }
  }
  return out;
}

function images(source: string): Array<{ alt: string; path: string }> {
  return [...source.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)].map((m) => ({ alt: imageAlt(m[1]), path: m[2] }));
}

/** Seção "Falhas" (relatório de automação), sem os marcadores de UI. */
function failuresSection(source: string): string {
  const lines = source.split('\n');
  const sec = findSection(lines, /^falhas\b/i);
  if (!sec) return '';
  const body = lines.slice(sec.start, sec.end).join('\n').trim();
  return body.length > 12000 ? `${body.slice(0, 12000)}\n\n[…cortado — ${body.length - 12000} caracteres a mais no documento]` : body;
}

/** Falhas + bloqueios para pedir análise / bug report. */
export function copyFailures(source: string, fileName = ''): string | null {
  const data = meta(source);
  const failed = rowsWith(source, ['fail']);
  const blocked = rowsWith(source, ['blocked']);
  const auto = failuresSection(source);
  const imgs = images(source).filter((i) => /passo|falha|erro|bug|evid/i.test(i.alt) || /evidencias\//.test(i.path));
  if (!failed.length && !blocked.length && !auto) return null;
  const out = ['## Falhas para análise', '', ...contextLines(data, fileName), ''];
  if (failed.length) out.push(`### Passos com FAIL (${failed.length})`, '', ...failed, '');
  if (blocked.length) out.push(`### Passos BLOQUEADOS (${blocked.length})`, '', ...blocked, '');
  if (auto) out.push('### Falhas da automação', '', auto, '');
  if (imgs.length) out.push('### Evidências no documento', '', ...imgs.map((i) => `- ${i.alt || 'print'}: \`${i.path}\``), '', '_(anexo os prints, se precisar)_', '');
  out.push('---', '', 'Analise as falhas acima: aponte a causa provável de cada uma, o que investigar primeiro e se é defeito do produto, de ambiente/dado ou do teste. '
    + 'Para cada defeito do produto, escreva um bug report no formato QA-MD (`tipo: bug`, com passos para reproduzir, resultado esperado × obtido e severidade sugerida). Não invente dados que não estão aqui.');
  return out.join('\n');
}

/** Resumo da execução para pedir um status report. */
export function copySummary(source: string, fileName = ''): string {
  const data = meta(source);
  const counts = countStatuses(source);
  const tasks = countTasks(source);
  const notes = countNotes(source);
  const lines = source.split('\n');
  const out = ['## Resumo da execução', '', ...contextLines(data, fileName), ''];
  if (counts.total) {
    const executed = counts.total - counts.pending;
    out.push(`**Resultado:** ${executed} de ${counts.total} executados · status geral ${deriveOverall(counts) || '—'}`,
      `**Por status:** PASS ${counts.pass} · FAIL ${counts.fail} · BLOCKED ${counts.blocked} · SKIP ${counts.skip} · PENDING ${counts.pending}`);
  }
  if (tasks.total) out.push(`**Checklist:** ${tasks.done} de ${tasks.total} itens marcados`);
  if (notes.total) out.push(`**Sessão exploratória:** ${notes.total} notas — ${notes.BUG} BUG, ${notes['DÚVIDA']} DÚVIDA, ${notes.IDEIA} IDEIA`);
  out.push('');
  const bad = rowsWith(source, ['fail', 'blocked']);
  if (bad.length) out.push('### Falhas e bloqueios', '', ...bad.slice(0, 60), bad.length > 60 ? `- … e mais ${bad.length - 60}` : '', '');
  const pend = rowsWith(source, ['pending']).length;
  if (pend) out.push(`_${pend} passo(s) com PENDING explícito._`, '');
  // rodadas anteriores
  const hist = findSection(lines, HISTORY_TITLE);
  if (hist) {
    const rows = lines.slice(hist.start, hist.end).filter((l) => /^\|\s*\d+\s*\|/.test(l));
    if (rows.length) out.push('### Rodadas anteriores', '', '| Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável |', '| --- | --- | --- | --- | --- | --- | --- | --- |', ...rows, '');
  }
  // notas BUG / DÚVIDA da sessão
  const notesSec = findSection(lines, /^notas( da sess[aã]o)?\b/i);
  if (notesSec) {
    const important = lines.slice(notesSec.start, notesSec.end).filter((l) => /\*\*(BUG|DÚVIDA):\*\*/.test(l));
    if (important.length) out.push('### Notas importantes da sessão', '', ...important, '');
  }
  out.push('---', '', 'Com base nisso, escreva um status report curto para o time (3–6 linhas): situação geral, riscos/bloqueios, próximos passos e recomendação (liberar / liberar com ressalvas / não liberar). Não invente números.');
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/** Documento inteiro + instruções para o Claude trabalhar nele sem quebrar o formato. */
export function copyWithInstructions(source: string, fileName = ''): string {
  const data = meta(source);
  let ticks = '````';
  while (source.includes(ticks)) ticks += '`';
  return [
    `Segue o documento de QA \`${fileName}\`${data.tipo ? ` (${TYPE_LABELS[String(data.tipo)] || data.tipo})` : ''} no formato QA-MD do TestFlow.`,
    'Ao alterar, mantenha: o cabeçalho YAML, a tabela de passos (`# | Ação | Resultado esperado | Resultado obtido | Status`), status só como `PASS`/`FAIL`/`BLOCKED`/`SKIP`/`PENDING` entre crases, os alertas `> [!NOTE]`… e os links de evidência. '
      + 'Não mexa no bloco entre `<!-- qa:resumo -->` e `<!-- /qa:resumo -->` nem na seção "Histórico de execuções". Devolva o documento completo em um bloco ```markdown.'
      + (/\{\{[A-Z]+_\d+\}\}/.test(source) ? ' Marcadores como `{{EMAIL_1}}` e `{{SENHA_1}}` substituem dados sensíveis: mantenha-os exatamente como estão.' : ''),
    '',
    `${ticks}markdown`,
    source.replace(/\n+$/, ''),
    ticks,
    '',
    'Pedido: ',
  ].join('\n');
}

export { cellStatus };
