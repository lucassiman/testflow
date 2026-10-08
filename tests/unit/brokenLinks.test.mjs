import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBrokenLinks, editDistance, replaceLinkTarget } from '../../src/markdown/brokenLinks.ts';
import { linkCard, lastRound } from '../../src/markdown/linkInfo.ts';
import { describe } from '../../src/io/docIndex.ts';

test('links quebrados: [[…]] e .md relativo, fora de código', () => {
  const text = 'Ver [[TC-1]] e [[TC-999|o outro]] e [[tc-999]].\n\n`[[NAO-1]]`\n\n```\n[[NAO-2]]\n```\n\n[caso](../casos/TC-2.md) · [falta](../casos/TC-404.md#passos) · [web](https://x.com/a.md)\n';
  const docs = new Set(['aplicacoes/Portal/casos/TC-2.md']);
  const out = findBrokenLinks(text, { wikiExists: (t) => t.toUpperCase() === 'TC-1', mdExists: (p) => docs.has(p), docDir: 'aplicacoes/Portal/bugs' });
  assert.deepEqual(out, [
    { line: 0, kind: 'wiki', target: 'TC-999' },
    { line: 8, kind: 'md', target: '../casos/TC-404.md' },
  ]);
  // documento fora da pasta de trabalho: .md relativo não é verificado
  assert.equal(findBrokenLinks(text, { wikiExists: () => true, mdExists: () => false, docDir: null }).length, 0);
});

test('corrigir o alvo e sugerir parecidos', () => {
  assert.equal(replaceLinkTarget('a [[TC-999]] b [[tc-999|x]] c [[TC-9990]]', 'wiki', 'TC-999', 'TC-099'), 'a [[TC-099]] b [[TC-099|x]] c [[TC-9990]]');
  assert.equal(replaceLinkTarget('[a](../c/TC-4.md#x) [b](../c/TC-4.md)', 'md', '../c/TC-4.md', '../casos/TC-4.md'), '[a](../casos/TC-4.md#x) [b](../casos/TC-4.md)');
  assert.equal(editDistance('TC-099', 'tc-999'), 1);
});

test('prévia do link: progresso, última rodada, publicação, Jira', () => {
  const text = '---\ntipo: caso-de-teste\nid: TC-5\ntitulo: Login\napp: Portal\njira: [QA-7]\nrevisao: 2\n---\n\n| # | Ação | Status |\n| --- | --- | --- |\n| 1 | a | `PASS` |\n| 2 | b | `FAIL` |\n| 3 | c | |\n\n## Histórico de execuções\n\n### Rodada 1 — 27/09/2026 — `PASS`\n\n### Rodada 2 — 28/09/2026 14:00 — `FAIL`\n';
  assert.deepEqual(lastRound(text), { round: 2, date: '28/09/2026 14:00', overall: 'FAIL' });
  const c = linkCard(describe(text), text, { path: 'aplicacoes/Portal/casos/TC-5.md', jiraBase: 'https://x.atlassian.net' });
  assert.equal(c.typeLabel, 'Caso de teste');
  assert.equal(c.id, 'TC-5');
  assert.equal(c.progress, '2/3 passos executados · 1 FAIL');
  assert.equal(c.published, '🏛 publicado r2');
  assert.deepEqual(c.jira, [{ key: 'QA-7', url: 'https://x.atlassian.net/browse/QA-7' }]);
});

import { imageAlt, imageWidth, setImageWidth } from '../../src/markdown/images.ts';
import { parseBlocks, renderTokens } from '../../src/markdown/parser.js';

test('tamanho do print pela legenda (|320)', () => {
  assert.equal(imageAlt('Passo 3 — erro|320'), 'Passo 3 — erro');
  assert.equal(imageWidth('Passo 3|560'), 560);
  assert.equal(imageWidth('Passo 3'), null);
  const t = 'Texto\n\n![Passo 1](evidencias/a.png)\n![Passo 2|320](evidencias/b.png "título")\n';
  assert.equal(setImageWidth(t, 0, 5, 'evidencias/a.png', 560), 'Texto\n\n![Passo 1|560](evidencias/a.png)\n![Passo 2|320](evidencias/b.png "título")\n');
  assert.equal(setImageWidth(t, 0, 5, 'evidencias/b.png', null), 'Texto\n\n![Passo 1](evidencias/a.png)\n![Passo 2](evidencias/b.png "título")\n');
  assert.equal(setImageWidth(t, 0, 2, 'evidencias/a.png', 320), t); // fora das linhas: não mexe
});

test('imagem com |320 sai com width e legenda limpa', () => {
  const { blocks, env } = parseBlocks('![Passo 2 — erro|320](evidencias/b.png)\n');
  const html = renderTokens(blocks[0].tokens, env);
  assert.match(html, /alt="Passo 2 — erro" width="320" class="img-sized"/);
  assert.match(html, /<span class="img-caption ui-only">Passo 2 — erro<\/span>/);
});

test('tamanho do print: tabela, caminho com acento/espaço, a segunda de duas iguais; link em tabela', () => {
  const t = '| 1 | ok | ![p](evidencias/ação.png) |\n![a](<evidencias/my print.png>) e ![a](<evidencias/my print.png>)\n';
  const a = setImageWidth(t, 0, 2, 'evidencias/a%C3%A7%C3%A3o.png', 320);
  assert.match(a, /\| !\[p\\\|320\]\(evidencias\/ação\.png\) \|/);
  assert.equal(imageAlt('p\\|320'), 'p');
  const b = setImageWidth(t, 0, 2, 'evidencias/my%20print.png', 560, 1);
  assert.equal(b.split('\n')[1], '![a](<evidencias/my print.png>) e ![a|560](<evidencias/my print.png>)');
  assert.equal(replaceLinkTarget('| [[TC-55\\|caso]] |', 'wiki', 'TC-55', 'TC-5'), '| [[TC-5\\|caso]] |');
});
