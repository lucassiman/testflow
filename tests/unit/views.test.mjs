import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseView, runView, viewMarkdown, syncViewSnapshots, findViewBlocks, execState, VIEW_PRESETS } from '../../src/markdown/views.ts';
import { describe } from '../../src/io/docIndex.ts';
import { lastRound } from '../../src/markdown/linkInfo.ts';

const tc = (id, { app = 'Portal', jira = '', tags = '[]', steps = ['', ''], auto = '', rounds = '', versao = '' } = {}) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: ${app}\njira: ${jira}\ntags: ${tags}\nautomacao: ${auto}\nversao: ${versao}\n---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Status |\n| --- | --- | --- | --- |\n${steps.map((s, i) => `| ${i + 1} | a | b | ${s ? `\`${s}\`` : ''} |`).join('\n')}\n${rounds}`;
const bug = (id, target, status = 'FAIL', jira = '') => `---\ntipo: bug\nid: ${id}\ntitulo: Bug ${id}\nstatus: ${status}\njira: ${jira}\n---\n\n# ${id}\n\nEncontrado em [[${target}]].\n`;
const mk = (path, text) => ({ path, name: path.split('/').pop(), lastModified: 0, ...describe(text), last: lastRound(text) });

const docs = [
  mk('aplicacoes/Portal/casos/TC-1.md', tc('TC-1', { jira: 'QA-1', tags: '[regressao]', steps: ['PASS', 'PASS'], auto: 'e2e/a.spec.ts', versao: '2.14.1' })),
  mk('aplicacoes/Portal/casos/TC-2.md', tc('TC-2', { jira: 'QA-1', tags: '[regressao]', steps: ['PASS', 'FAIL'] })),
  mk('aplicacoes/Portal/casos/TC-3.md', tc('TC-3', { jira: 'QA-2', tags: '[regressao]' })),
  mk('aplicacoes/Loja/casos/TC-4.md', tc('TC-4', { app: 'Loja', rounds: '\n## Histórico de execuções\n\n### Rodada 1 — 20/09/2026 — `PASS`\n' })),
  mk('aplicacoes/Portal/bugs/BUG-1.md', bug('BUG-1', 'TC-2')),
  mk('aplicacoes/Portal/bugs/BUG-2.md', bug('BUG-2', 'TC-1', 'PASS')),
  mk('visoes/x.md', '---\ntipo: visao\ntitulo: X\n---\n\nTC-1 TC-2\n'),
];

test('situação de execução', () => {
  assert.deepEqual(docs.slice(0, 4).map(execState), ['executado', 'executado', 'nunca', 'andamento']);
});

test('casos não executados (preset)', () => {
  const src = findViewBlocks(VIEW_PRESETS.find((p) => p.id === 'nao-executados').text)[0].src;
  const { spec, errors } = parseView(src);
  assert.deepEqual(errors, []);
  const r = runView(spec, docs);
  assert.equal(r.total, 1);
  assert.equal(r.tables[0].group, 'Portal (1)');
  assert.equal(r.tables[0].rows[0][0].text, 'TC-3');
});

test('tickets em teste: casos, executados, falhas e bugs abertos por chave do Jira', () => {
  const r = runView(parseView('formato: jira\ntipo: caso-de-teste, bug').spec, docs);
  const rows = r.tables[0].rows.map((row) => row.map((c) => c.text));
  assert.deepEqual(rows, [
    ['QA-1', '2', '2/2', '1', '1', 'BUG-1', 'FAIL'],
    ['QA-2', '1', '0/1', '0', '0', '0', 'PENDING'],
  ]);
});

test('cobertura da regressão e da automação', () => {
  const reg = runView(parseView('formato: cobertura\ntags: regressao\ntipo: caso-de-teste\nagrupar: app').spec, docs);
  assert.deepEqual(reg.tables[0].rows[0].map((c) => c.text), ['Portal', '3', '2', '1', '1', '67%']);
  const auto = runView(parseView('formato: cobertura\nmedida: automacao\ntipo: caso-de-teste').spec, docs);
  assert.deepEqual(auto.tables[0].rows.map((r) => r.map((c) => c.text)), [['Loja', '1', '0', '0%'], ['Portal', '3', '1', '33%'], ['Total', '4', '1', '25%']]);
});

test('rastreabilidade por versão; filtros com exclusão; quadro', () => {
  const r = runView(parseView('formato: rastreabilidade\ntipo: caso-de-teste\nversao: 2.14').spec, docs);
  assert.deepEqual(r.tables[0].rows.map((row) => [row[0].text, row[1].text, row[5].text]), [['QA-1', 'TC-1', 'BUG-2 ✓']]);
  const open = runView(parseView('tipo: bug\nstatus: !PASS').spec, docs);
  assert.deepEqual(open.tables[0].rows.map((row) => row[0].text), ['BUG-1']);
  const board = runView(parseView('formato: quadro\ntipo: caso-de-teste').spec, docs);
  assert.deepEqual(board.board.map((c) => c.title), ['FAIL (1)', 'PENDING (2)', 'PASS (1)']);
  const bad = parseView('formato: pizza\nfoo: 1\ncolunas: id, xyz');
  assert.equal(bad.errors.length, 3);
});

test('cópia gerada no arquivo: cria, atualiza só se mudou, fica entre os marcadores', () => {
  const text = '# V\n\n```qa-visao\ntipo: bug\n```\n\nFim.\n';
  const render = (src) => viewMarkdown(runView(parseView(src).spec, docs));
  const once = syncViewSnapshots(text, render, '29/09/2026 10:00');
  assert.match(once, /```\n\n<!-- qa:visao -->\n_Cópia gerada .* 29\/09\/2026 10:00 .*_\n\n\| ID \| Título \| Status \| App \| Progresso \|\n[\s\S]*\[\[BUG-1\]\][\s\S]*<!-- \/qa:visao -->\n\nFim\./);
  assert.equal(syncViewSnapshots(once, render, '30/09/2026 11:00'), once); // nada mudou: nem a data
  assert.equal(findViewBlocks(once)[0].snapshot?.open, 6);
});

test('revisão: a cópia gerada não conta como passos, links nem IDs do documento que a contém', () => {
  const host = '---\ntipo: relatorio-execucao\nid: RE-1\nstatus: PASS\n---\n\n# RE-1\n\n| # | Ação | Status |\n| --- | --- | --- |\n| 1 | a | `PASS` |\n\n```qa-visao\ntipo: caso-de-teste\n```\n';
  const once = syncViewSnapshots(host, (src) => viewMarkdown(runView(parseView(src).spec, docs)), 'agora');
  assert.match(once, /<!-- qa:visao -->[\s\S]*`FAIL`[\s\S]*<!-- \/qa:visao -->/);
  const info = describe(once);
  assert.deepEqual([info.counts.pass, info.counts.fail, info.counts.total], [1, 0, 1]);
  assert.deepEqual(info.targets, []);
  assert.ok(!info.ids.includes('TC-2'));
});

test('revisão: sem o marcador de fim, nada é apagado; exemplos em outro bloco e blocos sem fechamento são ignorados', () => {
  const broken = '```qa-visao\ntipo: bug\n```\n\n<!-- qa:visao -->\nvelho\n\n## Minhas notas\n\nimportante\n\n```qa-visao\ntipo: caso-de-teste\n```\n\n<!-- qa:visao -->\nx\n<!-- /qa:visao -->\n';
  const out = syncViewSnapshots(broken, () => 'NOVO', 't');
  assert.match(out, /## Minhas notas\n\nimportante/);
  assert.match(out, /tipo: caso-de-teste\n```\n\n<!-- qa:visao -->\n_Cópia[^\n]*\n\nNOVO\n<!-- \/qa:visao -->/);
  assert.equal(findViewBlocks(broken)[0].broken, true);
  const example = '````markdown\n```qa-visao\ntipo: bug\n```\n````\n';
  assert.equal(syncViewSnapshots(example, () => 'X', 't'), example);
  const unclosed = 'a\n```qa-visao\ntipo: bug\n';
  assert.equal(syncViewSnapshots(unclosed, () => 'X', 't'), unclosed);
  // dentro de item de lista: a cópia vem com o mesmo recuo e, na volta, é reconhecida
  const inList = '- item\n  ```qa-visao\n  tipo: bug\n  ```\n';
  const a = syncViewSnapshots(inList, () => '| a |\n| --- |', 't');
  assert.match(a, /\n {2}<!-- qa:visao -->\n/);
  assert.equal(syncViewSnapshots(a, () => '| a |\n| --- |', 'depois'), a);
  assert.equal(findViewBlocks(inList)[0].src, 'tipo: bug');
});

test('revisão: limite só corta lista/quadro; status como no Painel; # nas tags; Jira por URL', () => {
  const many = Array.from({ length: 30 }, (_, i) => mk(`c/TC-${100 + i}.md`, tc(`TC-${100 + i}`, { steps: ['PASS'] })));
  const cov = runView(parseView('formato: cobertura\nlimite: 5').spec, many);
  assert.equal(cov.summary, 'Executados: 30 de 30 (100%)');
  const reprovado = mk('b/BUG-9.md', bug('BUG-9', 'TC-1', 'Reprovado', 'https://ngosolucoes.atlassian.net/browse/qa-1'));
  const r = runView(parseView('status: FAIL\ntipo: bug').spec, [...docs, reprovado]);
  assert.deepEqual(r.tables[0].rows.map((x) => x[0].text).sort(), ['BUG-1', 'BUG-9']);
  assert.equal(runView(parseView('tags: #regressao').spec, docs).total, 3);
  assert.deepEqual(parseView('tags:').errors, ['"tags" sem valor (filtro ignorado)']);
  assert.equal(runView(parseView('jira: QA-1\ntipo: bug').spec, [...docs, reprovado]).total, 1);
  const sem = runView(parseView('status: sem-status\ntipo: visao, bug').spec, [mk('b/BUG-8.md', bug('BUG-8', 'TC-1', ''))]);
  assert.equal(sem.total, 1);
});
