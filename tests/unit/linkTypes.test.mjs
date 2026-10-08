import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../src/markdown/linkTypes.ts';
import * as C from '../../src/markdown/cycle.ts';
import { parseView, runView } from '../../src/markdown/views.ts';

const cases = [{ key: 'TC-1', titulo: 'Login' }];

test('vínculos entram no cabeçalho do ciclo e da execução (só os preenchidos)', () => {
  const links = { jira: ['QA-7', 'PORTAL-45'], epico: ['PORTAL-10'], sprint: ['Sprint 42'] };
  const def = C.cycleDefDoc({ titulo: 'Regressão', cases, links });
  assert.match(def, /^jira: \[QA-7, PORTAL-45\]$/m);
  assert.match(def, /^epico: \[PORTAL-10\]$/m);
  assert.match(def, /^sprint: Sprint 42$/m);
  assert.deepEqual(L.readLinks(def), links);
  const ex = C.cycleDoc({ titulo: 'Exec', cases, ciclo: 'CICLO-1', numero: 1, links: { sprint: ['Sprint 42'] } });
  assert.deepEqual(L.readLinks(ex), { sprint: ['Sprint 42'] });
  assert.doesNotMatch(ex, /^jira:/m);
});

test('setLinks: troca, cria e limpa campos sem mexer nos outros', () => {
  const ex = C.cycleDoc({ titulo: 'Exec', cases, links: { sprint: ['Sprint 42'] } });
  const a = L.setLinks(ex, { sprint: ['Sprint 43'], jira: ['QA-1'], epico: [] });
  assert.match(a, /^sprint: Sprint 43$/m);
  assert.match(a, /^jira: \[QA-1\]$/m);
  assert.doesNotMatch(a, /^epico:/m); // não existia e continua sem
  assert.match(a, /^tipo: execucao$/m);
  const b = L.setLinks(a, { sprint: [] });
  assert.match(b, /^sprint:\s*$/m);
  assert.deepEqual(L.readLinks(b), { jira: ['QA-1'] });
  assert.equal(L.setLinks('sem cabeçalho', { sprint: ['x'] }), 'sem cabeçalho');
});

test('entrada do formulário: vírgulas, repetidos e [[ ]]', () => {
  const jira = L.LINK_BY_KEY.jira;
  assert.deepEqual(L.parseLinkInput(jira, ' QA-1, QA-2 ;QA-1 '), ['QA-1', 'QA-2']);
  assert.deepEqual(L.parseLinkInput(L.LINK_BY_KEY.epico, '[[EPIC-1]]'), ['EPIC-1']);
  assert.deepEqual(L.parseLinkInput(L.LINK_BY_KEY.sprint, 'Sprint 42, extra'), ['Sprint 42, extra']);
});

test('chips: Jira vira endereço, épico que é documento abre o documento, sprint é texto', () => {
  const chips = L.linkChips({ jira: ['QA-7'], epico: ['EPIC-1', 'PORTAL-10'], sprint: ['Sprint 42'] }, {
    jiraBase: 'https://x.atlassian.net',
    resolveDoc: (k) => (k === 'EPIC-1' ? { path: 'aplicacoes/Portal/requisitos/epic-1.md', titulo: 'Checkout' } : null),
  });
  assert.equal(chips[0].url, 'https://x.atlassian.net/browse/QA-7');
  assert.equal(chips[1].doc.path, 'aplicacoes/Portal/requisitos/epic-1.md');
  assert.equal(chips[1].label, 'EPIC-1 — Checkout');
  assert.equal(chips[2].url, 'https://x.atlassian.net/browse/PORTAL-10');
  assert.equal(chips[3].url, undefined);
  assert.equal(L.linksLine({ jira: ['QA-7'], sprint: ['Sprint 42'] }), 'Jira: QA-7 · Sprint: Sprint 42');
});

test('visões filtram por sprint e epico', () => {
  const mk = (name, extra) => ({ path: `${name}.md`, name: `${name}.md`, id: name, titulo: name, tipo: 'execucao', app: '', status: '', overall: '', prioridade: '', responsavel: '', versao: '', jira: '', tags: [], counts: { total: 0, pass: 0, fail: 0, blocked: 0, skip: 0, pending: 0 }, tasks: { total: 0, done: 0 }, targets: [], ids: [], ...extra });
  const docs = [mk('A', { sprint: 'Sprint 42', epico: 'PORTAL-10, PORTAL-11' }), mk('B', { sprint: 'Sprint 43' }), mk('C', {})];
  const ids = (src) => runView(parseView(src).spec, docs).tables.flatMap((t) => t.rows.map((r) => r[0].text));
  assert.deepEqual(ids('sprint: Sprint 42').length, 1);
  assert.equal(ids('epico: PORTAL-11').length, 1);
  assert.equal(ids('sprint: !Sprint 42').length, 2);
});
