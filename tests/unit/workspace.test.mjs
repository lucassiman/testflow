import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldAccents, searchText } from '../../src/markdown/search.ts';
import { buildRows, filterRows, sortRows, summarize, dashboardMarkdown } from '../../src/markdown/dashboard.ts';
import { describe } from '../../src/io/docIndex.ts';

test('busca sem acento e sem maiúsculas; posições batem com o texto original', () => {
  assert.equal(foldAccents('Execução ÇÃO'), 'Execucao CAO');
  const hits = searchText('# Título\n\nFalha na EXECUÇÃO e na execucao.\n', 'execucao');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 2);
  assert.deepEqual(hits[0].ranges, [[9, 17], [23, 31]]);
  assert.equal(hits[0].text.slice(9, 17), 'EXECUÇÃO');
  assert.equal(searchText('Execução', 'execucao', { matchCase: true }).length, 0);
  assert.equal(searchText('login loginx', 'login', { wholeWord: true })[0].ranges.length, 1);
});

test('busca: linha longa é recortada em volta da ocorrência', () => {
  const line = `${'x'.repeat(300)} alvo ${'y'.repeat(300)}`;
  const [hit] = searchText(line, 'alvo');
  assert.ok(hit.text.length < 170);
  const [a, b] = hit.ranges[0];
  assert.equal(hit.text.slice(a, b), 'alvo');
});

const doc = (fm, body = '') => `---\n${fm}\n---\n\n${body}`;
const entries = [
  { path: 'casos/TC-1.md', name: 'TC-1.md', lastModified: 3, ...describe(doc('tipo: caso-de-teste\nid: TC-1\ntitulo: Login\nprioridade: Baixa\ntags: [login, smoke]', '| # | Status |\n| --- | --- |\n| 1 | `PASS` |\n| 2 | `PENDING` |\n')) },
  { path: 'casos/TC-2.md', name: 'TC-2.md', lastModified: 2, ...describe(doc('tipo: caso-de-teste\nid: TC-2\ntitulo: Senha\nprioridade: Crítica', '| # | Status |\n| --- | --- |\n| 1 | `FAIL` |\n')) },
  { path: 'bugs/BUG-1.md', name: 'BUG-1.md', lastModified: 1, ...describe(doc('tipo: bug\nid: BUG-1\ntitulo: Erro 500\nstatus: BLOCKED\nseveridade: Alta')) },
  { path: 'notas.md', name: 'notas.md', lastModified: 4, ...describe('# Notas\n\n- [x] a\n- [ ] b\n') },
];

test('painel: status do cabeçalho ou dos passos, progresso, filtro e ordenação', () => {
  const rows = buildRows(entries);
  const by = Object.fromEntries(rows.map((r) => [r.id || r.name, r]));
  assert.equal(by['TC-1'].status, 'pending');
  assert.deepEqual(by['TC-1'].progress, { done: 1, total: 2, kind: 'steps' });
  assert.equal(by['TC-2'].status, 'fail');
  assert.equal(by['BUG-1'].status, 'blocked');
  assert.equal(by['BUG-1'].prioridade, 'Alta');
  assert.equal(by['notas.md'].status, 'none');
  assert.equal(by['notas.md'].title, 'Notas');
  assert.deepEqual(by['notas.md'].progress, { done: 1, total: 2, kind: 'tasks' });
  assert.deepEqual(sortRows(rows, 'status').map((r) => r.id || r.name), ['TC-2', 'BUG-1', 'TC-1', 'notas.md']);
  assert.deepEqual(sortRows(rows, 'prioridade').map((r) => r.id || r.name), ['TC-2', 'BUG-1', 'TC-1', 'notas.md']);
  assert.deepEqual(filterRows(rows, { statuses: ['fail', 'blocked'] }).map((r) => r.id), ['TC-2', 'BUG-1']);
  assert.deepEqual(filterRows(rows, { text: 'SMOKE' }).map((r) => r.id), ['TC-1']);
  assert.deepEqual(filterRows(rows, { folder: 'casos' }).map((r) => r.id), ['TC-1', 'TC-2']);
  assert.deepEqual(summarize(rows).byStatus, { fail: 1, blocked: 1, pending: 1, skip: 0, pass: 0, none: 1 });
});

test('painel como Markdown: resumo, gráfico e tabela com [[links]]', () => {
  const md = dashboardMarkdown(sortRows(buildRows(entries), 'status'), { title: 'Painel — ws', now: new Date(2026, 8, 26, 10, 0) });
  assert.match(md, /^# Painel — ws\n\n_Gerado em 26\/09\/2026/);
  assert.match(md, /\| `FAIL` \| 1 \|/);
  assert.match(md, /pie showData/);
  assert.match(md, /\| `FAIL` \| \[\[TC-2\]\] Senha \| Caso de teste \| Crítica \| 1\/1 \|/);
  assert.match(md, /\|  \| \[\[notas\]\] \|  \|  \| 1\/2 ☑ \|/);
});
