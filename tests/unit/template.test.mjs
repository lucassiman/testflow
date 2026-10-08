import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toTemplate, templateId, templateFileName, suggestTemplateLabel } from '../../src/markdown/template.ts';

const DOC = [
  '---', 'tipo: caso-de-teste', 'id: TC-042', 'titulo: Login bloqueado', 'status: FAIL', 'data: 2026-09-20',
  'jira: [LOJA-12]', 'versao: 1.4.0', 'responsavel: Lucas', '---', '',
  '# TC-042 — Login bloqueado', '',
  '<!-- qa:resumo -->', '<!-- /qa:resumo -->', '',
  '## Passos', '',
  '| # | Ação | Resultado esperado | Resultado obtido | Status |', '| --- | --- | --- | --- | --- |',
  '| 1 | Abrir | Tela de login | Abriu | `PASS` |', '| 2 | Entrar | Mensagem | Erro 500 | `FAIL` |', '',
  '- [x] Limpar cache', '- [ ] Testar no Edge', '',
  '## Evidências', '', '![Passo 2 — erro](evidencias/erro.png)', '',
  '## Histórico de execuções', '', '| Rodada | Data |', '| --- | --- |', '| 1 | 20/09/2026 |', '',
].join('\n');

test('template: cabeçalho genérico, resultados limpos, sem histórico nem evidências', () => {
  const { text, changes } = toTemplate(DOC);
  assert.match(text, /^id: TC-000$/m);
  assert.match(text, /^status: PENDING$/m);
  assert.match(text, /^data: \{\{data\}\}$/m);
  assert.match(text, /^jira: \[\]$/m);
  assert.match(text, /^versao:$/m);
  assert.match(text, /^responsavel: Lucas$/m); // o resto do cabeçalho fica
  assert.match(text, /^# TC-000 — Login bloqueado$/m);
  assert.match(text, /^\| 1 \| Abrir \| Tela de login \| +\| +\|$/m);
  assert.doesNotMatch(text, /Erro 500|Abriu/);
  assert.match(text, /^\| 2 \| Entrar \| Mensagem \| +\| +\|$/m);
  assert.match(text, /^- \[ \] Limpar cache$/m);
  assert.doesNotMatch(text, /evidencias\/|Histórico de execuções/);
  assert.match(text, /## Evidências\n\nCole prints aqui/);
  // resumo automático recalculado: nada executado
  assert.match(text, /\*\*Executados:\*\* 0 de 2/);
  assert.equal(changes.length, 4);
});

test('template: opções desligadas deixam o documento como está', () => {
  const { text, changes } = toTemplate(DOC, { resetMeta: false, clearResults: false, removeHistory: false, removeEvidence: false });
  assert.match(text, /^id: TC-042$/m);
  assert.match(text, /Erro 500/);
  assert.match(text, /evidencias\/erro\.png/);
  assert.match(text, /Histórico de execuções/);
  assert.deepEqual(changes, []);
});

test('template: nomes e IDs', () => {
  assert.equal(templateId('BUG-7'), 'BUG-000');
  assert.equal(templateId('sem-padrao'), '');
  assert.equal(templateFileName('Sessão exploratória — Checkout'), 'Sessão-exploratória-Checkout.md');
  assert.equal(templateFileName('  a/b:c?  '), 'abc.md');
  assert.equal(suggestTemplateLabel(DOC), 'Login bloqueado');
  assert.equal(suggestTemplateLabel('# BUG-9 — Erro no carrinho\n'), 'Erro no carrinho');
  assert.equal(suggestTemplateLabel('texto', 'meu_roteiro.md'), 'meu roteiro');
});
