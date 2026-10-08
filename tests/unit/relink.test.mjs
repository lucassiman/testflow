import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  joinPath, relativePath, rebase, nameError, uniqueName, findRefs, remapRefs, localAssets,
  remapWikiLinks, wikiTargetFor, isInside,
} from '../../src/markdown/relink.ts';

test('caminhos: juntar, relativo, trocar a pasta', () => {
  assert.equal(joinPath('a/b', '../c/x.png'), 'a/c/x.png');
  assert.equal(joinPath('a', './evidencias/x.png'), 'a/evidencias/x.png');
  assert.equal(joinPath('', '../x'), null);
  assert.equal(relativePath('a/b', 'a/c/x.md'), '../c/x.md');
  assert.equal(relativePath('', 'a/x.md'), 'a/x.md');
  assert.equal(relativePath('a/b', 'x.md'), '../../x.md');
  assert.equal(relativePath('a', 'a/evidencias/p.png'), 'evidencias/p.png');
  assert.equal(rebase('apps/login/casos/TC-1.md', 'apps/login', 'aplicacoes/login'), 'aplicacoes/login/casos/TC-1.md');
  assert.equal(rebase('apps/loginx/a.md', 'apps/login', 'z'), null);
  assert.equal(rebase('apps/a.md', 'apps', ''), 'a.md');
  assert.ok(isInside('a/b.md', 'a') && isInside('x.md', '') && !isInside('ab/c.md', 'a'));
});

test('nomes: inválidos no Windows/Mac e nome livre', () => {
  assert.equal(nameError('casos'), null);
  assert.match(nameError('a/b'), /Não use/);
  assert.match(nameError('.oculta'), /ponto/);
  assert.match(nameError('fim.'), /terminar/);
  assert.match(nameError('CON'), /reservado/);
  assert.match(nameError('  '), /Digite/);
  const taken = new Set(['x.png', 'x-2.png', 'Pasta']);
  assert.equal(uniqueName('x.png', (n) => taken.has(n)), 'x-3.png');
  assert.equal(uniqueName('Pasta', (n) => taken.has(n)), 'Pasta-2');
  assert.equal(uniqueName('novo.md', (n) => taken.has(n)), 'novo.md');
});

test('referências: links, imagens, <img>, definições; ignora código', () => {
  const text = [
    '![Print](evidencias/a%20b.png) e [outro](../bugs/BUG-1.md#passos "t")',
    '<img src="evidencias/c.png" width="300"> [site](https://x.com)',
    '`[nao](nao.md)`',
    '```',
    '[nem](nem.md)',
    '```',
    '[ref]: <anexos/log final.txt>',
  ].join('\n');
  const refs = findRefs(text).map((r) => r.href);
  assert.deepEqual(refs, ['evidencias/a%20b.png', '../bugs/BUG-1.md#passos', 'evidencias/c.png', 'https://x.com', 'anexos/log final.txt']);
  assert.deepEqual(localAssets(text, 'casos/TC-1.md').sort(), ['casos/anexos/log final.txt', 'casos/evidencias/a b.png', 'casos/evidencias/c.png']);
});

test('mover documento: links para fora são recalculados; prints que vão junto continuam iguais', () => {
  const text = '![p](evidencias/a.png)\n[bug](../bugs/BUG-1.md#x)\n[raiz](../LEIAME.md)\n[web](https://x.com)\n';
  const { text: out, count } = remapRefs(text, 'casos/TC-1.md', 'apps/login/casos/TC-1.md',
    (t) => (t === 'casos/evidencias/a.png' ? 'apps/login/casos/evidencias/a.png' : null));
  assert.equal(count, 2);
  assert.equal(out, '![p](evidencias/a.png)\n[bug](../../../bugs/BUG-1.md#x)\n[raiz](../../../LEIAME.md)\n[web](https://x.com)\n');
  // print que ganhou outro nome no destino (já havia um igual)
  const renamed = remapRefs('![p](evidencias/a.png)', 'c/TC-1.md', 'd/TC-1.md', (t) => (t === 'c/evidencias/a.png' ? 'd/evidencias/a-2.png' : null));
  assert.equal(renamed.text, '![p](evidencias/a-2.png)');
});

test('documento que aponta para um arquivo movido; espaços viram %20; <...> fica', () => {
  const text = '[caso](casos/TC-1.md) e [outro](<casos/meu caso.md>) e [x](casos/TC-1.md?a=1)';
  const map = (t) => ({ 'casos/TC-1.md': 'apps/Login Web/TC-1.md', 'casos/meu caso.md': 'apps/Login Web/meu caso.md' })[t] ?? null;
  const { text: out, count } = remapRefs(text, 'LEIAME.md', 'LEIAME.md', map);
  assert.equal(count, 3);
  assert.equal(out, '[caso](apps/Login%20Web/TC-1.md) e [outro](<apps/Login Web/meu caso.md>) e [x](apps/Login%20Web/TC-1.md?a=1)');
  // nada mudou: texto idêntico
  assert.equal(remapRefs(text, 'LEIAME.md', 'LEIAME.md', () => null).count, 0);
});

test('[[links]]: por caminho e por nome acompanham; por ID não muda', () => {
  assert.equal(wikiTargetFor('casos/login', 'casos/login.md', 'apps/login/login.md'), 'apps/login/login');
  assert.equal(wikiTargetFor('login', 'casos/login.md', 'casos/login-web.md'), 'login-web');
  assert.equal(wikiTargetFor('login.md', 'casos/login.md', 'casos/login-web.md'), 'login-web.md');
  assert.equal(wikiTargetFor('login', 'casos/login.md', 'apps/login.md'), null); // só mudou de pasta
  assert.equal(wikiTargetFor('TC-042', 'casos/login.md', 'casos/x.md'), null);
  const { text, count } = remapWikiLinks('Ver [[login|o caso]] e [[ login ]] e `[[login]]`', (t) => (t === 'login' ? 'login-web' : null));
  assert.equal(count, 2);
  assert.equal(text, 'Ver [[login-web|o caso]] e [[ login-web ]] e `[[login]]`');
});

test('não mexe em nota de rodapé, "[Nota]: texto", comentário HTML nem caminho do Windows', () => {
  const text = '[^1]: Veja o manual antigo.\n[Nota]: isto é prosa\n<!-- ![x](evidencias/a.png) -->\n[w](C:\\docs\\a.md)\n[ref]: anexos/log.txt\n';
  assert.deepEqual(findRefs(text).map((r) => r.href), ['C:\\docs\\a.md', 'anexos/log.txt']);
  const { text: out } = remapRefs(text, 'a/doc.md', 'b/c/doc.md', () => null);
  assert.equal(out, text.replace('[ref]: anexos/log.txt', '[ref]: ../../a/anexos/log.txt'));
});

test('anexos: só pasta de evidências logo abaixo e imagens ao lado; documento na raiz não leva a pasta inteira', () => {
  const text = '![a](evidencias/x.png) ![b](print.png) [m](docs/manual.pdf) [n](notas.txt) ![c](outro-caso/evidencias/y.png) [l](anexos/log.txt)';
  assert.deepEqual(localAssets(text, 'LEIAME.md').sort(), ['anexos/log.txt', 'evidencias/x.png', 'print.png']);
  assert.deepEqual(localAssets(text, 'casos/TC-1.md').sort(), ['casos/anexos/log.txt', 'casos/evidencias/x.png', 'casos/print.png']);
});

test('links com %23, e links para fora da pasta de trabalho acompanham a mudança de pasta', () => {
  const r = remapRefs('[d](C%23%20dicas.md)', 'x.md', 'a/x.md', () => null);
  assert.equal(r.text, '[d](../C%23%20dicas.md)');
  const out = remapRefs('![logo](../../shared/logo.png)', 'a/doc.md', 'a/b/doc.md', () => null);
  assert.equal(out.text, '![logo](../../../shared/logo.png)');
  assert.equal(remapRefs('![logo](../../shared/logo.png)', 'a/doc.md', 'a/doc2.md', () => null).count, 0);
});
