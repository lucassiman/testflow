/**
 * Status personalizados (11.3) — o documento da pasta com `tipo: status` (ex.: configuracao/status.md) e uma tabela:
 *
 *   | Palavra | Conta como | Cor | Descrição |
 *   | RETESTE | PENDING | #8250df | Executar de novo depois da correção |
 *   | FALHA CONHECIDA | FAIL | #bc4c00 | Falha já reportada, com bug aberto |
 *
 * "Conta como" é um dos 5 (PASS, FAIL, BLOCKED, SKIP, PENDING — ou em português): é assim que entra nas contagens, no
 * status geral, no ciclo e nos relatórios. A cor pinta a etiqueta; a descrição aparece ao passar o mouse.
 */
import { detectFrontMatter, parseFrontMatter } from './frontmatter.ts';
import { splitRow, normHeader } from './status.ts';
import { STATUS, type CustomStatus } from './qa.ts';
import type { StatusKind } from '../types';

export const STATUS_DOC_TYPE = 'status';
const DEFAULT_COLORS: Record<StatusKind, string> = { pass: '#2da44e', fail: '#bc4c00', blocked: '#9a6700', skip: '#6e7781', pending: '#8250df' };

export function isStatusDoc(text: string): boolean {
  const fm = detectFrontMatter(text);
  if (!fm) return false;
  return String(parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data.tipo || '').trim() === STATUS_DOC_TYPE;
}

/** "fail", "FALHA", "reprovado" → fail (um dos 5). */
export function kindOf(v: string): StatusKind | null {
  const w = String(v || '').replace(/[`*_]/g, '').trim().toUpperCase();
  for (const [k, words] of Object.entries(STATUS) as Array<[StatusKind, string[]]>) if (words.includes(w)) return k;
  return null;
}

/** Os status da tabela do documento (linhas sem palavra ou sem "conta como" válido ficam de fora, com aviso). */
export function parseStatusDoc(text: string): { list: CustomStatus[]; warnings: string[] } {
  const lines = text.split('\n');
  const list: CustomStatus[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes('|') || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const head = splitRow(lines[i]).map(normHeader);
    const w = head.findIndex((h) => /^(status|palavra|nome)$/.test(h));
    const k = head.findIndex((h) => /^(conta como|tipo|regra|equivale a|base)$/.test(h));
    if (w < 0 || k < 0) continue;
    const c = head.findIndex((h) => /^(cor|color)$/.test(h));
    const d = head.findIndex((h) => /^(descricao|significado|obs|observacao)$/.test(h));
    for (let j = i + 2; j < lines.length && lines[j].includes('|') && lines[j].trim(); j++) {
      const cells = splitRow(lines[j]);
      const word = (cells[w] || '').replace(/[`*_]/g, '').trim();
      if (!word) continue;
      const kind = kindOf(cells[k] || '');
      if (!kind) { warnings.push(`${word}: "conta como" precisa ser PASS, FAIL, BLOCKED, SKIP ou PENDING`); continue; }
      const raw = c >= 0 ? (cells[c] || '').replace(/[`]/g, '').trim() : '';
      const color = /^#[0-9a-f]{3,8}$/i.test(raw) || /^[a-z]+$/i.test(raw) ? raw : DEFAULT_COLORS[kind];
      list.push({ word: word.toUpperCase(), kind, color, label: d >= 0 ? (cells[d] || '').trim() : '' });
    }
    i += 1;
  }
  return { list, warnings };
}

/** Documento inicial (Status personalizados…). */
export const STATUS_DOC_TEMPLATE = `---
tipo: status
titulo: Status personalizados
qa-md: 1
---

# Status personalizados

Status a mais para os passos e casos, além de PASS, FAIL, BLOCKED, SKIP e PENDING. **Conta como** diz como cada um entra nas contagens, no status geral, na rodada e nos relatórios. Valem para a pasta de trabalho toda (no app e no Claude).

| Palavra | Conta como | Cor | Descrição |
| --- | --- | --- | --- |
| RETESTE | PENDING | #8250df | Executar de novo depois da correção |
| FALHA CONHECIDA | FAIL | #bc4c00 | Falha já reportada, com bug aberto |
| NÃO TESTÁVEL | BLOCKED | #9a6700 | Sem ambiente ou massa para testar |
`;
