import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestDestination, triageSuggestion, ticketKey, ticketFolder, ticketOfDir, ticketMoves, fillJira,
} from '../../src/markdown/structure.ts';
import { nextCaseInFolder } from '../../src/markdown/nextCase.ts';

const base = 'aplicacoes/Portal/casos';
const dirs = ['aplicacoes', 'aplicacoes/Portal', base, `${base}/PORTAL-120 Pagamento Pix`, `${base}/PORTAL-7`];

test('ticket: chave do campo jira (lista, texto, endereço do Jira)', () => {
  assert.equal(ticketKey('PORTAL-120'), 'PORTAL-120');
  assert.equal(ticketKey(['portal-9', 'QA-1']), 'PORTAL-9');
  assert.equal(ticketKey('https://ngosolucoes.atlassian.net/browse/QA-33'), 'QA-33');
  assert.equal(ticketKey('PORTAL-5, QA-1'), 'PORTAL-5');
  assert.equal(ticketKey(''), '');
  assert.equal(ticketKey(undefined), '');
  assert.equal(ticketKey('pendente'), '');
});

test('ticket: reaproveita a pasta que começa com a chave; senão, a própria chave', () => {
  assert.equal(ticketFolder('PORTAL-120', base, dirs), 'PORTAL-120 Pagamento Pix');
  assert.equal(ticketFolder('PORTAL-7', base, dirs), 'PORTAL-7');
  assert.equal(ticketFolder('PORTAL-12', base, dirs), 'PORTAL-12'); // PORTAL-120 não é PORTAL-12
  assert.equal(ticketFolder('PORTAL-1', base, dirs), 'PORTAL-1');
});

test('ticket: chave pela pasta (só dentro de casos/)', () => {
  assert.equal(ticketOfDir(`${base}/PORTAL-120 Pagamento Pix`), 'PORTAL-120');
  assert.equal(ticketOfDir(`${base}/portal-7`), 'PORTAL-7');
  assert.equal(ticketOfDir(`${base}/PORTAL-7/sub`), 'PORTAL-7');
  assert.equal(ticketOfDir(base), '');
  assert.equal(ticketOfDir('aplicacoes/Portal/bugs/PORTAL-7'), '');
  assert.equal(ticketOfDir(`${base}/Regressão`), '');
});

test('lugar certo: caso com jira → casos/<TICKET>/; bug com jira continua em bugs/', () => {
  const d = suggestDestination({ tipo: 'caso-de-teste', app: 'Portal', jira: ['PORTAL-120'] }, dirs);
  assert.deepEqual(d, { dir: `${base}/PORTAL-120 Pagamento Pix`, reason: 'app: Portal · tipo: caso-de-teste · jira: PORTAL-120', creates: false });
  assert.equal(suggestDestination({ tipo: 'checklist', app: 'Portal', jira: 'PORTAL-300' }, dirs).dir, `${base}/PORTAL-300`);
  assert.equal(suggestDestination({ tipo: 'checklist', app: 'Portal', jira: 'PORTAL-300' }, dirs).creates, true);
  assert.equal(suggestDestination({ tipo: 'caso-de-teste', app: 'Portal', jira: '' }, dirs).dir, base);
  assert.equal(suggestDestination({ tipo: 'bug', app: 'Portal', jira: 'PORTAL-120' }, dirs).dir, 'aplicacoes/Portal/bugs');
  // triagem: caso solto em casos/ com ticket → sugere a pasta do ticket; já na pasta → nada
  assert.equal(triageSuggestion({ tipo: 'caso-de-teste', app: 'Portal', jira: 'PORTAL-7' }, base, dirs), `${base}/PORTAL-7`);
  assert.equal(triageSuggestion({ tipo: 'caso-de-teste', app: 'Portal', jira: 'PORTAL-7' }, `${base}/PORTAL-7`, dirs), null);
});

test('organizar por ticket: só casos soltos em casos/ com chave', () => {
  const entries = [
    { path: `${base}/TC-001.md`, tipo: 'caso-de-teste', jira: 'PORTAL-120' },
    { path: `${base}/TC-002.md`, tipo: 'caso-de-teste', jira: 'PORTAL-500' },
    { path: `${base}/TC-003.md`, tipo: 'caso-de-teste', jira: '' },
    { path: `${base}/PORTAL-7/TC-004.md`, tipo: 'caso-de-teste', jira: 'PORTAL-7' },
    { path: `${base}/nota.md`, tipo: 'nota', jira: 'PORTAL-7' },
    { path: 'aplicacoes/Portal/bugs/BUG-1.md', tipo: 'bug', jira: 'PORTAL-7' },
  ];
  assert.deepEqual(ticketMoves(entries, dirs), [
    { path: `${base}/TC-001.md`, dir: `${base}/PORTAL-120 Pagamento Pix`, key: 'PORTAL-120' },
    { path: `${base}/TC-002.md`, dir: `${base}/PORTAL-500`, key: 'PORTAL-500' },
  ]);
});

test('jira: preenchido pela pasta do ticket (sem sobrescrever)', () => {
  assert.equal(fillJira('---\ntipo: caso-de-teste\nid: TC-1\njira:\n---\n', 'PORTAL-7'), '---\ntipo: caso-de-teste\nid: TC-1\njira: PORTAL-7\n---\n');
  assert.equal(fillJira('---\ntipo: caso-de-teste\njira: []\n---\n', 'PORTAL-7'), '---\ntipo: caso-de-teste\njira: PORTAL-7\n---\n');
  assert.equal(fillJira('---\njira: QA-1\n---\n', 'PORTAL-7'), '---\njira: QA-1\n---\n');
  assert.equal(fillJira('---\ntitulo: X\n---\n', 'PORTAL-7'), '---\ntitulo: X\njira: PORTAL-7\n---\n');
  assert.equal(fillJira('# sem cabeçalho', 'PORTAL-7'), '# sem cabeçalho');
  assert.equal(fillJira('---\njira:\n---\n', ''), '---\njira:\n---\n');
});

test('próximo caso: mesma pasta, ordem do nome, de preferência não executado, dá a volta', () => {
  const dir = `${base}/PORTAL-7`;
  const docs = [
    { path: `${dir}/TC-10.md`, tipo: 'caso-de-teste', done: false },
    { path: `${dir}/TC-2.md`, tipo: 'caso-de-teste', done: true },
    { path: `${dir}/TC-1.md`, tipo: 'caso-de-teste', done: false },
    { path: `${dir}/TC-3.md`, tipo: 'caso-de-teste', done: false },
    { path: `${dir}/notas.md`, tipo: 'nota', done: false },
    { path: `${base}/OUTRO/TC-0.md`, tipo: 'caso-de-teste', done: false },
  ];
  const done = (d) => d.done;
  let n = nextCaseInFolder(docs, `${dir}/TC-1.md`, done);
  assert.equal(n.doc.path, `${dir}/TC-3.md`); // TC-2 já executado: pula
  assert.equal(n.pending, 2);
  assert.equal(n.total, 4);
  assert.equal(n.allDone, false);
  n = nextCaseInFolder(docs, `${dir}/TC-3.md`, done);
  assert.equal(n.doc.path, `${dir}/TC-10.md`); // ordem numérica
  n = nextCaseInFolder(docs, `${dir}/TC-10.md`, done);
  assert.equal(n.doc.path, `${dir}/TC-1.md`); // dá a volta
  // todos executados: o seguinte na ordem
  n = nextCaseInFolder(docs.map((d) => ({ ...d, done: true })), `${dir}/TC-3.md`, done);
  assert.equal(n.doc.path, `${dir}/TC-10.md`);
  assert.equal(n.allDone, true);
  assert.equal(nextCaseInFolder(docs, `${base}/OUTRO/TC-0.md`, done), null); // único da pasta
});
