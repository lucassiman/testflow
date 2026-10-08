import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewPrompt, extractReviewed, diffWords, countChanges, applyReview } from '../../src/markdown/review.ts';

test('pedido: objetivos, regras e texto num bloco que não conflita com ``` do texto', () => {
  const p = buildReviewPrompt('Texto com ```code```', { goals: ['ortografia', 'clareza'], extra: 'curto' });
  assert.match(p, /corrigir ortografia/);
  assert.match(p, /mais claro/);
  assert.match(p, /\*\*Pedido adicional:\*\* curto/);
  assert.match(p, /````markdown\nTexto com ```code```\n````$/);
});

test('resposta: pega o bloco markdown (mesmo com texto em volta ou blocos internos)', () => {
  assert.equal(extractReviewed('Claro! Segue:\n\n```markdown\n# Título\n\nTexto certo.\n```\n\nQualquer coisa me avise.'), '# Título\n\nTexto certo.');
  assert.equal(extractReviewed('````markdown\nA\n```js\nx()\n```\nB\n````'), 'A\n```js\nx()\n```\nB');
  assert.equal(extractReviewed('Aqui está o texto revisado:\nSó o texto.'), 'Só o texto.');
});

test('diff por palavras e contagem de trechos alterados', () => {
  const d = diffWords('O usuario acesa o sistema.', 'O usuário acessa o sistema.');
  assert.equal(countChanges(d), 2);
  assert.equal(d.filter((x) => x.type !== 'ins').map((x) => x.text).join(''), 'O usuario acesa o sistema.');
  assert.equal(d.filter((x) => x.type !== 'del').map((x) => x.text).join(''), 'O usuário acessa o sistema.');
  assert.equal(countChanges(diffWords('igual', 'igual')), 0);
});

test('aplicar: troca só a faixa; relocaliza se o documento mudou; erro se o trecho sumiu', () => {
  const src = '# T\n\nerrado aqui\n\nfim';
  assert.equal(applyReview(src, { start: 2, end: 3, original: 'errado aqui' }, 'certo aqui').source, '# T\n\ncerto aqui\n\nfim');
  const moved = `nova linha\n${src}`;
  assert.equal(applyReview(moved, { start: 2, end: 3, original: 'errado aqui' }, 'certo aqui').source, 'nova linha\n# T\n\ncerto aqui\n\nfim');
  assert.ok(applyReview('outro', { start: 0, end: 1, original: 'errado aqui' }, 'x').error);
});

test('documento inteiro mantém a quebra de linha final', () => {
  const src = '# T\n\ntexto\n';
  assert.equal(applyReview(src, { start: 0, end: 4, original: src }, '# T\n\nTexto.').source, '# T\n\nTexto.\n');
});
