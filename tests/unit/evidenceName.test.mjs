import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanCaption, evidenceBaseName, evidenceSlug, fileSlug } from '../../src/markdown/evidenceName.ts';

test('nome do print: data e hora + documento + passo + ação, sem acento nem símbolos', () => {
  assert.equal(
    evidenceBaseName('2026-10-05_15-30-12', { docId: 'TC-042', step: 'Passo 3', text: 'Clicar em "Entrar" (botão)' }),
    '2026-10-05_15-30-12_TC-042-passo-3-clicar-em-entrar-botao',
  );
  assert.equal(evidenceSlug({ docId: 'TC-042', step: 'Passo 3', text: 'Ação: senha inválida' }), 'TC-042-passo-3-acao-senha-invalida');
});

test('sem descrição o nome é só a data e hora (como antes); partes que faltam são ignoradas', () => {
  assert.equal(evidenceBaseName('2026-10-05_15-30-12', {}), '2026-10-05_15-30-12');
  assert.equal(evidenceBaseName('2026-10-05_15-30-12', { docId: '' , step: undefined, text: '   ' }), '2026-10-05_15-30-12');
  assert.equal(evidenceBaseName('2026-10-05_15-30-12', { docId: 'SES-005', step: 'nota' }), '2026-10-05_15-30-12_SES-005-nota');
});

test('texto longo é cortado sem deixar palavra pela metade; nunca sobra hífen ou ponto na ponta', () => {
  const slug = evidenceSlug({ docId: 'TC-042', step: 'Passo 12', text: 'Preencher o formulário de cadastro completo com todos os campos obrigatórios e opcionais do cliente' });
  assert.ok(slug.length <= 70, slug);
  assert.match(slug, /^TC-042-passo-12-preencher-o-formulario/);
  assert.doesNotMatch(slug, /[-.]$/);
  assert.equal(fileSlug('..:: ?? ::..'), '');
  assert.equal(fileSlug('v1.2.3 — ok'), 'v1.2.3-ok');
});

test('legenda do print não leva [ ] | nem quebra de linha (estragaria o link e a tabela)', () => {
  assert.equal(cleanCaption('Clicar em [Entrar] | depois\nsair'), 'Clicar em Entrar depois sair');
  assert.ok(cleanCaption('x'.repeat(200)).length <= 90);
});
