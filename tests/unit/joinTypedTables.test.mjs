import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinTypedTables } from '../../src/markdown/typedTables.ts';

test('junta as linhas de uma tabela separadas por linhas em branco', () => {
  assert.equal(joinTypedTables('Antes\n\n| A | B |\n\n| --- | --- |\n\n| 1 | 2 |\n\nDepois'), 'Antes\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nDepois');
});

test('sem a linha separadora não mexe (parágrafos que só começam com |)', () => {
  const md = '| um |\n\n| dois |';
  assert.equal(joinTypedTables(md), md);
});

test('tabela já certa e duas tabelas separadas continuam iguais', () => {
  const md = '| A |\n| --- |\n| 1 |\n\ntexto\n\n| B |\n|:-:|\n| 2 |';
  assert.equal(joinTypedTables(md), md);
});
