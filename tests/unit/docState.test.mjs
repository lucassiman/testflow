import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishInfo, stateMarks } from '../../src/markdown/docState.ts';
import { stampPublish } from '../../src/markdown/publish.ts';
import { compareVersions, changesSince } from '../../src/ui/whatsNew.js';
import { lintMarkdown } from '../../src/markdown/lint.js';
import { parseBlocks } from '../../src/markdown/parser.js';

const base = '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: X\n---\n\n# TC-1 — X\n\nTexto.\n';
const meta = { revisao: 3, publicado_em: '2026-09-28 10:00', publicado_por: 'Lucas' };

test('estado de publicação pelo cabeçalho', () => {
  assert.equal(publishInfo(base).state, 'none');
  const pub = stampPublish(base, meta);
  assert.deepEqual(publishInfo(pub), { state: 'published', revisao: 3, publicado_em: '2026-09-28 10:00', publicado_por: 'Lucas' });
  assert.equal(publishInfo(`${pub}\nMais.\n`).state, 'changed');
  // arquivo publicado por versão antiga (sem publicado_hash): conta como publicado
  assert.equal(publishInfo(base.replace('titulo: X\n', 'titulo: X\nrevisao: 1\n')).state, 'published');
});

test('marcas: execução, sessão, prints e rascunho só com pasta oficial', () => {
  assert.deepEqual(stateMarks(base).map((m) => m.key), []);
  assert.deepEqual(stateMarks(base, { official: true }).map((m) => m.key), ['draft']);
  const marks = stateMarks(`${stampPublish(base, meta)}\nx`, { session: true, pendingPrints: 2 });
  assert.deepEqual(marks.map((m) => [m.key, m.label]), [['session', 'sessão'], ['prints', '2 prints'], ['changed', 'r3 alterado']]);
  assert.equal(stateMarks(base, { exec: true })[0].icon, '▶');
});

test('o que mudou: versões novas desde a última vista', () => {
  assert.ok(compareVersions('0.23.0', '0.22.10') > 0);
  assert.ok(compareVersions('0.22.2', '0.22.10') < 0);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  const log = [{ version: '0.23.0', items: [] }, { version: '0.22.2', items: [] }, { version: '0.22.1', items: [] }, { version: '0.24.0', items: [] }];
  assert.deepEqual(changesSince(log, '0.22.1', '0.23.0').map((e) => e.version), ['0.23.0', '0.22.2']);
  assert.deepEqual(changesSince(log, null, '0.23.0', 2).map((e) => e.version), ['0.23.0', '0.22.2']);
  assert.deepEqual(changesSince(log, '0.23.0', '0.23.0'), []);
});

test('qa-md: versão do formato mais nova que a do editor gera aviso', () => {
  const lint = (text) => lintMarkdown(parseBlocks(text)).map((w) => w.message);
  assert.ok(!lint(base.replace('titulo: X\n', 'titulo: X\nqa-md: 1\n')).some((m) => m.includes('qa-md')));
  assert.ok(lint(base.replace('titulo: X\n', 'titulo: X\nqa-md: 2\n')).some((m) => m.includes('qa-md: 2') && m.includes('atualize o editor')));
});
