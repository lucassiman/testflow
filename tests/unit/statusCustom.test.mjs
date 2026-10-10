// 11.3 (1.48.0): status personalizados — palavra, como conta, cor; valem nas contagens e no status geral.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStatusDoc, STATUS_DOC_TEMPLATE, kindOf } from '../../src/markdown/statusConfig.ts';
import { setCustomStatuses, statusKind, customOf, badgeHtml, statusSig } from '../../src/markdown/qa.ts';
import { countStatuses, deriveOverall, cellStatus } from '../../src/markdown/status.ts';

afterEach(() => setCustomStatuses([]));

test('o documento de status: palavra, como conta, cor e descrição', () => {
  const { list, warnings } = parseStatusDoc(STATUS_DOC_TEMPLATE + '| ESTRANHO | talvez | | |\n');
  assert.deepEqual(list.map((c) => [c.word, c.kind, c.color]), [['RETESTE', 'pending', '#8250df'], ['FALHA CONHECIDA', 'fail', '#bc4c00'], ['NÃO TESTÁVEL', 'blocked', '#9a6700']]);
  assert.match(warnings[0], /ESTRANHO/);
  assert.equal(kindOf('reprovado'), 'fail');
  // o documento de status não vira uma tabela de passos
  assert.equal(countStatuses(STATUS_DOC_TEMPLATE).total, 0);
});

test('registrados: contam como o tipo deles; as 5 palavras não mudam; etiqueta com a cor', () => {
  const sig0 = statusSig();
  assert.equal(statusKind('FALHA CONHECIDA'), null);
  setCustomStatuses([...parseStatusDoc(STATUS_DOC_TEMPLATE).list, { word: 'PASS', kind: 'fail', color: '#000', label: '' }]);
  assert.notEqual(statusSig(), sig0);
  assert.equal(statusKind('falha conhecida'), 'fail');
  assert.equal(statusKind('PASS'), 'pass');
  assert.equal(cellStatus('`NÃO TESTÁVEL`'), 'blocked');
  const doc = '| # | Ação | Status |\n| --- | --- | --- |\n| 1 | a | `PASS` |\n| 2 | b | `FALHA CONHECIDA` |\n| 3 | c | `RETESTE` |\n';
  const c = countStatuses(doc);
  assert.deepEqual([c.pass, c.fail, c.pending], [1, 1, 1]);
  assert.equal(deriveOverall(c), 'FAIL');
  assert.equal(customOf('`falha conhecida`').color, '#bc4c00');
  assert.match(badgeHtml('FALHA CONHECIDA', (s) => s), /class="badge badge-fail badge-custom" style="--badge:#bc4c00"/);
  setCustomStatuses([]);
  assert.equal(statusKind('FALHA CONHECIDA'), null);
  assert.equal(statusKind('RETESTE'), 'pending'); // sinônimo de sempre continua
});

test('MCP: aceita os status da pasta ao marcar passos', async () => {
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const dir = mkdtempSync(join(tmpdir(), 'qa-st-'));
  mkdirSync(join(dir, 'configuracao'), { recursive: true });
  mkdirSync(join(dir, 'casos'), { recursive: true });
  writeFileSync(join(dir, 'configuracao/status.md'), STATUS_DOC_TEMPLATE);
  writeFileSync(join(dir, 'casos/TC-1.md'), '---\ntipo: caso-de-teste\nid: TC-1\n---\n\n| # | Ação | Resultado esperado | Status |\n| --- | --- | --- | --- |\n| 1 | a | x | |\n| 2 | b | y | |\n');
  const ws = new QaWorkspace({ root: dir, templates: {}, who: 'Claude' });
  const r = await ws.markSteps({ doc: 'TC-1', passos: [{ passo: '1', status: 'falha conhecida' }, { passo: '2', status: 'PASS' }] });
  assert.match(r, /status geral FAIL/);
  assert.match(readFileSync(join(dir, 'casos/TC-1.md'), 'utf8'), /\| 1 \| a \| x \| `FALHA CONHECIDA` \|/);
  await assert.rejects(ws.markSteps({ doc: 'TC-1', passos: [{ passo: '1', status: 'INVENTADO' }] }), /RETESTE, FALHA CONHECIDA, NÃO TESTÁVEL/);
});
