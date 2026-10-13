// Teste em dupla (QA + dev no ambiente local): roteiro curto a partir dos casos do ticket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acceptanceCriteria, buildPairTest, caseExpectation, isEdgeCase, pickPairCases } from '../../src/markdown/pairTest.ts';
import { suggestDestination } from '../../src/markdown/structure.ts';
import { collectStatusTables } from '../../src/markdown/status.ts';
import { describe as describeDoc } from '../../src/io/docIndex.ts';
import { addSessionNote } from '../../src/markdown/runs.ts';

const TEMPLATE = readFileSync('src/templates/teste-em-dupla.md', 'utf8').replace('{{data}}', '2026-10-13');
const caso = (id, titulo, { prioridade = 'Média', tags = [], esperado = 'ok' } = {}) => ({
  id, titulo, prioridade, tags,
  text: `---\ntipo: caso-de-teste\nid: ${id}\n---\n\n# ${id}\n\n## Objetivo\n\nValidar ${titulo}\n\n## Passos\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Tela aberta | | \`PENDING\` |\n| 2 | Confirmar | ${esperado} | | \`PENDING\` |\n`,
});

test('menos trivial: negativo, borda, erro, inválido… pelo título ou pelas tags', () => {
  assert.equal(isEdgeCase({ titulo: 'Pagar com Pix', tags: [] }), false);
  assert.equal(isEdgeCase({ titulo: 'Pix com QR code expirado', tags: [] }), true);
  assert.equal(isEdgeCase({ titulo: 'CPF inválido', tags: [] }), true);
  assert.equal(isEdgeCase({ titulo: 'Valor no limite diário' }), true);
  assert.equal(isEdgeCase({ titulo: 'Cancelar', tags: ['negativo'] }), true);
  assert.equal(isEdgeCase({ titulo: 'Exibir terrores' }), false); // "erro" só como palavra
});

test('escolha: principais pela prioridade, até 5; menos triviais até 2; o resto fica para DEV/HML', () => {
  const cases = [
    caso('TC-1', 'Listar pedidos', { prioridade: 'Baixa' }),
    caso('TC-2', 'Pagar com Pix', { prioridade: 'Crítica' }),
    caso('TC-3', 'Pix expirado', { prioridade: 'Alta' }),
    caso('TC-4', 'Comprovante', { prioridade: 'Alta' }),
    caso('TC-5', 'Valor inválido'),
    caso('TC-6', 'Limite máximo', { prioridade: 'Baixa' }),
    caso('TC-7', 'Filtro'), caso('TC-8', 'Ordenar'), caso('TC-9', 'Exportar'),
  ];
  const { main, edge, rest } = pickPairCases(cases);
  assert.deepEqual(main.map((c) => c.id), ['TC-2', 'TC-4', 'TC-7', 'TC-8', 'TC-9']);
  assert.deepEqual(edge.map((c) => c.id), ['TC-3', 'TC-5']);
  assert.deepEqual(rest.map((c) => c.id), ['TC-1', 'TC-6']);
});

test('resultado esperado: o do último passo; sem passos, o Objetivo', () => {
  assert.equal(caseExpectation(caso('TC-1', 'x', { esperado: 'Pedido **pago** com \\| status' }).text), 'Pedido **pago** com \\| status');
  assert.equal(caseExpectation('# TC\n\n## Objetivo\n\n- Garantir que o pedido é pago\n'), 'Garantir que o pedido é pago');
  assert.equal(caseExpectation('# nada'), '');
});

test('critérios de aceite da história', () => {
  const h = '# HU\n\n## Critérios de aceite\n\n- [ ] Dado um pedido, quando pagar com Pix, então vejo o QR code\n- [x] CA2: comprovante por e-mail\n\n## Regras de negócio\n\n- [ ] não é critério\n';
  assert.deepEqual(acceptanceCriteria(h), ['Dado um pedido, quando pagar com Pix, então vejo o QR code', 'CA2: comprovante por e-mail']);
  assert.deepEqual(acceptanceCriteria('# sem seção'), []);
});

test('monta o documento: cabeçalho, critérios, roteiro executável, resto para DEV/HML; sessão e bugs funcionam', () => {
  const cases = [caso('TC-2', 'Pagar com Pix', { prioridade: 'Alta', esperado: 'QR code exibido' }), caso('TC-3', 'Pix expirado'), caso('TC-1', 'Ver | histórico')];
  const text = buildPairTest({ template: TEMPLATE, ticket: 'PORTAL-120', titulo: 'Pagamento Pix', app: 'Portal', epico: 'PORTAL-10', criterios: ['CA1 — QR code', 'CA2 — expira em 30 min'], cases, mainMax: 1, edgeMax: 1 });
  const info = describeDoc(text);
  assert.equal(info.tipo, 'teste-em-dupla');
  assert.equal(info.id, 'DUP-PORTAL-120');
  assert.equal(info.titulo, 'Teste em dupla — Pagamento Pix');
  assert.equal(info.app, 'Portal');
  assert.match(text, /^jira: PORTAL-120$/m);
  assert.match(text, /^epico: PORTAL-10\n---$/m);
  assert.match(text, /^ambiente: Local$/m);
  assert.match(text, /^# DUP-PORTAL-120 — Teste em dupla — Pagamento Pix$/m);
  assert.match(text, /## Critérios de aceite\n\n- \[ \] CA1 — QR code\n- \[ \] CA2 — expira em 30 min\n\n## Roteiro/);
  assert.match(text, /\| 1 \| \[\[TC-2\]\] — Pagar com Pix \| QR code exibido \| \| `PENDING` \|\n\| 2 \| ⚠ \[\[TC-3\]\] — Pix expirado \| ok \| \| `PENDING` \|\n\n## Duração/);
  assert.match(text, /## Ficou para DEV\/HML\n\n- \[ \] \[\[TC-1\]\] — Ver \| histórico\n/);
  // uma tabela de status só (a do roteiro): o ▶ Executar e o resumo contam 2 linhas
  const tables = collectStatusTables(text);
  assert.equal(tables.length, 1);
  assert.equal(tables[0].rows.length, 2);
  assert.equal(info.counts.total, 2);
  // ⏱ Sessão: BUG vai para "Notas da sessão" e para a tabela "Bugs e ajustes"
  const noted = addSessionNote(text, { tag: 'BUG', text: 'botão Pagar sem loading', time: new Date(2026, 9, 13, 10, 5) });
  assert.match(noted, /## Notas da sessão\n\n- 10:05 — \*\*BUG:\*\* botão Pagar sem loading\n/);
  assert.match(noted, /\| Resumo \| Combinado com o dev \| Bug no Jira \|\n\| --- \| --- \| --- \|\n\| botão Pagar sem loading \|/);
});

test('sem casos nem critérios: o modelo fica como está (só o cabeçalho muda)', () => {
  const text = buildPairTest({ template: TEMPLATE, ticket: 'APP-7', cases: [] });
  assert.match(text, /\| 3 \| ⚠ Menos trivial: \|/);
  assert.match(text, /## Critérios de aceite\n\n- \[ \] \n/);
  assert.match(text, /^id: DUP-APP-7$/m);
});

test('lugar: na pasta do ticket, junto dos casos (sem ticket, em sessoes/)', () => {
  const dirs = ['aplicacoes', 'aplicacoes/Portal', 'aplicacoes/Portal/casos', 'aplicacoes/Portal/casos/PORTAL-10 Pagamentos', 'aplicacoes/Portal/casos/PORTAL-10 Pagamentos/PORTAL-120 Pix'];
  assert.equal(suggestDestination({ tipo: 'teste-em-dupla', app: 'Portal', jira: 'PORTAL-120', epico: 'PORTAL-10' }, dirs).dir, 'aplicacoes/Portal/casos/PORTAL-10 Pagamentos/PORTAL-120 Pix');
  assert.equal(suggestDestination({ tipo: 'teste-em-dupla', app: 'Portal' }, dirs).dir, 'aplicacoes/Portal/sessoes');
});

test('MCP: qa_criar tipo teste-em-dupla nasce na pasta do ticket, com jira e épico da pasta', async () => {
  const { QaWorkspace } = await import('../../mcp/qa.ts');
  const tpl = Object.fromEntries(readdirSync('src/templates').filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), readFileSync(join('src/templates', f), 'utf8')]));
  const dir = mkdtempSync(join(tmpdir(), 'qa-dup-'));
  const ticket = 'aplicacoes/Portal/casos/PORTAL-10 Pagamentos/PORTAL-120 Pix';
  mkdirSync(join(dir, ticket), { recursive: true });
  writeFileSync(join(dir, ticket, 'TC-1.md'), caso('TC-1', 'Pagar').text.replace('id: TC-1', 'id: TC-1\napp: Portal\njira: PORTAL-120\nepico: PORTAL-10'));
  const ws = new QaWorkspace({ root: dir, templates: tpl, who: 'Claude' });
  const out = await ws.create({ tipo: 'teste-em-dupla', titulo: 'Teste em dupla — PORTAL-120', app: 'Portal', campos: { jira: 'PORTAL-120', epico: 'PORTAL-10' } });
  assert.match(out, /Criado: aplicacoes\/Portal\/casos\/PORTAL-10 Pagamentos\/PORTAL-120 Pix\/DUP-001-/);
});
