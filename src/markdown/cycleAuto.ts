/**
 * Testes automatizados de uma execução: o relatório (JUnit / Playwright / Newman) anexado vira a seção
 * "## Testes automatizados" do documento da execução, ao lado dos casos manuais e SEM misturar com eles:
 * a tabela usa a coluna "Resultado" (não "Status"), então não entra na contagem nem na % de sucesso dos manuais.
 * A seção em si é gerada por `buildAutomationBlock` (automationReport.js); aqui só ler/trocar/somar. Lógica pura.
 *
 *   ## Testes automatizados
 *   > 🤖 **Playwright** — `resultado.json` · importado em 06/10/2026 14:02
 *   ### Resultados
 *   | # | Teste | Arquivo | Duração | Caso | Resultado | Obs |
 *   | 1 | login @TC-1 | login.spec.ts:7 | 1,2 s | TC-1 | `PASS` | |
 */
import { splitRow, normHeader, cellStatus } from './status.ts';
import { findSection } from './runs.ts';
import type { StatusCounts } from '../types';

export const AUTO_TITLE = /^testes automatizados\b/i;
const CLOSE_TITLE = /^encerramento\b/i;

export interface AutoSummary {
  /** ferramenta (Playwright, JUnit, Newman) */
  tool: string;
  /** arquivo de onde veio */
  fonte: string;
  total: number;
  pass: number;
  fail: number;
  blocked: number;
  skip: number;
  /** passaram só depois de retry */
  flaky: number;
  /** PASS ÷ (PASS + FAIL + BLOCKED) */
  sucessoPct: number | null;
  falhas: Array<{ titulo: string; obs: string }>;
  /** casos manuais citados nos testes (TC-1…) */
  casos: string[];
}

/** O documento tem a seção "Testes automatizados"? */
export const hasAuto = (text: string): boolean => !!findSection(text.split('\n'), AUTO_TITLE);

/** Números do relatório anexado (null = a execução não tem). */
export function autoSummary(text: string): AutoSummary | null {
  const lines = text.split('\n');
  const sec = findSection(lines, AUTO_TITLE);
  if (!sec) return null;
  const intro = lines.slice(sec.start, sec.end).find((l) => l.includes('🤖')) || '';
  const out: AutoSummary = {
    tool: /\*\*([^*]+)\*\*/.exec(intro)?.[1]?.trim() || 'Automação', fonte: /`([^`]+)`/.exec(intro)?.[1] || '',
    total: 0, pass: 0, fail: 0, blocked: 0, skip: 0, flaky: 0, sucessoPct: null, falhas: [], casos: [],
  };
  const casos = new Set<string>();
  for (let i = sec.start; i < sec.end - 1; i++) {
    if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const head = splitRow(lines[i]).map(normHeader);
    const c = { n: head.indexOf('#'), teste: head.findIndex((h) => h === 'teste' || h === 'requisicao'), res: head.indexOf('resultado'), obs: head.indexOf('obs'), caso: head.indexOf('caso') };
    if (c.n !== 0 || c.teste < 0 || c.res < 0) continue;
    for (let j = i + 2; j < sec.end && lines[j].includes('|') && lines[j].trim(); j++) {
      const cells = splitRow(lines[j]);
      const kind = cellStatus(cells[c.res]);
      if (!kind) continue;
      out.total++;
      out[kind === 'pending' ? 'skip' : kind]++;
      const obs = c.obs >= 0 ? (cells[c.obs] || '').trim() : '';
      if (/flaky/i.test(obs)) out.flaky++;
      if (kind === 'fail' || kind === 'blocked') out.falhas.push({ titulo: (cells[c.teste] || '').replace(/\\\|/g, '|').trim(), obs });
      if (c.caso >= 0) for (const id of (cells[c.caso] || '').split(',')) if (id.trim()) casos.add(id.trim());
    }
    break;
  }
  const ran = out.pass + out.fail + out.blocked;
  out.sucessoPct = ran ? Math.round((out.pass / ran) * 100) : null;
  out.casos = [...casos];
  return out.total ? out : null;
}

/** Contagem do relatório no formato dos passos (para somar ao status geral). */
export function autoCounts(text: string): StatusCounts | null {
  const s = autoSummary(text);
  return s ? { pass: s.pass, fail: s.fail, blocked: s.blocked, skip: s.skip, pending: 0, total: s.total } : null;
}

/** Soma de contagens (a segunda pode ser null). */
export function addCounts(a: StatusCounts, b: StatusCounts | null): StatusCounts {
  if (!b) return a;
  return { pass: a.pass + b.pass, fail: a.fail + b.fail, blocked: a.blocked + b.blocked, skip: a.skip + b.skip, pending: a.pending + b.pending, total: a.total + b.total };
}

/** Coloca (ou troca) a seção "## Testes automatizados": antes do "## Encerramento" se houver, senão no fim. `block` já vem com o título. */
export function setAutoSection(text: string, block: string): string {
  const lines = text.split('\n');
  const body = ['', ...block.replace(/\n+$/, '').split('\n'), ''];
  const old = findSection(lines, AUTO_TITLE);
  if (old) lines.splice(old.heading, old.end - old.heading, ...body.slice(1));
  else {
    const close = findSection(lines, CLOSE_TITLE);
    if (close) lines.splice(close.heading, 0, ...body.slice(1));
    else {
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      lines.push(...body);
    }
  }
  return lines.join('\n').replace(/\n*$/, '\n');
}

/** Tira o relatório automatizado da execução. */
export function removeAutoSection(text: string): string {
  const lines = text.split('\n');
  const sec = findSection(lines, AUTO_TITLE);
  if (!sec) return text;
  lines.splice(sec.heading, sec.end - sec.heading);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
}
