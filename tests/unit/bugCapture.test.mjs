// 11.4 (1.50.0 e 1.51.0): captura pela extensão — contexto da aba, console e rede (HAR) viram texto do bug (mascarado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCaptureToBug, browserLabel, buildHar, harText, netResult, captureSummary, consoleLog, countLabel, deviceLabel, distinctErrors, recurrenceNotes, screenLabel, setCaptureSection, systemLabel, tabLabel } from '../../src/markdown/bugCapture.ts';
import { addRecurrence } from '../../src/markdown/linkedDoc.ts';
import { prepareForJira } from '../../src/markdown/jira.ts';

const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const at = (h, m, s, ms = 0) => new Date(2026, 9, 11, h, m, s, ms).getTime();

/** @returns {import('../../src/markdown/bugCapture.ts').Capture} */
const capture = (eventos) => ({
  versao: '1.50.0',
  aba: { id: 7, titulo: 'Loja · Checkout', url: 'https://hml.loja.com/checkout' },
  contexto: {
    url: 'https://hml.loja.com/checkout?token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc123def456',
    titulo: 'Loja · Checkout',
    ua: WIN_UA,
    uaData: { brands: [{ brand: 'Google Chrome', version: '141' }], fullVersionList: [{ brand: 'Not A Brand', version: '99.0.0.0' }, { brand: 'Google Chrome', version: '141.0.7390.55' }], platform: 'Windows', platformVersion: '15.0.0', mobile: false },
    idioma: 'pt-BR', fuso: 'America/Sao_Paulo',
    tela: { largura: 1920, altura: 1080, escala: 1.25 },
    janela: { largura: 1280, altura: 720 },
    quando: new Date(2026, 9, 11, 14, 32, 5).toISOString(),
  },
  eventos,
});

const EVENTS = [
  { t: at(14, 30, 1, 120), tipo: 'pagina', texto: 'https://hml.loja.com/carrinho' },
  { t: at(14, 31, 10, 2), tipo: 'erro', texto: "TypeError: Cannot read properties of undefined (reading 'id')", pilha: "TypeError: Cannot read properties of undefined (reading 'id')\n    at pagar (app.js:10:5)", n: 3 },
  { t: at(14, 31, 12, 400), tipo: 'aviso', texto: 'Deprecated API' },
  { t: at(14, 31, 13, 0), tipo: 'promessa', texto: 'Promise rejeitada sem tratamento: Error: 500 para joao.silva@empresa.com' },
  { t: at(14, 31, 14, 0), tipo: 'erro', texto: "TypeError: Cannot read properties of undefined (reading 'id')" },
];

test('navegador, sistema, dispositivo e tela pelo UA-CH (e pelo user agent sem ele)', () => {
  const c = capture([]).contexto;
  assert.equal(browserLabel(c), 'Chrome 141');
  assert.equal(systemLabel(c), 'Windows 11');
  assert.equal(deviceLabel(c), 'WEB');
  assert.equal(screenLabel(c), '1920×1080 (janela 1280×720, escala 1.25)');
  assert.equal(browserLabel({ ua: '', uaData: { brands: [{ brand: 'Microsoft Edge', version: '140' }, { brand: 'Chromium', version: '140' }] } }), 'Edge 140');
  assert.equal(systemLabel({ ua: '', uaData: { platform: 'Windows', platformVersion: '10.0.0' } }), 'Windows 10');
  assert.equal(systemLabel({ ua: '', uaData: { platform: 'macOS', platformVersion: '15.1.0' } }), 'macOS 15.1');
  assert.equal(systemLabel({ ua: '', uaData: { platform: 'macOS', platformVersion: '14.0.0' } }), 'macOS 14');
  assert.equal(browserLabel({ ua: WIN_UA }), 'Chrome 141');
  assert.equal(systemLabel({ ua: WIN_UA }), 'Windows');
  assert.equal(browserLabel({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15' }), 'Safari 17');
  assert.equal(deviceLabel({ ua: '', uaData: { platform: 'Android', platformVersion: '14.0.0', mobile: true } }), 'Mobile Android — Android 14');
});

test('contagem e erros distintos (repetições somadas)', () => {
  assert.deepEqual(countLabel(EVENTS), { erros: 5, avisos: 1, text: '5 erros · 1 aviso' });
  assert.equal(countLabel([]).text, 'nenhum erro');
  assert.deepEqual(distinctErrors(EVENTS).map((d) => d.n), [4, 1]);
});

test('log: cabeçalho, horário de cada evento, repetições, pilha — e dados sensíveis mascarados', () => {
  const log = consoleLog(capture(EVENTS));
  assert.match(log, /^TestFlow — console da aba "Loja · Checkout"\n/);
  assert.match(log, /Navegador: Chrome 141 · Windows 11 · tela 1920×1080/);
  assert.match(log, /Capturado em: 11\/10\/2026 14:32 \(America\/Sao_Paulo\) pela extensão 1\.50\.0/);
  assert.match(log, /\[14:30:01\.120\] PÁGINA {3}https:\/\/hml\.loja\.com\/carrinho/);
  assert.match(log, /\[14:31:10\.002\] ERRO {5}TypeError: .*\(3×\)\n {4}at pagar \(app\.js:10:5\)/);
  assert.doesNotMatch(log, /eyJhbGciOiJIUzI1NiJ9\.eyJzdWIiOiIxMjM0In0/);
  assert.doesNotMatch(log, /joao\.silva@empresa\.com/);
});

test('resumo: de onde veio, erros principais em callout, link do log; sem erros vira NOTE', () => {
  const md = captureSummary(capture(EVENTS), 'evidencias/x-console.log').join('\n');
  assert.match(md, /^Capturado pela extensão do TestFlow em 11\/10\/2026 14:32 — \*Loja · Checkout\* \(`https:\/\/hml\.loja\.com\/checkout\?token=/);
  assert.match(md, /> \[!CAUTION\]\n> \*\*Console:\*\* 5 erros · 1 aviso\n> - `TypeError: Cannot read properties of undefined \(reading 'id'\)` \(4×\)/);
  assert.match(md, /\[📎 Console completo \(5 eventos\)\]\(evidencias\/x-console\.log\)/);
  assert.doesNotMatch(md, /eyJzdWIiOiIxMjM0In0/);
  const none = captureSummary(capture([{ t: at(14, 0, 0), tipo: 'pagina', texto: 'https://x' }])).join('\n');
  assert.match(none, /> \[!NOTE\]\n> \*\*Console:\*\* nenhum erro/);
  assert.doesNotMatch(none, /Console completo/);
});

const BUG = `---
tipo: bug
id: BUG-005
titulo: Pagamento trava
status: FAIL
ambiente: HML
browser:
dispositivo:
tags: [checkout]
---

# BUG-005 — Pagamento trava

## Resumo

Trava.

## Ambiente

| Item | Valor |
| --- | --- |
| Ambiente | HML |
| Browser / dispositivo | |
| Versão | |
| Usuário / perfil | |

## Passos para reproduzir

1. Pagar

## Evidências

![p](evidencias/p.png)

## Impacto
`;

test('bug: browser/dispositivo no cabeçalho, linhas do Ambiente, "### Console e rede" no fim das Evidências', () => {
  const out = applyCaptureToBug(BUG, capture(EVENTS), 'evidencias/log.log');
  assert.match(out, /^browser: Chrome 141$/m);
  assert.match(out, /^dispositivo: WEB$/m);
  assert.match(out, /^tags: \[checkout, web\]$/m);
  assert.match(out, /\| Browser \/ dispositivo \| Chrome 141 \/ WEB \|/);
  assert.match(out, /\| Usuário \/ perfil \| \|\n\| URL \| https:\/\/hml\.loja\.com\/checkout\?token=[^|]*\|\n\| Sistema \| Windows 11 \|\n\| Tela \| 1920×1080 \(janela 1280×720, escala 1\.25\) \|\n\n## Passos/);
  assert.match(out, /!\[p\]\(evidencias\/p\.png\)\n\n### Console e rede\n\nCapturado pela extensão[\s\S]*Console completo[^\n]*\n\n## Impacto/);
  // de novo (anexar outra vez): troca a seção, não duplica; o que já estava preenchido fica
  const again = applyCaptureToBug(out.replace('Chrome 141 / WEB', 'Firefox / WEB'), capture([]), '');
  assert.equal((again.match(/### Console e rede/g) || []).length, 1);
  assert.match(again, /\| Browser \/ dispositivo \| Firefox \/ WEB \|/);
  assert.equal((again.match(/\| Sistema \|/g) || []).length, 1);
  assert.match(again, /> \*\*Console:\*\* nenhum erro/);
});

test('sem seção Evidências: cria no fim', () => {
  const out = setCaptureSection('# X\n\nTexto.\n', ['corpo']);
  assert.equal(out, '# X\n\nTexto.\n\n## Evidências\n\n### Console e rede\n\ncorpo\n');
});

test('reincidência: linhas de página e console', () => {
  const notes = recurrenceNotes(capture(EVENTS), 'evidencias/l.log');
  assert.match(notes[0], /^- Página: `https:\/\/hml\.loja\.com\/checkout\?token=[^`]*` · Chrome 141 · Windows 11$/);
  assert.match(notes[1], /^- Console: 5 erros · 1 aviso — `TypeError: [^`]+` \(\[📎 log\]\(evidencias\/l\.log\)\)$/);
  const rec = addRecurrence('---\ntipo: bug\nid: BUG-1\nstatus: FAIL\n---\n\n# BUG-1\n', { when: new Date(2026, 9, 11, 10, 5), sourceTarget: 'TC-1', notes });
  assert.match(rec.text, /### 11\/10\/2026 10:05 — \[\[TC-1\]\]\n\n- Página: [^\n]+\n- Console: /);
});

test('rótulo da aba no seletor', () => {
  assert.equal(tabLabel({ id: 1, titulo: 'Loja · Checkout', url: 'https://hml.loja.com/x', erros: 2, avisos: 1, foco: 0 }), 'Loja · Checkout — hml.loja.com · 2 erros, 1 aviso');
  assert.equal(tabLabel({ id: 1, titulo: '', url: 'https://hml.loja.com/x', erros: 0, avisos: 0, foco: 0 }), 'hml.loja.com');
});

// ---------------------------------------------------------------- 1.51.0: rede (HAR)

const REDE = [
  {
    t: at(14, 31, 9, 500), metodo: 'POST', url: 'https://hml.loja.com/api/pedidos?cupom=X&token=abcdef1234567890', status: 500, statusTexto: 'Internal Server Error', duracao: 320, recurso: 'fetch',
    reqHeaders: [['Content-Type', 'application/json'], ['Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlMTIz']],
    reqBody: '{"usuario":"joao@empresa.com","password":"Segredo123"}',
    resHeaders: [['content-type', 'application/json'], ['set-cookie', 'sid=abc']], mime: 'application/json', resBody: '{"erro":"estoque indisponível"}',
  },
  { t: at(14, 31, 20, 0), metodo: 'GET', url: 'https://cdn.loja.com/app.js', status: 0, erro: 'TypeError: Failed to fetch — net::ERR_NAME_NOT_RESOLVED', recurso: 'script' },
  { t: at(14, 31, 21, 0), metodo: 'POST', url: 'https://hml.loja.com/api/pedidos?cupom=X&token=abcdef1234567890', status: 500, statusTexto: 'Internal Server Error', duracao: 280, recurso: 'fetch' },
];

test('HAR 1.2: só as falhas, sem cookie/autorização, corpo e URL mascarados, erro de rede em _error', () => {
  const har = /** @type {any} */ (buildHar({ ...capture(EVENTS), rede: REDE }));
  assert.equal(har.log.version, '1.2');
  assert.equal(har.log.browser.name, 'Chrome');
  assert.equal(har.log.entries.length, 3);
  const [e1, e2] = har.log.entries;
  assert.equal(e1.request.method, 'POST');
  assert.equal(e1.startedDateTime, new Date(REDE[0].t).toISOString());
  assert.equal(e1.time, 320);
  assert.deepEqual(e1.request.headers, [{ name: 'Content-Type', value: 'application/json' }, { name: 'Authorization', value: '••••' }]);
  assert.deepEqual(e1.response.headers.map((h) => h.value), ['application/json', '••••']);
  assert.equal(e1.request.postData.mimeType, 'application/json');
  assert.doesNotMatch(e1.request.postData.text, /Segredo123|joao@empresa\.com/);
  assert.equal(e1.response.status, 500);
  assert.equal(e1.response.content.text, '{"erro":"estoque indisponível"}');
  assert.doesNotMatch(e1.request.url, /abcdef1234567890/);
  assert.deepEqual(e1.request.queryString.map((q) => q.name), ['cupom', 'token']);
  assert.doesNotMatch(e1.request.queryString[1].value, /abcdef1234567890/);
  assert.equal(e2.response.status, 0);
  assert.equal(e2.response._error, 'TypeError: Failed to fetch — net::ERR_NAME_NOT_RESOLVED');
  assert.equal(e2._resourceType, 'script');
  const text = harText({ ...capture(EVENTS), rede: REDE });
  assert.doesNotMatch(text, /eyJzdWIiOiIxIn0|sid=abc|Segredo123/);
  assert.doesNotThrow(() => JSON.parse(text));
});

test('resumo com rede: falha de rede sozinha já é CAUTION; repetições juntas; links do log e do HAR', () => {
  const md = captureSummary({ ...capture([]), rede: REDE }, { log: 'evidencias/c.log', har: 'evidencias/r.har' }).join('\n');
  assert.match(md, /> \[!CAUTION\]\n> \*\*Console:\*\* nenhum erro nos últimos minutos desta aba\.\n>\n> \*\*Rede:\*\* 3 requisições com falha\n> - `POST https:\/\/hml\.loja\.com\/api\/pedidos\?cupom=X&token=[^`]*` → 500 Internal Server Error · 320 ms \(2×\)\n> - `GET https:\/\/cdn\.loja\.com\/app\.js` → falhou: TypeError: Failed to fetch — net::ERR_NAME_NOT_RESOLVED/);
  assert.match(md, /\n\n\[📎 Console completo \(0 eventos\)\]\(evidencias\/c\.log\) · \[📎 Requisições com falha \(3, HAR\)\]\(evidencias\/r\.har\)$/);
  assert.doesNotMatch(md, /abcdef1234567890/);
  // extensão antiga (sem rede): não fala de rede
  assert.doesNotMatch(captureSummary(capture(EVENTS)).join('\n'), /Rede/);
  // com rede vazia: diz que não houve falha
  assert.match(captureSummary({ ...capture([]), rede: [] }).join('\n'), /> \[!NOTE\][\s\S]*> \*\*Rede:\*\* nenhuma requisição com falha\./);
  assert.equal(netResult({ t: 0, metodo: 'GET', url: 'x', status: 404 }), '404');
});

test('log: a rede entra na linha do tempo, na ordem dos horários', () => {
  const log = consoleLog({ ...capture(EVENTS), rede: REDE });
  assert.match(log, /Eventos: 5 \(5 erros · 1 aviso\) · 3 requisições com falha \(detalhes no \.har\)/);
  assert.match(log, /\[14:31:09\.500\] REDE {5}POST https:\/\/hml\.loja\.com\/api\/pedidos\?cupom=X&token=\S+ → 500 Internal Server Error · 320 ms\n\[14:31:10\.002\] ERRO/);
  assert.doesNotMatch(log, /abcdef1234567890/);
});

test('reincidência e seletor de abas com a rede', () => {
  const notes = recurrenceNotes({ ...capture(EVENTS), rede: REDE }, { log: 'evidencias/l.log', har: 'evidencias/r.har' });
  assert.equal(notes.length, 3);
  assert.match(notes[2], /^- Rede: 3 requisições com falha — `POST https:\/\/hml\.loja\.com\/api\/pedidos[^`]*` → 500 Internal Server Error · 320 ms \(\[📎 HAR\]\(evidencias\/r\.har\)\)$/);
  assert.equal(tabLabel({ id: 1, titulo: 'Loja', url: 'https://hml.loja.com/x', erros: 1, avisos: 0, falhas: 2, foco: 0 }), 'Loja — hml.loja.com · 1 erro, 2 falhas de rede');
});

test('bug com a captura: o Copiar para o Jira lista o .log e o .har como anexos', () => {
  const out = applyCaptureToBug(BUG, { ...capture(EVENTS), rede: REDE }, { log: 'evidencias/x-console.log', har: 'evidencias/x-rede.har' });
  const { attachments } = prepareForJira(out);
  assert.deepEqual(attachments.filter((a) => /\.(log|har)$/.test(a)), ['evidencias/x-console.log', 'evidencias/x-rede.har']);
});
