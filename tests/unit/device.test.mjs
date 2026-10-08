import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../src/markdown/device.ts';
import * as C from '../../src/markdown/cycle.ts';
import { parseView, runView } from '../../src/markdown/views.ts';

test('tipos e versão: formatar e ler de volta', () => {
  assert.equal(D.formatDevice('web'), 'WEB');
  assert.equal(D.formatDevice('ios', '18'), 'Mobile iOS — iOS 18');
  assert.equal(D.formatDevice('ios', 'iOS 18'), 'Mobile iOS — iOS 18');
  assert.equal(D.formatDevice('android', '15'), 'Mobile Android — Android 15');
  assert.equal(D.formatDevice('mobile', '99'), 'Mobile — Todos'); // sem versão
  for (const [v, key, ver] of [['WEB', 'web', ''], ['Mobile iOS — iOS 18', 'ios', '18'], ['Mobile Android - Android 15.2', 'android', '15.2'], ['Mobile — Todos', 'mobile', '']]) {
    const d = D.parseDevice(v);
    assert.equal(d.kind.key, key);
    assert.equal(d.version, ver);
  }
  assert.equal(D.parseDevice('iPhone 14'), null); // texto livre antigo continua valendo como está
  assert.deepEqual(D.deviceTags('Mobile Android — Android 15'), ['mobile', 'android']);
});

test('setDevice: grava o campo e acerta as tags sem tirar as suas', () => {
  const doc = '---\ntipo: caso-de-teste\nambiente: HML\nbrowser:\ntags: [regressao, web]\n---\n# x\n';
  const a = D.setDevice(doc, 'Mobile iOS — iOS 18');
  assert.match(a, /^dispositivo: Mobile iOS — iOS 18$/m);
  assert.match(a, /^tags: \[regressao, web, mobile, ios\]$/m);
  assert.equal(D.readDevice(a), 'Mobile iOS — iOS 18');
  const b = D.setDevice(a, 'Mobile Android — Android 15');
  assert.match(b, /^tags: \[regressao, web, mobile, android\]$/m); // troca ios por android
  const c = D.setDevice(b, '');
  assert.match(c, /^dispositivo:\s*$/m);
  assert.match(c, /^tags: \[regressao, web\]$/m);
  assert.equal(D.setDevice('sem cabeçalho', 'WEB'), 'sem cabeçalho');
  // sem a linha tags: ela é criada
  assert.match(D.setDevice('---\ntipo: bug\n---\n# b\n', 'WEB'), /^tags: \[web\]$/m);
});

test('a execução nasce com o dispositivo; visões filtram por ele', () => {
  const ex = D.setDevice(C.cycleDoc({ titulo: 'E', cases: [], dispositivo: 'Mobile iOS — iOS 18' }), 'Mobile iOS — iOS 18');
  assert.match(ex, /^dispositivo: Mobile iOS — iOS 18$/m);
  assert.equal(ex.match(/^dispositivo:/gm).length, 1);
  const mk = (name, dispositivo) => ({ path: `${name}.md`, name: `${name}.md`, id: name, titulo: name, tipo: 'caso-de-teste', app: '', status: '', overall: '', prioridade: '', responsavel: '', versao: '', jira: '', tags: [], counts: { total: 0, pass: 0, fail: 0, blocked: 0, skip: 0, pending: 0 }, tasks: { total: 0, done: 0 }, targets: [], ids: [], dispositivo });
  const docs = [mk('A', 'WEB'), mk('B', 'Mobile iOS — iOS 18'), mk('C', 'Mobile Android — Android 15'), mk('D', '')];
  const n = (src) => runView(parseView(src).spec, docs).tables.flatMap((t) => t.rows).length;
  assert.equal(n('dispositivo: mobile'), 2);
  assert.equal(n('dispositivo: ios'), 1);
  assert.equal(n('dispositivo: web'), 1);
});
