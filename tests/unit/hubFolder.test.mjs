import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFrom, folderChoices, planHubFolder } from '../../src/markdown/hubFolder.ts';

test('resolveFrom: resolve relativo, decodifica e recusa sair da pasta de trabalho', () => {
  assert.equal(resolveFrom('a/b/doc.md', 'img/x%20y.png'), 'a/b/img/x y.png');
  assert.equal(resolveFrom('a/b/doc.md', '../c.png'), 'a/c.png');
  assert.equal(resolveFrom('doc.md', '../fora.png'), null);
});

test('folderChoices: pasta do documento e ancestrais, da mais funda à raiz', () => {
  assert.deepEqual(folderChoices('a/b/doc.md'), ['a/b', 'a', '']);
  assert.deepEqual(folderChoices('doc.md'), ['']);
});

test('planHubFolder: só .md da pasta, imagens como anexos relativos e ausentes listados', () => {
  const sources = [
    { path: 'a/um.md', text: '# Um\n\n![p](img/p.png)\n\n![z](img/falta.png)\n' },
    { path: 'a/sub/dois.md', text: '# Dois\n' },
    { path: 'b/fora.md', text: '# Fora\n' },
  ];
  const plan = planHubFolder(sources, 'a', (p) => p === 'a/img/p.png');
  assert.equal(plan.docs.length, 2);
  assert.ok(plan.docs.every((d) => !d.name.startsWith('b/')));
  assert.equal(plan.attachments.length, 1);
  assert.equal(plan.attachments[0].from, 'a/img/p.png');
  assert.equal(plan.missing.length, 1);
});
