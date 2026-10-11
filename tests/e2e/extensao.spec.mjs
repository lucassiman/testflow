// 11.4 (1.50.0 e 1.51.0): captura de bug pela extensão do navegador — com uma ponte falsa no lugar da extensão
// (o teste com a extensão de verdade fica em extensaoReal.spec.mjs, ligado por PW_EXTENSAO=1).
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

/** Faz o papel do script da extensão nesta página: responde aos pedidos do app. */
const fakeBridge = () => {
  window.__extPedidos = [];
  const at = (m, s) => new Date(2026, 9, 11, 14, m, s).getTime();
  const abas = [
    { id: 11, titulo: 'Loja · Checkout', url: 'https://hml.loja.com/checkout', erros: 2, avisos: 1, falhas: 1, foco: 2000 },
    { id: 12, titulo: 'Admin', url: 'https://admin.loja.com/', erros: 0, avisos: 0, foco: 1000 },
  ];
  const captura = (id) => ({
    versao: '1.50.0',
    aba: { id, titulo: abas.find((a) => a.id === id).titulo, url: abas.find((a) => a.id === id).url },
    contexto: {
      url: id === 11 ? 'https://hml.loja.com/checkout?senha=Segredo123' : 'https://admin.loja.com/',
      titulo: abas.find((a) => a.id === id).titulo,
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      uaData: { brands: [{ brand: 'Google Chrome', version: '141' }], platform: 'Windows', platformVersion: '15.0.0', mobile: false },
      tela: { largura: 1920, altura: 1080, escala: 1 }, janela: { largura: 1280, altura: 720 },
      fuso: 'America/Sao_Paulo', quando: new Date(2026, 9, 11, 14, 32, 5).toISOString(),
    },
    eventos: id === 11
      ? [
        { t: at(31, 0), tipo: 'pagina', texto: 'https://hml.loja.com/checkout' },
        { t: at(31, 10), tipo: 'erro', texto: 'TypeError: pedido is undefined', pilha: 'TypeError: pedido is undefined\n    at pagar (app.js:10:5)', n: 2 },
        { t: at(31, 12), tipo: 'aviso', texto: 'API antiga' },
      ]
      : [],
    rede: id === 11
      ? [{ t: at(31, 9), metodo: 'POST', url: 'https://hml.loja.com/api/pedidos', status: 500, statusTexto: 'Internal Server Error', duracao: 320, recurso: 'fetch', reqHeaders: [['Content-Type', 'application/json'], ['Authorization', '••••']], reqBody: '{"cartao":"4111 1111 1111 1111","senha":"Segredo123"}', resHeaders: [['content-type', 'application/json']], mime: 'application/json', resBody: '{"erro":"estoque"}' }]
      : [],
  });
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.testflow !== 'ext' || d.dir !== 'pedido') return;
    window.__extPedidos.push(d.tipo);
    if (window.__extAusente) return;
    const dados = d.tipo === 'ola' ? { versao: '1.50.0', protocolo: 1, pausado: false } : d.tipo === 'abas' ? { abas, pausado: false } : captura(d.abaId);
    setTimeout(() => window.postMessage({ testflow: 'ext', dir: 'resposta', id: d.id, ok: true, dados }, location.origin), 20);
  });
};

const CASE = '---\ntipo: caso-de-teste\nid: TC-7\ntitulo: Pagamento\napp: Loja\nambiente: HML\n---\n\n# TC-7 — Pagamento\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Pagar com cartão | Pedido confirmado | Tela travou | `FAIL` |\n\n## Evidências\n\n## Observações\n';

/** @param {import('@playwright/test').Page} page @param {string} ws @param {Record<string, unknown>} [prefs] */
async function setup(page, ws, prefs = {}) {
  await page.addInitScript(fakeBridge);
  await page.addInitScript(wsInit, ws);
  await openEditor(page, { mode: 'split', prefs });
  await page.evaluate((t) => window.__write('aplicacoes/Loja/casos/TC-7.md', t), CASE);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-7' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-7');
}

/** @param {import('@playwright/test').Page} page @param {string} text */
async function palette(page, text) {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

const readBug = async (page) => {
  const name = (await page.evaluate(() => window.__ls('aplicacoes/Loja/bugs'))).find((n) => n.startsWith('BUG-001'));
  return page.evaluate((p) => window.__read(p), `aplicacoes/Loja/bugs/${name}`);
};

test('desligada (padrão): o diálogo do bug é o de sempre e nenhum pedido vai para a extensão', async ({ page }) => {
  await setup(page, 'ws-ext-off');
  await palette(page, 'Novo bug a partir deste documento');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Novo bug BUG-001');
  await expect(dlg.locator('select')).toHaveCount(0);
  await dlg.locator('button', { hasText: 'Criar e abrir' }).click();
  await expect(page.locator('#fileName')).toContainText('BUG-001');
  const bug = await readBug(page);
  expect(bug).not.toContain('Console e rede');
  expect(bug).toMatch(/^browser:\s*$/m);
  expect(await page.evaluate(() => window.__extPedidos)).toEqual([]);
});

test('ligada: o bug leva navegador, sistema, tela, URL e o console da aba escolhida (log em evidencias/, dado sensível mascarado)', async ({ page }) => {
  await setup(page, 'ws-ext-on');
  await palette(page, 'Captura de bug pela extensão');
  await expect(page.locator('#toast')).toContainText('Captura de bug pela extensão ligada (extensão 1.50.0)');
  await palette(page, 'Novo bug a partir deste documento');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Console e contexto da aba testada (extensão)');
  await expect(dlg.locator('select')).toHaveValue('11');
  await expect(dlg.locator('select option').first()).toHaveText('Loja · Checkout — hml.loja.com · 2 erros, 1 aviso, 1 falha de rede');
  await dlg.locator('button', { hasText: 'Criar e abrir' }).click();
  await expect(page.locator('#fileName')).toContainText('BUG-001');
  const bug = await readBug(page);
  expect(bug).toMatch(/^browser: Chrome 141$/m);
  expect(bug).toMatch(/^dispositivo: WEB$/m);
  expect(bug).toContain('| Browser / dispositivo | Chrome 141 / WEB |');
  expect(bug).toContain('| Sistema | Windows 11 |');
  expect(bug).toContain('| Tela | 1920×1080 (janela 1280×720) |');
  expect(bug).toMatch(/\| URL \| https:\/\/hml\.loja\.com\/checkout\?senha=[^|]*\|/);
  expect(bug).not.toContain('Segredo123');
  expect(bug).toMatch(/### Console e rede\n\nCapturado pela extensão do TestFlow em 11\/10\/2026 14:32 — \*Loja · Checkout\*/);
  expect(bug).toContain('> - `TypeError: pedido is undefined` (2×)');
  expect(bug).toMatch(/\[📎 Console completo \(3 eventos\)\]\(evidencias\/[^)]+_TC-7-console\.log\)/);
  const ev = await page.evaluate(() => window.__ls('aplicacoes/Loja/bugs/evidencias'));
  const logName = ev.find((n) => n.endsWith('-console.log'));
  const log = await page.evaluate((p) => window.__read(p), `aplicacoes/Loja/bugs/evidencias/${logName}`);
  expect(log).toContain('TestFlow — console da aba "Loja · Checkout"');
  expect(log).toContain('    at pagar (app.js:10:5)');
  expect(log).not.toContain('Segredo123');
  expect(log).toMatch(/\[14:31:09\.000\] REDE {5}POST https:\/\/hml\.loja\.com\/api\/pedidos → 500 Internal Server Error · 320 ms/);
  // rede: resumo e HAR (sem senha nem cartão)
  expect(bug).toContain('> **Rede:** 1 requisição com falha');
  expect(bug).toContain('> - `POST https://hml.loja.com/api/pedidos` → 500 Internal Server Error · 320 ms');
  expect(bug).toMatch(/ · \[📎 Requisições com falha \(1, HAR\)\]\(evidencias\/[^)]+_TC-7-rede\.har\)/);
  const harName = ev.find((n) => n.endsWith('-rede.har'));
  const har = JSON.parse(await page.evaluate((p) => window.__read(p), `aplicacoes/Loja/bugs/evidencias/${harName}`));
  expect(har.log.entries).toHaveLength(1);
  expect(har.log.entries[0].response.status).toBe(500);
  expect(har.log.entries[0].response.content.text).toBe('{"erro":"estoque"}');
  expect(JSON.stringify(har)).not.toMatch(/Segredo123|4111 1111 1111 1111/);
  // o Preview mostra o callout e o link
  await expect(page.locator('#preview')).toContainText('Console completo (3 eventos)');
});

test('ligada: escolher outra aba, ou "Não anexar"; e a reincidência leva página e console', async ({ page }) => {
  await setup(page, 'ws-ext-choose', { bugCapture: true });
  await palette(page, 'Novo bug a partir deste documento');
  const dlg = page.locator('.app-dialog');
  await dlg.locator('select').selectOption('');
  await dlg.locator('button', { hasText: 'Criar e abrir' }).click();
  await expect(page.locator('#fileName')).toContainText('BUG-001');
  expect(await readBug(page)).not.toContain('Console e rede');

  await page.keyboard.press('Alt+PageUp');
  await expect(page.locator('#fileName')).toContainText('TC-7');
  await palette(page, 'Novo bug a partir deste documento');
  await expect(dlg).toContainText('já tem bug ligado');
  await expect(dlg.locator('input[data-check="console"]')).toBeChecked();
  await dlg.locator('button', { hasText: 'Registrar no bug escolhido' }).click();
  await expect(page.locator('#toast')).toContainText('Reincidência registrada em BUG-001');
  const bug = await readBug(page);
  expect(bug).toMatch(/## Reincidências[\s\S]*- Página: `https:\/\/hml\.loja\.com\/checkout\?senha=[^`]*` · Chrome 141 · Windows 11\n- Console: 2 erros · 1 aviso — `TypeError: pedido is undefined` \(\[📎 log\]\(evidencias\/[^)]+-console\.log\)\)/);
  expect(bug).not.toContain('Segredo123');
});

test('ligada, mas sem a extensão: o bug sai como sempre e avisa uma vez', async ({ page }) => {
  await page.addInitScript(() => { window.__extAusente = true; });
  await setup(page, 'ws-ext-missing', { bugCapture: true });
  await palette(page, 'Novo bug a partir deste documento');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Novo bug BUG-001');
  await expect(dlg.locator('select')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('a extensão não respondeu');
  await dlg.locator('button', { hasText: 'Criar e abrir' }).click();
  await expect(page.locator('#fileName')).toContainText('BUG-001');
  expect(await readBug(page)).not.toContain('Console e rede');
});

test('anexar aqui (num caso): o resumo entra onde está o cursor e o log vai para evidencias/', async ({ page }) => {
  await setup(page, 'ws-ext-attach', { bugCapture: true });
  await page.locator('#previewPane .md-block', { hasText: 'Observações' }).click();
  await page.keyboard.press('Escape');
  await palette(page, 'Console e contexto da aba testada');
  const dlg = page.locator('.app-dialog');
  await dlg.locator('select').selectOption('12');
  await dlg.locator('button', { hasText: 'Anexar' }).click();
  await expect.poll(() => raw(page)).toContain('Capturado pela extensão do TestFlow em 11/10/2026 14:32 — *Admin*');
  expect(await raw(page)).toContain('> **Console:** nenhum erro');
  expect(await raw(page)).toMatch(/\[📎 Console completo \(0 eventos\)\]\(evidencias\/[^)]+_TC-7-console\.log\)/);
  expect((await page.evaluate(() => window.__ls('aplicacoes/Loja/casos/evidencias'))).some((n) => n.endsWith('-console.log'))).toBe(true);
});
