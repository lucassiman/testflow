// 11.4 (1.50.0): buffer da extensão do navegador (limites, repetições, ordem das abas, quem fala como TestFlow) e manifesto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MAX_AGE_MS, MAX_EVENTS, MAX_TABS, addEvent, cleanEvent, focusTab, isAppOrigin, tabList } from '../../extensao/buffer.js';

const NOW = 1_800_000_000_000;

test('evento: só tipos conhecidos, texto cortado, horário absurdo vira "agora"', () => {
  assert.equal(cleanEvent({ tipo: 'xss', texto: 'a' }, NOW), null);
  assert.equal(cleanEvent(null, NOW), null);
  const e = cleanEvent({ tipo: 'erro', texto: 'x'.repeat(5000), t: NOW - 3_600_000 }, NOW);
  assert.equal(e.texto.length, 2000);
  assert.equal(e.t, NOW);
});

test('repetição seguida do mesmo erro vira contador; páginas nunca juntam', () => {
  const s = {};
  addEvent(s, 1, { tipo: 'erro', texto: 'boom', t: NOW }, NOW);
  addEvent(s, 1, { tipo: 'erro', texto: 'boom', t: NOW + 500 }, NOW + 500);
  addEvent(s, 1, { tipo: 'erro', texto: 'boom', t: NOW + 5000 }, NOW + 5000);
  addEvent(s, 1, { tipo: 'pagina', texto: 'https://a', t: NOW + 5001 }, NOW + 5001);
  addEvent(s, 1, { tipo: 'pagina', texto: 'https://a', t: NOW + 5002 }, NOW + 5002);
  assert.deepEqual(s['1'].eventos.map((e) => [e.tipo, e.n || 1]), [['erro', 2], ['erro', 1], ['pagina', 1], ['pagina', 1]]);
});

test('limites: quantidade, idade e número de abas', () => {
  const s = {};
  for (let i = 0; i < MAX_EVENTS + 50; i++) addEvent(s, 1, { tipo: 'aviso', texto: `a${i}`, t: NOW + i }, NOW + i);
  assert.equal(s['1'].eventos.length, MAX_EVENTS);
  assert.equal(s['1'].eventos[0].texto, 'a50');
  addEvent(s, 1, { tipo: 'aviso', texto: 'depois', t: NOW + MAX_AGE_MS + 1000 }, NOW + MAX_AGE_MS + 1000);
  assert.deepEqual(s['1'].eventos.map((e) => e.texto), ['depois']);
  for (let i = 0; i < MAX_TABS + 5; i++) focusTab(s, 100 + i, NOW + i);
  assert.equal(Object.keys(s).length, MAX_TABS);
  assert.ok(!s['100'] && s[String(100 + MAX_TABS + 4)]);
});

test('lista de abas: só http(s), sem as do TestFlow, a última em foco primeiro, com a contagem', () => {
  const s = {};
  addEvent(s, 1, { tipo: 'erro', texto: 'x', t: NOW }, NOW);
  addEvent(s, 1, { tipo: 'aviso', texto: 'y', t: NOW }, NOW);
  focusTab(s, 2, NOW + 10);
  focusTab(s, 1, NOW + 5);
  const open = [
    { id: 1, url: 'https://hml.loja.com/a', title: 'Loja' },
    { id: 2, url: 'https://outro.com', title: 'Outro' },
    { id: 3, url: 'chrome://extensions', title: 'Extensões' },
    { id: 4, url: 'http://localhost:4173/', title: 'TestFlow' },
  ];
  const list = tabList(s, open, new Set([4]), NOW + 20);
  assert.deepEqual(list.map((t) => [t.id, t.erros, t.avisos]), [[2, 0, 0], [1, 1, 1]]);
});

test('só páginas locais falam como TestFlow', () => {
  assert.equal(isAppOrigin('http://localhost:4173/'), true);
  assert.equal(isAppOrigin('http://127.0.0.1:5173/x'), true);
  assert.equal(isAppOrigin('file:///C:/dev/testflow/index.html'), true);
  assert.equal(isAppOrigin('https://localhost.evil.com/'), false);
  assert.equal(isAppOrigin('https://localhost/'), false);
  assert.equal(isAppOrigin('https://site.com/'), false);
  assert.equal(isAppOrigin(undefined), false);
});

test('manifesto: MV3, scripts e ícone existem, sem permissões além das necessárias', () => {
  const dir = new URL('../../extensao/', import.meta.url);
  const m = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  for (const f of [m.background.service_worker, m.action.default_popup, m.icons['128'], ...m.content_scripts.flatMap((c) => c.js)]) assert.ok(existsSync(new URL(f, dir)), f);
  assert.deepEqual(m.permissions, ['storage']);
  assert.equal(m.content_scripts.find((c) => c.js.includes('captura.js')).world, 'MAIN');
});
