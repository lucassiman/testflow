import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformPaste } from '../../src/editor/smartPaste.js';
import { transformLines } from '../../src/editor/commands.js';
import { parseBlocks } from '../../src/markdown/parser.js';
import { lintMarkdown } from '../../src/markdown/lint.js';
import { parseFrontMatter } from '../../src/markdown/frontmatter.ts';
import { extractWikiTargets, extractIds } from '../../src/markdown/wikilinks.ts';
import { copyFailures, copySummary } from '../../src/markdown/share.ts';

test('colar do Excel vira tabela; status vira badge', () => {
  const r = transformPaste('ID\tStatus\nTC-1\tPASS\nTC-2\tFAIL\n');
  assert.equal(r.kind, 'table');
  assert.match(r.markdown, /\| TC-2 \| `FAIL` \|/);
});

test('colar JSON/log vira bloco de código; texto comum não muda', () => {
  assert.match(transformPaste('{"a":1,"b":[1,2]}').markdown, /^```json\n\{\n {2}"a": 1/);
  assert.equal(transformPaste('texto comum'), null);
});

test('comandos de linha: lista, título, destaque', () => {
  assert.equal(transformLines('a\nb', 0, 2, 'ul'), '- a\n- b');
  assert.equal(transformLines('Título', 0, 1, 'h2'), '## Título');
  assert.equal(transformLines('texto', 0, 1, 'alert:WARNING'), '> [!WARNING]\n> texto');
});

test('parser: front-matter vira bloco próprio; alertas e badges renderizam', () => {
  const p = parseBlocks('---\ntipo: bug\nid: BUG-1\n---\n\n# T\n\n> [!NOTE]\n> x\n\n`PASS`\n\n[[TC-042]]\n');
  assert.equal(p.blocks[0].type, 'frontmatter');
  assert.equal(parseFrontMatter(p.blocks[0].text).data.id, 'BUG-1');
});

test('validação: passo sem esperado, ID repetido, status desconhecido', () => {
  const doc = '| ID | Ação | Resultado esperado | Status |\n| --- | --- | --- | --- |\n| TC-1 | a | | `PASS` |\n| TC-1 | b | c | ABERTO |\n';
  const msgs = lintMarkdown(parseBlocks(doc)).map((w) => w.message).join('\n');
  assert.match(msgs, /sem resultado esperado/);
  assert.match(msgs, /ID TC-1 repetido/);
  assert.match(msgs, /status "ABERTO" desconhecido/);
});

test('links [[ ]] e IDs citados (fora de código)', () => {
  const text = 'Ver [[TC-042]] e [[BUG-7|o bug]].\n\n```\n[[NAO]]\n```\nCita CEN-3.';
  assert.deepEqual(extractWikiTargets(text), ['TC-042', 'BUG-7']);
  assert.deepEqual(extractIds(text), ['TC-042', 'BUG-7', 'CEN-3']);
});

test('copiar para o Claude: falhas e resumo', () => {
  const doc = '---\nid: TC-9\ntitulo: X\nambiente: HML\n---\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | a | b | c | `FAIL` |\n| 2 | d | e | | `PASS` |\n';
  const f = copyFailures(doc, 'x.md');
  assert.match(f, /\*\*FAIL\*\* — #: 1 · Ação: a · Resultado esperado: b · Resultado obtido: c/);
  assert.match(f, /Ambiente: HML/);
  assert.match(copySummary(doc, 'x.md'), /PASS 1 · FAIL 1/);
  assert.equal(copyFailures(doc.replace('`FAIL`', '`PASS`'), 'x.md'), null);
});
