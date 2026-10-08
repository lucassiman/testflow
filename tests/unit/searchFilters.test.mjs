import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearch, viewMatches, SEARCH_PRESETS } from '../../src/markdown/views.ts';
import { describe } from '../../src/io/docIndex.ts';

const tc = (id, { tags = '[]', jira = '', steps = ['', ''], app = 'Portal' } = {}) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: ${app}\njira: ${jira}\ntags: ${tags}\n---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Status |\n| --- | --- | --- | --- |\n${steps.map((s, i) => `| ${i + 1} | a | b | ${s ? `\`${s}\`` : ''} |`).join('\n')}\n`;
const mk = (path, text) => ({ path, name: path.split('/').pop(), lastModified: 0, ...describe(text), last: null });
const docs = [
  mk('casos/TC-1.md', tc('TC-1', { tags: '[regressao]', jira: 'ABC-123', steps: ['PASS', 'FAIL'] })),
  mk('casos/TC-2.md', tc('TC-2', { tags: '[smoke]', steps: ['PASS', 'PASS'] })),
  mk('casos/TC-3.md', tc('TC-3', { tags: '[regressao]', app: 'Loja' })),
];
const ids = (q) => { const { spec } = parseSearch(q); return docs.filter((d) => !spec || viewMatches(d, spec)).map((d) => d.id); };

test('busca: separa filtros do texto', () => {
  const q = parseSearch('status:FAIL tag:regressao senha errada');
  assert.equal(q.text, 'senha errada');
  assert.deepEqual(q.tokens, ['status:FAIL', 'tag:regressao']);
  assert.ok(q.spec);
  assert.deepEqual(parseSearch('veja http://x.com/a:b').spec, null); // "http:" não é filtro
  assert.equal(parseSearch('veja http://x.com').text, 'veja http://x.com');
});

test('busca: filtros casam como nas visões', () => {
  assert.deepEqual(ids('status:FAIL'), ['TC-1']);
  assert.deepEqual(ids('tag:regressao'), ['TC-1', 'TC-3']);
  assert.deepEqual(ids('-tag:regressao'), ['TC-2']);
  assert.deepEqual(ids('tag:!regressao'), ['TC-2']);
  assert.deepEqual(ids('jira:ABC-123'), ['TC-1']);
  assert.deepEqual(ids('status:FAIL,PASS'), ['TC-1', 'TC-2']);
  assert.deepEqual(ids('app:Loja execucao:nunca'), ['TC-3']);
  assert.deepEqual(ids('app:"Loja"'), ['TC-3']);
  assert.deepEqual(ids('Status:fail'), ['TC-1']); // sem diferenciar maiúsculas
});

test('busca: atalhos prontos são filtros válidos', () => {
  for (const p of SEARCH_PRESETS) {
    const q = parseSearch(p.query);
    assert.equal(q.text, '', p.label);
    assert.deepEqual(q.errors, [], p.label);
    assert.ok(q.spec, p.label);
  }
});
