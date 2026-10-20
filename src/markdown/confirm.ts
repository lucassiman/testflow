/**
 * Teste de confirmação (funções puras): o bug vira executável. Os "Passos para reproduzir" viram uma tabela de passos
 * na seção "## Teste de confirmação" do próprio bug (o último passo leva o "Resultado esperado"); ▶ Executar roda ela
 * como num caso, a rodada vai para o "Histórico de execuções" do bug e o resultado entra no "## Andamento".
 *
 *   ## Teste de confirmação
 *   | # | Ação | Resultado esperado | Resultado obtido | Status |
 *   | 1 | Abrir o pedido e clicar em Estornar Pix | | | |
 *   | 2 | Abrir o extrato do banco | Um lançamento de estorno de R$ 49,90 | | |
 *
 * PASS = corrigido (o app pergunta antes de fechar o bug); FAIL = a correção não resolveu (bug fechado volta a abrir).
 * O status do bug é do QA: os passos não mexem nele (ver setFrontMatterStatus).
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { findSection } from './runs.ts';
import { setFrontMatterFields } from './publish.ts';
import type { StatusWord } from '../types';

export const CONFIRM_STEPS_TITLE = /^teste de confirma[cç][aã]o\b/i;
const REPRO_TITLE = /^passos para reproduzir\b|^passos\b|^como reproduzir\b/i;
const EXPECTED_TITLE = /^resultado esperado\b/i;
const PROGRESS_TITLE = /^andamento\b/i;
const pad = (n: number): string => String(n).padStart(2, '0');
const cellEsc = (s: string): string => s.replace(/(^|[^\\])\|/g, '$1\\|').replace(/\s*\n\s*/g, ' ').trim();

function meta(text: string): Record<string, unknown> {
  const fm = detectFrontMatter(text);
  return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {};
}
const str = (v: unknown): string => (v === undefined || v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v).trim());

/** É um bug (`tipo: bug`)? */
export const isBugText = (text: string): boolean => str(meta(text).tipo).toLowerCase() === 'bug';

/** O bug já tem a tabela do teste de confirmação? */
export function hasConfirmSteps(text: string): boolean {
  const lines = text.split('\n');
  const sec = findSection(lines, CONFIRM_STEPS_TITLE);
  if (!sec) return false;
  return lines.slice(sec.start, sec.end).some((l, i, a) => l.includes('|') && /^\s*\|?\s*:?-{2,}/.test(a[i + 1] || '') && /status/i.test(l));
}

/** Texto de um trecho do bug: sem callouts, comentários e linhas em branco, numa linha só. */
function plain(lines: string[]): string {
  return lines
    .filter((l) => !/^\s*>\s*\[!\w+\]/.test(l) && !/^\s*<!--/.test(l) && l.trim())
    .map((l) => l.replace(/^\s*>\s?/, '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Os passos do bug: itens de "Passos para reproduzir" (lista numerada ou com marcadores), sem os vazios do modelo. */
export function reproSteps(text: string): string[] {
  const lines = text.split('\n');
  const sec = findSection(lines, REPRO_TITLE);
  if (!sec) return [];
  const out: string[] = [];
  for (let i = sec.start; i < sec.end; i++) {
    const m = /^\s{0,3}(?:\d+[.)]|[-*+])\s+(.*)$/.exec(lines[i]);
    if (m) { if (m[1].trim()) out.push(m[1].trim()); continue; }
    // continuação de um item (linha recuada)
    if (out.length && /^\s{2,}\S/.test(lines[i])) out[out.length - 1] = `${out[out.length - 1]} ${lines[i].trim()}`;
  }
  return out;
}

/** O "Resultado esperado" do bug (o critério de que foi corrigido). */
export function expectedOf(text: string): string {
  const lines = text.split('\n');
  const sec = findSection(lines, EXPECTED_TITLE);
  return sec ? plain(lines.slice(sec.start, sec.end)) : '';
}

/** A tabela de passos do teste de confirmação, montada a partir do bug. */
export function confirmTable(text: string): string[] {
  const steps = reproSteps(text);
  const expected = expectedOf(text) || 'O defeito não acontece mais';
  const rows = steps.length ? steps : ['Reproduzir o defeito como descrito no bug'];
  return [
    '| # | Ação | Resultado esperado | Resultado obtido | Status |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((s, i) => `| ${i + 1} | ${cellEsc(s)} | ${i === rows.length - 1 ? cellEsc(expected) : ''} |  |  |`),
  ];
}

/**
 * Garante a seção "## Teste de confirmação" com a tabela de passos (antes de "Evidências", senão depois de
 * "Resultado obtido", senão no fim). Já existe: devolve o mesmo texto.
 */
export function ensureConfirmSteps(text: string): { text: string; added: boolean } {
  if (hasConfirmSteps(text)) return { text, added: false };
  const lines = text.replace(/\n+$/, '').split('\n');
  const block = [
    '## Teste de confirmação', '',
    'Refaz os passos do bug na versão corrigida (**▶ Executar**): `PASS` = corrigido. Cada vez fica no *Histórico de execuções* e no *Andamento*.', '',
    ...confirmTable(text), '',
  ];
  const old = findSection(lines, CONFIRM_STEPS_TITLE);
  if (old) {
    // seção sem tabela (escrita à mão): a tabela entra no fim dela
    let at = old.end;
    while (at > old.start && !lines[at - 1].trim()) at--;
    lines.splice(at, 0, '', ...block.slice(4));
  } else {
    const ev = findSection(lines, /^evid[eê]ncias?\b/i, { maxLevel: 2 });
    const got = findSection(lines, /^resultado obtido\b/i, { maxLevel: 2 });
    const at = ev ? ev.heading : got ? got.end : lines.length;
    if (at === lines.length) lines.push('');
    lines.splice(at, 0, ...block);
  }
  return { text: `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`, added: true };
}

/** Bug fechado (PASS, corrigido, fechado…)? */
export function bugIsClosed(status: string): boolean {
  const s = status.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return /^(pass|ok|skip|fechad|resolvid|closed|done|conclu|corrigid|cancelad)/.test(s);
}

/** O Jira já concluiu (campo `jira_status: Pronto (concluído)`)? É o bug que está esperando a confirmação. */
export const jiraDone = (jiraStatus: string): boolean => /\(\s*conclu[ií]d[oa]\s*\)|^(done|conclu[ií]d[oa]|pronto|resolvid[oa]|fechad[oa])\b/i.test(jiraStatus.trim());

export interface ConfirmRun {
  overall: StatusWord | string;
  when: Date;
  /** execução em que rodou (ID) */
  exec?: string;
  versao?: string;
  ambiente?: string;
  /** primeiro passo que falhou: "5 — obtido: dois lançamentos" */
  failed?: string;
  /** PASS: fechar o bug (o QA confirmou) */
  close?: boolean;
}

/**
 * Registra o resultado do teste de confirmação no "## Andamento" do bug (cria a seção no fim) e, se for o caso, muda o
 * status: PASS com `close` → PASS (fechado); FAIL num bug fechado → FAIL (reaberto). Não mexe no resto do documento.
 */
export function logConfirmation(text: string, r: ConfirmRun): { text: string; closed: boolean; reopened: boolean; previous: string } {
  const previous = str(meta(text).status);
  const word = String(r.overall).toUpperCase();
  const wasClosed = !!previous && bugIsClosed(previous);
  const closed = word === 'PASS' && !!r.close && !wasClosed;
  const reopened = word === 'FAIL' && wasClosed;
  let out = closed ? setFrontMatterFields(text, { status: 'PASS' }) : reopened ? setFrontMatterFields(text, { status: 'FAIL' }) : text;
  const d = r.when;
  const stamp = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const where = [r.versao && `versão ${r.versao}`, r.ambiente].filter(Boolean).join(' · ');
  const icon = word === 'PASS' ? '✅' : word === 'FAIL' ? '❌' : word === 'BLOCKED' ? '⛔' : '⏭';
  const what = word === 'PASS'
    ? (closed ? 'corrigido — bug fechado' : wasClosed ? 'continua corrigido' : 'corrigido — o bug ficou aberto')
    : word === 'FAIL' ? `a correção não resolveu${r.failed ? ` (passo ${r.failed})` : ''}${reopened ? ` — bug reaberto (estava \`${previous}\`)` : ''}`
    : `não deu para confirmar${r.failed ? ` (passo ${r.failed})` : ''}`;
  const entry = `- ${stamp} — ${icon} Teste de confirmação \`${word}\`${r.exec ? ` em [[${r.exec}]]` : ''}${where ? ` (${where})` : ''}: ${what}.`;
  const lines = out.replace(/\n+$/, '').split('\n');
  const sec = findSection(lines, PROGRESS_TITLE);
  if (sec) {
    let end = sec.end;
    while (end > sec.start && !lines[end - 1].trim()) end--;
    lines.splice(end, 0, ...(end > sec.start && lines[end - 1].trim() ? [] : ['']), entry);
  } else {
    lines.push('', '## Andamento', '', entry);
  }
  out = `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
  return { text: out, closed, reopened, previous };
}
