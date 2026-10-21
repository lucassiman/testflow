// 1.68.0: teste de confirmação do bug — o bug vira executável, entra na execução (só ele, com casos ou no reteste),
// conta à parte dos casos e o resultado vai para o Andamento do bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reproSteps, expectedOf, ensureConfirmSteps, hasConfirmSteps, logConfirmation, jiraDone, isBugText } from '../../src/markdown/confirm.ts';
import { cycleDoc, cycleTable, nextCase, syncCycle, caseResult, closeCycle, skipPending, cycleSummary, retestCases, retestBugs, overallOf, confirmRows } from '../../src/markdown/cycle.ts';
import { countStatuses, confirmCounts, updateSummaryBlocks } from '../../src/markdown/status.ts';
import { stepTable, setStepStatus, logRun, newRound } from '../../src/markdown/runs.ts';
import { assign, assignees } from '../../src/markdown/assign.ts';
import { buildReports } from '../../src/markdown/reports.ts';
import { QaWorkspace } from '../../mcp/qa.ts';


const BUG = `---
tipo: bug
id: BUG-003
titulo: Estorno de Pix devolve o valor em dobro
app: Loja
status: FAIL
severidade: Crítica
versao: 2.15.0
jira_status: Pronto (concluído)
---

# BUG-003 — Estorno de Pix devolve o valor em dobro

## Resumo

Encontrado em [[TC-008]] (passo 5).

## Passos para reproduzir

1. ↪ Fazer login (atendente)
2. Abrir o pedido e clicar em **Estornar Pix**
   (o pedido pago com Pix)
3. Abrir o extrato do banco

## Resultado esperado

Um lançamento de estorno de R$ 49,90 | não dois

## Resultado obtido

> [!CAUTION]
> Dois lançamentos

## Evidências

Cole prints.
`;

test('bug → tabela do teste de confirmação: passos do bug, esperado no último, antes de Evidências', () => {
  assert.ok(isBugText(BUG));
  assert.deepEqual(reproSteps(BUG), ['↪ Fazer login (atendente)', 'Abrir o pedido e clicar em **Estornar Pix** (o pedido pago com Pix)', 'Abrir o extrato do banco']);
  assert.equal(expectedOf(BUG), 'Um lançamento de estorno de R$ 49,90 | não dois');
  assert.equal(hasConfirmSteps(BUG), false);
  const { text, added } = ensureConfirmSteps(BUG);
  assert.ok(added);
  assert.ok(hasConfirmSteps(text));
  assert.ok(text.indexOf('## Teste de confirmação') < text.indexOf('## Evidências'));
  assert.match(text, /\| 3 \| Abrir o extrato do banco \| Um lançamento de estorno de R\$ 49,90 \\\| não dois \|  \|  \|/);
  // de novo: igual
  assert.equal(ensureConfirmSteps(text).text, text);
  // bug sem passos (modelo em branco): um passo genérico com o esperado
  const blank = BUG.replace(/## Passos para reproduzir[\s\S]*?## Resultado esperado/, '## Passos para reproduzir\n\n1. \n2. \n\n## Resultado esperado');
  assert.match(ensureConfirmSteps(blank).text, /\| 1 \| Reproduzir o defeito como descrito no bug \| Um lançamento/);
  const t = stepTable(text);
  assert.equal(t?.rows.length, 3);
  assert.ok(t.expected >= 0 && t.status >= 0);
});

test('o status do bug é do QA: marcar passos, nova rodada e concluir não mexem nele', () => {
  let text = ensureConfirmSteps(BUG).text;
  const t = stepTable(text);
  for (const r of t.rows) text = setStepStatus(text, r.line, t.status, 'PASS');
  assert.match(text, /^status: FAIL$/m);
  const run = logRun(text, { start: new Date(2026, 9, 20, 9, 0), end: new Date(2026, 9, 20, 9, 10) });
  assert.equal(run.overall, 'PASS');
  assert.match(run.source, /^status: FAIL$/m);
  assert.match(run.source, /## Histórico de execuções/);
  assert.match(newRound(run.source).source, /^status: FAIL$/m);
});

test('Andamento: PASS fecha só com o OK; FAIL anota e reabre o bug fechado', () => {
  const when = new Date(2026, 9, 20, 14, 30);
  const kept = logConfirmation(BUG, { overall: 'PASS', when, exec: 'EXEC-1', versao: '2.15.1', ambiente: 'HML' });
  assert.equal(kept.closed, false);
  assert.match(kept.text, /^status: FAIL$/m);
  assert.match(kept.text, /## Andamento\n\n- 20\/10\/2026 14:30 — ✅ Teste de confirmação `PASS` em \[\[EXEC-1\]\] \(versão 2\.15\.1 · HML\): corrigido — o bug ficou aberto\./);
  const closed = logConfirmation(kept.text, { overall: 'PASS', when, exec: 'EXEC-1', close: true });
  assert.ok(closed.closed);
  assert.match(closed.text, /^status: PASS$/m);
  assert.equal((closed.text.match(/^- 20\/10/gm) || []).length, 2);
  const again = logConfirmation(closed.text, { overall: 'FAIL', when, failed: '3 — obtido: dois' });
  assert.ok(again.reopened);
  assert.match(again.text, /^status: FAIL$/m);
  assert.match(again.text, /❌ Teste de confirmação `FAIL`: a correção não resolveu \(passo 3 — obtido: dois\) — bug reaberto \(estava `PASS`\)\./);
  assert.ok(jiraDone('Pronto (concluído)'));
  assert.ok(!jiraDone('Em análise (em andamento)'));
});

test('execução com confirmações: seção à parte, antes dos casos, contagem separada, status geral junto', () => {
  const start = new Date(2026, 9, 20, 9, 0);
  let exec = cycleDoc({ titulo: 'Reteste', cases: [{ key: 'TC-1', titulo: 'Pagar' }], bugs: [{ key: 'BUG-003', titulo: 'Estorno em dobro', origem: 'TC-008' }], start });
  assert.ok(exec.indexOf('## Confirmação de bugs') < exec.indexOf('## Casos do ciclo'));
  assert.match(exec, /\| 1 \| \[\[BUG-003\]\] \| Estorno em dobro \|  \|  \| \[\[TC-008\]\] \|/);
  const t = cycleTable(exec);
  assert.deepEqual(t.rows.map((r) => [r.key, r.confirm]), [['BUG-003', true], ['TC-1', false]]);
  assert.equal(nextCase(exec), 'BUG-003');
  assert.equal(confirmRows(exec).length, 1);
  // o bug confirma (PASS), o caso falha
  let bug = ensureConfirmSteps(BUG).text;
  const st = stepTable(bug);
  for (const r of st.rows) bug = setStepStatus(bug, r.line, st.status, 'PASS');
  bug = logRun(bug, { start: new Date(2026, 9, 20, 9, 5), end: new Date(2026, 9, 20, 9, 10) }).source;
  const tc = '---\ntipo: caso-de-teste\nid: TC-1\n---\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Pagar | Pago | erro | `FAIL` |\n\n## Histórico de execuções\n\n| Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| 1 | 20/10/2026 | 09:20 | 09:30 | 10 min | HML | `FAIL` | Lucas |\n';
  const docs = { 'BUG-003': bug, 'TC-1': tc };
  exec = syncCycle(exec, (k) => (docs[k] ? { result: caseResult(docs[k], start, countStatuses(docs[k]), 0), bugs: k === 'TC-1' ? ['BUG-007'] : [] } : null));
  assert.match(exec, /\| 1 \| \[\[BUG-003\]\] \| Estorno em dobro \| `PASS` \| 20\/10\/2026 09:10 \| \[\[TC-008\]\] \|/);
  assert.match(exec, /\| 1 \| \[\[TC-1\]\] \| Pagar \| `FAIL` \| 20\/10\/2026 09:30 \| \[\[BUG-007\]\] \|/);
  assert.equal(countStatuses(exec).total, 1);
  assert.equal(confirmCounts(exec).pass, 1);
  assert.equal(overallOf(exec), 'FAIL');
  assert.match(exec, /\*\*Executados:\*\* 1 de 1 \(100%\) · \*\*Status geral:\*\* `FAIL` · \*\*Confirmação de bugs:\*\* 1 de 1 · 1 corrigido\(s\) · 0 não corrigido\(s\)/);
  const s = cycleSummary(exec);
  assert.equal(s.total, 1);
  assert.deepEqual(s.casos.map((c) => c.key), ['TC-1']);
  assert.deepEqual({ ...s.confirmacoes, itens: undefined }, { total: 1, corrigidos: 1, naoCorrigidos: 0, bloqueados: 0, skip: 0, pendentes: 0, itens: undefined });
  const closed = closeCycle(exec, new Date(2026, 9, 20, 10, 0));
  assert.match(closed, /resultado `FAIL`: 0 PASS · 1 FAIL · 0 BLOCKED · 0 SKIP\./);
  assert.match(closed, /\*\*Confirmação de bugs:\*\* 1 de 1 · 1 corrigido\(s\) · 0 não corrigido\(s\)\n\n- \[\[BUG-003\]\] `PASS` — corrigido/);
  assert.doesNotMatch(closed, /- \[\[BUG-003\]\] `PASS`[^\n]*\n[^]*\*\*Falhas e bloqueios:\*\*\n\n- \[\[BUG-003/);
  // reteste: a regressão do TC-1 e a confirmação do bug dele
  assert.deepEqual(retestCases(closed).map((c) => c.key), ['TC-1']);
  assert.deepEqual(retestBugs(closed), [{ key: 'BUG-007', titulo: '', origem: 'TC-1' }]);
  assert.deepEqual(retestBugs(closed, (k) => k !== 'BUG-007'), []);
});

test('execução só de confirmação: sem tabela de casos; resumo, SKIP e atribuição valem para os bugs', () => {
  let exec = cycleDoc({ titulo: 'Confirmação do BUG-003', cases: [], bugs: [{ key: 'BUG-003', titulo: 'Estorno' }, { key: 'BUG-004', titulo: 'Copiar' }], start: new Date(2026, 9, 20, 9, 0) });
  assert.doesNotMatch(exec, /## Casos do ciclo/);
  assert.match(exec, /Teste de confirmação de 2 bug\(s\)/);
  exec = updateSummaryBlocks(exec.replace('| 1 | [[BUG-003]] | Estorno |  |', '| 1 | [[BUG-003]] | Estorno | `FAIL` |'));
  assert.match(exec, /\*\*Confirmações executadas:\*\* 1 de 2 \(50%\) · \*\*Status geral:\*\* `FAIL`/);
  assert.equal(overallOf(exec), 'FAIL');
  assert.deepEqual(retestBugs(exec).map((b) => b.key), ['BUG-003']);
  const a = assign(exec, ['BUG-004'], 'Ana');
  assert.match(a.text, /\| # \| Bug \| Título \| Status \| Executado em \| Origem \| Testador \|/);
  assert.equal(assignees(a.text).get('bug-004'), 'Ana');
  assert.equal(nextCase(a.text, '', 'Ana'), 'BUG-004');
  const done = skipPending(a.text);
  assert.match(done, /\| 2 \| \[\[BUG-004\]\] \| Copiar \| `SKIP` \| não executado \|/);
});

test('relatórios: confirmações no Go/No-Go e no de defeitos, fora dos números dos casos', () => {
  let bug = ensureConfirmSteps(BUG).text;
  const st = stepTable(bug);
  for (const r of st.rows) bug = setStepStatus(bug, r.line, st.status, 'FAIL');
  let exec = cycleDoc({ titulo: 'Confirmação', cases: [], bugs: [{ key: 'BUG-003', titulo: 'Estorno', origem: 'TC-008' }], start: new Date(2026, 9, 20, 9, 0) });
  exec = closeCycle(skipPending(exec.replace('| 1 | [[BUG-003]] | Estorno |  |', '| 1 | [[BUG-003]] | Estorno | `FAIL` |')), new Date(2026, 9, 20, 10, 0));
  const { files } = buildReports('execucoes/confirmacao.md', [{ path: 'execucoes/confirmacao.md', text: exec }, { path: 'bugs/BUG-003.md', text: bug }]);
  const enc = files.find((f) => f.kind === 'encerramento').text;
  // execução só de confirmação: os números são dos bugs
  assert.match(enc, /\| Confirmações de bug \| 1 — 0 PASS · 1 FAIL/);
  assert.doesNotMatch(enc, /\| Casos \|/);
  assert.match(enc, /\*\*Bugs não confirmados como corrigidos:\*\*\n\n- \[\[BUG-003\]\] — Estorno `FAIL` — a correção não resolveu/);
  const def = files.find((f) => f.kind === 'defeitos').text;
  assert.match(def, /## 🎯 Teste de confirmação/);
  assert.match(def, /\| \[\[BUG-003\]\] \| Estorno \| `FAIL` não corrigido \| 20\/10\/2026|\| \[\[BUG-003\]\] \| Estorno \| `FAIL` não corrigido \|/);
  assert.match(def, /\| \[\[TC-008\]\] \|/);
});

test('execução só de confirmação que passou: Como foi e relatórios contam o bug (não ficam zerados)', () => {
  let bug = ensureConfirmSteps(BUG).text;
  const st = stepTable(bug);
  for (const r of st.rows) bug = setStepStatus(bug, r.line, st.status, 'PASS');
  bug = logConfirmation(bug, { overall: 'PASS', when: new Date(2026, 9, 21, 10, 14), close: true }).text;
  let exec = cycleDoc({ titulo: 'Confirmação do BUG-003', cases: [], bugs: [{ key: 'BUG-003', titulo: 'Estorno', origem: 'TC-008' }], start: new Date(2026, 9, 21, 9, 36) });
  exec = closeCycle(skipPending(exec.replace('| 1 | [[BUG-003]] | Estorno |  |  |', '| 1 | [[BUG-003]] | Estorno | `PASS` | 21/10/2026 10:13 |')), new Date(2026, 9, 21, 10, 14));
  const s = cycleSummary(exec);
  assert.equal(s.soConfirmacao, true);
  assert.deepEqual([s.total, s.pass, s.fail, s.pendente, s.sucessoPct], [1, 1, 0, 0, 100]);
  assert.deepEqual(s.casos, [{ key: 'BUG-003', status: 'PASS' }]);
  const { files } = buildReports('execucoes/confirmacao.md', [{ path: 'execucoes/confirmacao.md', text: exec }, { path: 'bugs/BUG-003.md', text: bug }]);
  const enc = files.find((f) => f.kind === 'encerramento').text;
  assert.match(enc, /\| Confirmações de bug \| 1 — 1 PASS · 0 FAIL · 0 BLOCKED · 0 SKIP \|/);
  assert.match(enc, /\| Executados \| 1 de 1 \(100%\) \|/);
  assert.match(enc, /\| Sucesso \| 100% /);
  assert.match(enc, /^recomendacao: LIBERAR$/m);
  const log = files.find((f) => f.kind === 'log').text;
  assert.match(log, /\[\[BUG-003\]\]/);
});

const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));

test('MCP: execução só de confirmação e registrar o bug pelos passos (o PASS não fecha sozinho)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-confirm-'));
  mkdirSync(join(dir, 'aplicacoes/Loja/bugs'), { recursive: true });
  mkdirSync(join(dir, 'aplicacoes/Loja/casos'), { recursive: true });
  mkdirSync(join(dir, 'aplicacoes/Loja/execucoes'), { recursive: true });
  writeFileSync(join(dir, 'aplicacoes/Loja/bugs/BUG-003.md'), BUG);
  writeFileSync(join(dir, 'aplicacoes/Loja/casos/TC-008.md'), '---\ntipo: caso-de-teste\nid: TC-008\ntitulo: Estornar\napp: Loja\n---\n\n# TC-008\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Estornar | Um estorno | | |\n\n🐞 Bug: [[BUG-003]]\n');
  const ws = new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' });
  const out = await ws.roundCreate({ bugs: ['BUG-003'] });
  assert.match(out, /0 caso\(s\) e 1 teste\(s\) de confirmação de bug \(antes dos casos\): BUG-003/);
  const bugText = readFileSync(join(dir, 'aplicacoes/Loja/bugs/BUG-003.md'), 'utf8');
  assert.match(bugText, /## Teste de confirmação/);
  const execFile = readdirSync(join(dir, 'aplicacoes/Loja/execucoes')).find((f) => f.endsWith('.md'));
  const execText = readFileSync(join(dir, 'aplicacoes/Loja/execucoes', execFile), 'utf8');
  assert.match(execText, /titulo: "?Confirmação do BUG-003/);
  assert.match(execText, /tags: \[[^\]]*confirmacao/);
  assert.match(execText, /\[\[BUG-003\]\] \| Estorno de Pix devolve o valor em dobro \|  \|  \| \[\[TC-008\]\]/);
  const rec = await ws.roundRecord({ caso: 'BUG-003', passos: [{ passo: '1', status: 'PASS' }, { passo: '2', status: 'PASS' }, { passo: '3', status: 'PASS', obtido: 'Um lançamento só' }] });
  assert.match(rec, /Confirmação PASS \(corrigido\) — o bug continua aberto/);
  const after = readFileSync(join(dir, 'aplicacoes/Loja/bugs/BUG-003.md'), 'utf8');
  assert.match(after, /^status: FAIL$/m);
  assert.match(after, /## Andamento\n\n- .* ✅ Teste de confirmação `PASS` em \[\[EXEC-/);
  const st = await ws.roundStatus('');
  assert.ok(st.includes('Nenhum pendente'), st);
});
