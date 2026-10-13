// Comparador de JSON: erro localizado, diferenças por chave/id/conteúdo, opções e comparação por partes (JSON grande).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJson, createDiff, flatten, knownDiffs, nextDiff, prevDiff, pathOf, diffMarkdown, jsonStats, expand, defaultOptions, reveal, sizeOf,
} from '../../src/markdown/jsonDiff.ts';

const L = { pedido: 'PED-1', status: 'processando', cliente: { id: 1, email: 'a@x.com' }, itens: [{ id: 'A', qtd: 1 }, { id: 'B', qtd: 2 }, { id: 'C', qtd: 1 }], tags: ['p'], obs: null, criadoEm: '2026-01-01' };
const R = { pedido: 'PED-1', status: 'enviado', cliente: { id: 1, email: 'b@x.com' }, itens: [{ id: 'A', qtd: 1 }, { id: 'B', qtd: 1 }, { id: 'D', qtd: 1 }], tags: ['p', 'frete'], rastreio: { codigo: 'X' }, criadoEm: '2026-02-02' };
const P = (v) => parseJson(JSON.stringify(v, null, 2));

test('erro localizado em português', () => {
  assert.deepEqual(parseJson('  '), { empty: true });
  const e = parseJson('{\n  "a": 1,\n  "b": 2,\n}');
  assert.equal(e.error, true);
  assert.equal(e.line, 4);
  assert.match(e.msg, /vírgula sobrando antes de "}"/);
  assert.match(parseJson("{'a': 1}").msg, /aspas simples/);
  assert.match(parseJson('{"a": 1 "b": 2}').msg, /falta uma vírgula/);
  assert.match(parseJson('{"a": tru}').msg, /valor inválido "tru"/);
  assert.match(parseJson('{"a": 1} // x').msg, /comentários/);
  assert.equal(parseJson('﻿[1]').ok, true);
});

test('diferenças: alterado, novo, removido; itens pareados por id; caminho legível', () => {
  const d = createDiff(P(L), P(R), { size: 100 });
  const { list, counts, pending } = knownDiffs(d.roots);
  assert.equal(pending, false);
  assert.deepEqual(counts, { chg: 4, add: 3, rem: 2 });
  assert.deepEqual(list.map((n) => `${n.st} ${pathOf(n)}`), [
    'chg status', 'chg cliente.email', 'chg itens[1].qtd', 'add itens[2]', 'rem itens[2]', 'add tags[1]', 'add rastreio', 'rem obs', 'chg criadoEm',
  ]);
  assert.equal(d.roots[0].kids.find((k) => k.key === 'itens').how, 'pareado por "id"');
  assert.equal(d.roots[0].dc, 9);
  assert.equal(d.roots[0].exact, true);
});

test('opções: ignorar chaves (aparecem, não contam) e ignorar a ordem dos arrays', () => {
  const o = { ...defaultOptions(), ignoreKeys: ['criadoEm', 'status'] };
  let d = createDiff(P(L), P(R), { size: 100, options: o });
  const k = knownDiffs(d.roots);
  assert.equal(k.list.some((n) => n.key === 'criadoEm' || n.key === 'status'), false);
  assert.ok(d.roots[0].kids.find((n) => n.key === 'criadoEm').ign);
  d = createDiff(P([3, 1, 2]), P([1, 2, 3]), { size: 10 });
  assert.equal(knownDiffs(d.roots).list.length > 0, true);
  d = createDiff(P([3, 1, 2]), P([1, 2, 3]), { size: 10, options: { ...defaultOptions(), ignoreOrder: true } });
  assert.equal(knownDiffs(d.roots).list.length, 0);
  assert.equal(d.roots[0].st, 'same');
  // sem comparar: cada lado só com a estrutura
  d = createDiff(P(L), P(R), { compare: false, size: 100 });
  assert.equal(d.compared, false);
  assert.deepEqual(d.roots.map((r) => r.st), ['solo', 'solo']);
});

test('JSON grande: compara por partes — só o que é aberto; a navegação abre só até a próxima diferença', () => {
  const mk = (n, change) => ({ meta: { v: 1 }, lista: Array.from({ length: n }, (_, i) => ({ id: i, nome: `item ${i}`, det: { a: i, b: [i, i + 1, { c: i === change ? 'x' : 'y' }] } })) });
  const left = P(mk(30000, -1));
  const right = P(mk(30000, 25000));
  const d = createDiff(left, right, { size: 5_000_000 }); // acima do limite: por partes
  assert.equal(d.eager, false);
  const root = d.roots[0];
  const lista = root.kids.find((k) => k.key === 'lista');
  assert.ok(lista.kids === null, 'a lista não foi montada');
  assert.equal(sizeOf(lista), 30000);
  assert.ok(['pending', 'mod'].includes(lista.st));
  const rows = flatten(d.roots, d.options);
  assert.equal(rows.length, 3); // raiz + meta (fechado) + lista (fechada)
  const k1 = knownDiffs(d.roots);
  assert.equal(k1.list.length, 0);
  assert.equal(k1.pending, true);
  // próxima diferença: abre por partes até achar
  const n = nextDiff(d.roots, null, d.options);
  assert.equal(pathOf(n), 'lista[25000].det.b[2].c');
  assert.equal(n.st, 'chg');
  reveal(n);
  assert.ok(lista.open);
  const built = lista.kids.filter((k) => k.kids && k.kids.length).length;
  assert.ok(built < 5, `abriu ${built} itens da lista`);
  assert.equal(prevDiff(d.roots, n), null);
  assert.equal(nextDiff(d.roots, n, d.options), null);
  assert.equal(lista.st, 'mod');
  assert.match(diffMarkdown(d), /\| `lista\[25000\]\.det\.b\[2\]\.c` \| `"y"` \| `"x"` \|/);
});

test('só diferenças, markdown para o documento e estatísticas', () => {
  const d = createDiff(P(L), P(R), { size: 100 });
  const rows = flatten(d.roots, d.options, { onlyDiff: true });
  assert.ok(rows.some((r) => r.k === 'skip'));
  const md = diffMarkdown(d, { leftName: 'HML', rightName: 'PRD' });
  assert.match(md, /^\*\*JSON — 9 diferenças:\*\* 4 alterados · 3 novos \(só em PRD\) · 2 removidos \(só em HML\)\.\n\n\| Caminho \| HML \| PRD \|/);
  assert.match(md, /\| `cliente\.email` \| `"a@x\.com"` \| `"b@x\.com"` \|/);
  assert.match(diffMarkdown(createDiff(P(L), P(L), { size: 1 })), /são \*\*iguais\*\*/);
  assert.deepEqual(jsonStats(L), { objetos: 5, arrays: 2, chaves: 15, valores: 13, profundidade: 3, maiorArray: 3, caminhoMaiorArray: '$.itens' });
  void expand;
});
