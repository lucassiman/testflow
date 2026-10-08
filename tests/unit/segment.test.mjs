// Segmentos (épico → ticket → caso → bug; ciclo → execução → relatórios), herança do cabeçalho e pasta do épico.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe } from '../../src/io/docIndex.ts';
import { segmentMembers, commonHeader, inheritHeader, segmentKeyOfFolder } from '../../src/markdown/segment.ts';
import { suggestDestination, segmentOfDir, ticketDir, ticketMoves, epicKey } from '../../src/markdown/structure.ts';
import { buildLinkedDoc, sourceInfo } from '../../src/markdown/linkedDoc.ts';
import { parseSearch, viewMatches } from '../../src/markdown/views.ts';

const doc = (path, fm, body = '') => { const text = `---\n${fm}\n---\n\n# x\n\n${body}\n`; return { path, name: path.split('/').pop(), text, ...describe(text) }; };
const C = 'aplicacoes/Portal/casos';
const docs = [
  doc(`${C}/PORTAL-10 Pagamentos/PORTAL-10.md`, 'tipo: epico\nid: PORTAL-10\ntags: [pagamentos]'),
  doc(`aplicacoes/Portal/requisitos/PORTAL-120.md`, 'tipo: historia\nid: PORTAL-120\nepico: PORTAL-10'),
  doc(`${C}/PORTAL-120/TC-1.md`, 'tipo: caso-de-teste\nid: TC-1\njira: PORTAL-120'), // só o ticket: entra pela história
  doc(`${C}/PORTAL-10 Pagamentos/PORTAL-121/TC-2.md`, 'tipo: caso-de-teste\nid: TC-2\njira: PORTAL-121'), // pela pasta
  doc(`${C}/TC-3.md`, 'tipo: caso-de-teste\nid: TC-3\nepico: PORTAL-10'), // pelo campo
  doc(`${C}/TC-9.md`, 'tipo: caso-de-teste\nid: TC-9\ntags: [outro]'),
  doc('aplicacoes/Portal/bugs/BUG-1.md', 'tipo: bug\nid: BUG-1', 'Encontrado em [[TC-1]].'), // cita um membro
  doc('aplicacoes/Portal/bugs/BUG-2.md', 'tipo: bug\nid: BUG-2', 'Encontrado em [[TC-9]].'),
  doc('execucoes/r1.md', 'tipo: execucao\nid: EXEC-1\ntags: [regressao, pix]', '| # | Caso | Status |\n| --- | --- | --- |\n| 1 | [[TC-9]] | |'),
  doc('execucoes/relatorios/EXEC-1/01-encerramento.md', 'tipo: relatorio-encerramento\nid: EXEC-1-ENC\nexecucao: EXEC-1'),
  doc('visoes/v.md', 'tipo: visao', '[[TC-1]]'),
];
const ids = (k) => segmentMembers(k, docs).map((d) => d.id).sort();

test('segmento do épico: pasta, campo epico:, tickets das histórias dele e quem cita (bug); visão não entra', () => {
  assert.deepEqual(ids('PORTAL-10'), ['BUG-1', 'PORTAL-10', 'PORTAL-120', 'TC-1', 'TC-2', 'TC-3']);
});

test('segmento da execução: o que ela cita (casos), os relatórios (execucao:) e os bugs dos casos', () => {
  assert.deepEqual(ids('EXEC-1'), ['BUG-2', 'EXEC-1', 'EXEC-1-ENC', 'TC-9']);
  // por tag, com ou sem #
  assert.deepEqual(ids('#pix'), ['EXEC-1', 'EXEC-1-ENC']);
});

test('busca seg: usa os mesmos membros', () => {
  const q = parseSearch('seg:PORTAL-10 tipo:caso-de-teste');
  assert.deepEqual(docs.filter((d) => viewMatches(d, q.spec, docs)).map((d) => d.id), ['TC-1', 'TC-2', 'TC-3']);
  assert.equal(segmentKeyOfFolder(`${C}/PORTAL-10 Pagamentos`), 'PORTAL-10');
});

test('pasta do épico: épico em casos/<ÉPICO>/, caso com épico em casos/<ÉPICO>/<TICKET>/, ticket que já existe é achado', () => {
  const dirs = [C, `${C}/PORTAL-10 Pagamentos`, `${C}/PORTAL-10 Pagamentos/PORTAL-121`, `${C}/PORTAL-200`];
  assert.equal(suggestDestination({ tipo: 'epico', app: 'Portal', id: 'PORTAL-10' }, dirs).dir, `${C}/PORTAL-10 Pagamentos`);
  assert.equal(suggestDestination({ tipo: 'caso-de-teste', app: 'Portal', jira: 'PORTAL-122', epico: 'PORTAL-10' }, dirs).dir, `${C}/PORTAL-10 Pagamentos/PORTAL-122`);
  // só o jira: acha a pasta do ticket dentro do épico
  assert.equal(suggestDestination({ tipo: 'caso-de-teste', app: 'Portal', jira: 'PORTAL-121' }, dirs).dir, `${C}/PORTAL-10 Pagamentos/PORTAL-121`);
  assert.equal(suggestDestination({ tipo: 'caso-de-teste', app: 'Portal', jira: 'PORTAL-200' }, dirs).dir, `${C}/PORTAL-200`);
  assert.equal(suggestDestination({ tipo: 'caso-de-teste', app: 'Portal', epico: 'PORTAL-10' }, dirs).dir, `${C}/PORTAL-10 Pagamentos`);
  assert.equal(suggestDestination({ tipo: 'historia', app: 'Portal', id: 'PORTAL-130', epico: 'PORTAL-10' }, dirs).dir, `${C}/PORTAL-10 Pagamentos/PORTAL-130`);
  assert.equal(suggestDestination({ tipo: 'historia', app: 'Portal', id: 'PORTAL-130' }, dirs).dir, 'aplicacoes/Portal/requisitos');
  assert.equal(ticketDir('PORTAL-121', C, dirs), `${C}/PORTAL-10 Pagamentos/PORTAL-121`);
  assert.deepEqual(segmentOfDir(`${C}/PORTAL-10 Pagamentos/PORTAL-121`, dirs), { epic: 'PORTAL-10', ticket: 'PORTAL-121' });
  assert.deepEqual(segmentOfDir(`${C}/PORTAL-10 Pagamentos`, dirs), { epic: 'PORTAL-10', ticket: '' });
  assert.deepEqual(segmentOfDir(`${C}/PORTAL-200`, dirs), { epic: '', ticket: 'PORTAL-200' });
  assert.equal(epicKey('https://empresa.atlassian.net/browse/PORTAL-10'), 'PORTAL-10');
});

test('organizar por épico e ticket: o épico, as histórias e os casos vão para dentro da pasta do épico', () => {
  const entries = [
    { path: 'aplicacoes/Portal/requisitos/PORTAL-10.md', tipo: 'epico', id: 'PORTAL-10' },
    { path: 'aplicacoes/Portal/requisitos/PORTAL-120.md', tipo: 'historia', id: 'PORTAL-120', epico: 'PORTAL-10' },
    { path: `${C}/PORTAL-120/TC-1.md`, tipo: 'caso-de-teste', jira: 'PORTAL-120' },
    { path: `${C}/PORTAL-200/TC-5.md`, tipo: 'caso-de-teste', jira: 'PORTAL-200' },
  ];
  assert.deepEqual(ticketMoves(entries, [C, `${C}/PORTAL-120`, `${C}/PORTAL-200`]).map((m) => [m.path.split('/').pop(), m.dir]), [
    ['PORTAL-10.md', `${C}/PORTAL-10`],
    ['PORTAL-120.md', `${C}/PORTAL-10/PORTAL-120`],
    ['TC-1.md', `${C}/PORTAL-10/PORTAL-120`],
  ]);
});

test('herança: tags somadas e campos vazios preenchidos; o que o filho tem fica', () => {
  const child = '---\ntipo: caso-de-teste\nid: TC-1\nepico: OUTRO-1\ntags: [login]\n---\n\n# TC-1\n';
  const out = inheritHeader(child, { tags: ['pagamentos', 'login'], fields: { epico: ['PORTAL-10'], sprint: 'Sprint 7', jira: ['PORTAL-120'] } });
  assert.match(out, /^tags: \[login, pagamentos\]$/m);
  assert.match(out, /^epico: OUTRO-1$/m);
  assert.match(out, /^sprint: Sprint 7$/m);
  assert.match(out, /^jira: \[PORTAL-120\]$/m);
  assert.deepEqual(commonHeader([{ tags: ['pix', 'smoke'], epico: 'PORTAL-10', jira: 'PORTAL-120' }, { tags: ['pix'], epico: 'PORTAL-10', jira: 'PORTAL-121' }]), { tags: ['pix'], jira: [], epico: ['PORTAL-10'], sprint: [] });
});

test('bug a partir do caso: herda tags, épico, sprint e a rodada; não herda o ticket (o bug tem a chave dele)', () => {
  const tc = '---\ntipo: caso-de-teste\nid: TC-1\napp: Portal\njira: PORTAL-120\nepico: PORTAL-10\nsprint: Sprint 7\ntags: [pix]\n---\n\n# TC-1 — Pix\n';
  const tpl = '---\ntipo: bug\nid: BUG-000\ntitulo:\nstatus: FAIL\njira:\ntags: []\n---\n\n# BUG-000 — Título\n\n## Resumo\n\nx\n';
  const bug = buildLinkedDoc(tpl, { id: 'BUG-7', title: 'Erro', sourceTarget: 'TC-1', source: sourceInfo(tc), origin: { execucao: 'EXEC-1', ciclo: 'CICLO-1' } });
  assert.match(bug, /^tags: \[pix\]$/m);
  assert.match(bug, /^epico: \[PORTAL-10\]$/m);
  assert.match(bug, /^sprint: Sprint 7$/m);
  assert.match(bug, /^execucao: EXEC-1$/m);
  assert.match(bug, /^ciclo: CICLO-1$/m);
  assert.match(bug, /^jira:$/m);
});
