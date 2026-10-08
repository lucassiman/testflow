import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/markdown/cycle.ts';
import { summaryMarkdown, summarySlack, summaryEmail } from '../../src/ui/roundSummary.js';

const doc = C.cycleDoc({ titulo: 'Regressão 2.14', app: 'Portal', cases: [{ key: 'TC-1', titulo: 'Login' }, { key: 'TC-2', titulo: 'Cadastro' }, { key: 'TC-3', titulo: 'Relatório' }], start: new Date(2026, 9, 5, 9, 0) });
const done = C.closeCycle(C.skipPending(doc
  .replace(/(\| 1 \| \[\[TC-1\]\] \| Login \| )[^|]*\|/, '$1`PASS` |')
  .replace(/(\| 2 \| \[\[TC-2\]\] \| Cadastro \| )[^|]*\|/, '$1`FAIL` |')), new Date(2026, 9, 5, 11, 30));
const s = C.cycleSummary(done);
const details = { 'TC-2': { titulo: 'Cadastro', steps: [{ n: '3', acao: 'Salvar', obtido: 'Erro 500' }], prints: 1 } };
const bugs = [{ key: 'BUG-7', titulo: 'Erro 500 ao salvar', open: true, jira: 'ABC-9' }, { key: 'BUG-1', titulo: 'Antigo', open: false }];

test('resumo Slack: números, falha com passo, só bugs abertos', () => {
  const t = summarySlack(s, details, 'Jira: ABC-1', bugs);
  assert.match(t, /^\*📊 Regressão 2\.14\* — encerrada em 05\/10\/2026 11:30 \(2 h 30 min\)/);
  assert.match(t, /✅ 1 PASS · ❌ 1 FAIL · ⏭ 1 SKIP — \*50%\* de sucesso \(3 casos\)/);
  assert.match(t, /• ❌ \*TC-2\* — Cadastro/);
  assert.match(t, /◦ Passo 3: Salvar → _Erro 500_/);
  assert.match(t, /\*🐞 Bugs abertos \(1\)\*\n• \*BUG-7\* — Erro 500 ao salvar \(ABC-9\)/);
  assert.doesNotMatch(t, /BUG-1/);
  assert.match(t, /🔗 Jira: ABC-1/);
});

test('resumo e-mail: assunto, tabela e texto puro', () => {
  const e = summaryEmail(s, details, '', bugs);
  assert.equal(e.subject, '[QA] Regressão 2.14 — 50% de sucesso, 1 FAIL, 0 BLOCKED');
  assert.match(e.html, /<table[^>]*>.*<th[^>]*>FAIL<\/th>/);
  assert.match(e.html, /Bugs abertos \(1\)/);
  assert.doesNotMatch(e.text, /\*\*/);
  assert.match(e.text, /BUG-7 — Erro 500 ao salvar · ABC-9/);
});

test('resumo Markdown traz os bugs abertos', () => {
  assert.match(summaryMarkdown(s, details, '', bugs), /### Bugs abertos \(1\)\n- \*\*BUG-7\*\* — Erro 500 ao salvar · ABC-9/);
});
