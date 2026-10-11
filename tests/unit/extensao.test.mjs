// 11.4 (1.50.0 e 1.51.0): buffer da extensão do navegador (limites, repetições, ordem das abas, quem fala como TestFlow) e manifesto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { HIDDEN, MAX_AGE_MS, MAX_EVENTS, MAX_REQUESTS, MAX_TABS, addEvent, addRequest, cleanEvent, cleanRequest, focusTab, isAppOrigin, shrink, tabList } from '../../extensao/buffer.js';

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
  for (const f of [m.background.service_worker, m.action.default_popup, m.options_ui.page, 'jira.js', 'opcoes.js', m.icons['128'], ...m.content_scripts.flatMap((c) => c.js)]) assert.ok(existsSync(new URL(f, dir)), f);
  assert.deepEqual(m.permissions, ['storage', 'webRequest']);
  assert.equal(m.content_scripts.find((c) => c.js.includes('captura.js')).world, 'MAIN');
});

test('rede: só falhas; cookies, authorization e tokens nunca são guardados (só o nome do cabeçalho)', () => {
  assert.equal(cleanRequest({ url: 'https://a/x', status: 200 }, NOW), null);
  assert.equal(cleanRequest({ url: 'https://a/x', status: 0 }, NOW), null); // 0 sem erro (ex.: no-cors) não é falha
  assert.equal(cleanRequest({ url: 'chrome://x', status: 500 }, NOW), null);
  const r = cleanRequest({
    url: 'https://api.loja.com/pedidos', metodo: 'post', status: 500, statusTexto: 'Internal Server Error', duracao: 320.6,
    reqHeaders: [['Content-Type', 'application/json'], ['Authorization', 'Bearer abc.def.ghi'], ['X-Api-Key', 'k123'], ['x-csrf-token', 't'], ['Cookie', 'sid=1']],
    resHeaders: [['set-cookie', 'sid=2'], ['content-type', 'application/json']],
    reqBody: 'x'.repeat(20_000), resBody: '{"erro":"falhou"}',
  }, NOW);
  assert.equal(r.metodo, 'POST');
  assert.equal(r.duracao, 321);
  assert.deepEqual(r.reqHeaders, [['Content-Type', 'application/json'], ['Authorization', HIDDEN], ['X-Api-Key', HIDDEN], ['x-csrf-token', HIDDEN], ['Cookie', HIDDEN]]);
  assert.deepEqual(r.resHeaders, [['set-cookie', HIDDEN], ['content-type', 'application/json']]);
  assert.equal(r.reqBody.length, 8 * 1024);
  assert.equal(r.fonte, 'pagina');
});

test('rede: a falha vista pela página e o erro do navegador da mesma requisição viram uma só', () => {
  const s = {};
  addEvent(s, 1, { tipo: 'rede', t: NOW, metodo: 'GET', url: 'https://api.x/y', status: 0, erro: 'TypeError: Failed to fetch', reqHeaders: [['Accept', '*/*']], fonte: 'pagina' }, NOW);
  addRequest(s, 1, { t: NOW + 40, metodo: 'GET', url: 'https://api.x/y', status: 0, erro: 'net::ERR_NAME_NOT_RESOLVED', recurso: 'xmlhttprequest', fonte: 'navegador' }, NOW + 40);
  assert.equal(s['1'].rede.length, 1);
  assert.equal(s['1'].rede[0].erro, 'TypeError: Failed to fetch — net::ERR_NAME_NOT_RESOLVED');
  assert.deepEqual(s['1'].rede[0].reqHeaders, [['Accept', '*/*']]);
  // na ordem inversa também
  addRequest(s, 1, { t: NOW + 100, metodo: 'GET', url: 'https://cdn.x/a.js', status: 0, erro: 'net::ERR_CONNECTION_REFUSED', fonte: 'navegador' }, NOW + 100);
  addEvent(s, 1, { tipo: 'rede', t: NOW + 120, metodo: 'GET', url: 'https://cdn.x/a.js', status: 0, erro: 'TypeError: Failed to fetch', fonte: 'pagina' }, NOW + 120);
  assert.equal(s['1'].rede.length, 2);
  assert.equal(s['1'].rede[1].erro, 'TypeError: Failed to fetch — net::ERR_CONNECTION_REFUSED');
  // a rede não entra na contagem do console, mas aparece na lista de abas
  assert.equal(s['1'].eventos.length, 0);
  assert.equal(tabList(s, [{ id: 1, url: 'https://loja', title: 'Loja' }], new Set(), NOW + 200)[0].falhas, 2);
});

test('rede: limite por aba e estado grande demais perde primeiro os corpos mais antigos', () => {
  const s = {};
  for (let i = 0; i < MAX_REQUESTS + 10; i++) addRequest(s, 1, { t: NOW + i, url: `https://a/${i}`, status: 500, resBody: 'r'.repeat(16_000) }, NOW + i);
  assert.equal(s['1'].rede.length, MAX_REQUESTS);
  assert.equal(s['1'].rede[0].url, 'https://a/10');
  shrink(s, 200_000);
  assert.ok(JSON.stringify(s).length <= 200_000);
  assert.equal(s['1'].rede.at(-1).resBody.length, 16_000); // as mais recentes ficam com o corpo
  assert.equal(s['1'].rede[0].resBody, undefined);
});
