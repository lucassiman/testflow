import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toNotionMarkdown, notionFileName } from '../../src/markdown/notion.ts';
import { codeBlock } from '../../src/editor/commands.js';

const DOC = [
  '---', 'tipo: caso-de-teste', 'id: TC-042', 'titulo: Login bloqueado', 'status: FAIL', '---', '',
  '# TC-042 — Login bloqueado', '',
  'Ver [[BUG-7|o bug]] e <span style="color:red">vermelho</span>.', '',
  '> [!WARNING]', '> Só no Chrome.', '',
  '| # | Ação | Status |', '| --- | --- | --- |', '| 1 | a<br>b | `PASS` |', '',
  '<!-- qa:resumo -->', '```mermaid', 'pie', '```', '<!-- /qa:resumo -->', '',
  '```log collapsed', '<br> `PASS`', '```', '',
  '![Passo 1](evidencias/p1.png) e [log](evidencias/x.log)',
].join('\n');

test('Notion: cabeçalho, alertas, status, links e HTML ajustados; código intacto', () => {
  const { markdown, attachments } = toNotionMarkdown(DOC);
  assert.equal(markdown, [
    '# TC-042 — Login bloqueado', '',
    '| Campo | Valor |', '| --- | --- |', '| Tipo | Caso de teste |', '| Status | ❌ **FAIL** |', '',
    'Ver o bug e vermelho.', '',
    '> ⚠️ **Atenção:** Só no Chrome.', '',
    '| # | Ação | Status |', '| --- | --- | --- |', '| 1 | a / b | ✅ **PASS** |', '',
    '```mermaid', 'pie', '```', '',
    '```log', '<br> `PASS`', '```', '',
    '📎 *p1.png* — Passo 1 e log (📎 *x.log*)', '',
  ].join('\n'));
  assert.deepEqual(attachments, ['evidencias/p1.png', 'evidencias/x.log']);
});

test('Notion: pacote mantém os prints e o nome vem do ID + título', () => {
  const { markdown } = toNotionMarkdown(DOC, { images: 'keep' });
  assert.match(markdown, /!\[Passo 1\]\(evidencias\/p1\.png\)/);
  assert.equal(notionFileName(DOC), 'TC-042 — Login bloqueado.md');
  assert.equal(notionFileName('# Sem cabeçalho: a/b\n'), 'Sem cabeçalho- a-b.md');
});

test('bloco de código: cerca maior que as crases de dentro', () => {
  assert.equal(codeBlock('json', '{"a":1}\n'), '```json\n{"a":1}\n```');
  assert.equal(codeBlock('', 'x\n```\ny'), '````\nx\n```\ny\n````');
});
