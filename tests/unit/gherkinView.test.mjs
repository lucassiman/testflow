import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gherkinHtml } from '../../src/markdown/gherkinView.ts';

const FEATURE = `# language: pt
@login
Funcionalidade: Login
  Cenário: Válido
    Dado que estou na tela "Entrar"
    Quando informo <email>
    Então vejo o Dashboard
  Esquema do Cenário: Inválido
    E sigo
    Exemplos:
      | email | msg |
      | a@b.c | Erro longo |`;

test('palavras-chave em português, tags, comentários, textos e parâmetros', () => {
  const html = gherkinHtml(FEATURE);
  assert.match(html, /<span class="gk-kw gk-head hljs-keyword">Funcionalidade:<\/span>/);
  assert.match(html, /<span class="gk-kw hljs-keyword">Dado<\/span> que estou na tela <span class="gk-str hljs-string">&quot;Entrar&quot;<\/span>/);
  assert.match(html, /<span class="gk-param hljs-variable">&lt;email&gt;<\/span>/);
  assert.match(html, /<span class="gk-tag hljs-meta">@login<\/span>/);
  assert.match(html, /<span class="gk-comment hljs-comment"># language: pt<\/span>/);
  assert.match(html, /<span class="gk-kw hljs-keyword">E<\/span> sigo/);
});

test('separação só a partir do 2º cenário', () => {
  const html = gherkinHtml(FEATURE);
  assert.equal((html.match(/gk-sep/g) || []).length, 1);
  assert.match(html, /<span class="gk-l gk-sep">  <span class="gk-kw gk-head hljs-keyword">Esquema do Cenário:/);
});

test('tabela de exemplos com colunas alinhadas', () => {
  const rows = gherkinHtml(FEATURE).match(/<span class="gk-l gk-row">.*?<\/span>(?=<span class="gk-l|$)/g) || [];
  const text = rows.map((r) => r.replace(/<[^>]+>/g, ''));
  assert.deepEqual(text, ['      | email | msg        |', '      | a@b.c | Erro longo |']);
});

test('inglês também vale', () => {
  assert.match(gherkinHtml('Scenario: X\n  Given a\n  And b'), /<span class="gk-kw hljs-keyword">Given<\/span>/);
});
