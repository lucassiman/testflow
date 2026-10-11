// 11.4 (1.50.0): a extensão de verdade (pasta extensao/) carregada num Chromium completo: captura o console de uma
// página "testada" e o TestFlow cria o bug com ele. Fica fora da suíte normal (abre um navegador próprio):
//   PW_EXTENSAO=1 npx playwright test extensaoReal
// Sem o Chromium do Playwright instalado, aponte um completo (não o headless shell) em PW_CHROMIUM_FULL.
import { test, expect, chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { openEditor, wsInit } from './helpers.mjs';

test.skip(!process.env.PW_EXTENSAO, 'extensão de verdade: rode com PW_EXTENSAO=1');

const LOJA = `<!doctype html><title>Loja · Checkout</title>
<h1>Checkout</h1>
<img src="http://loja.test/falta.png" alt="">
<script>
  console.error('Falha no checkout', { pedido: 42, token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiJ9.c2VncmVkbw' });
  console.warn('API antiga');
  Promise.reject(new Error('pagamento recusado'));
  setTimeout(() => { history.pushState({}, '', '/checkout/confirmar'); throw new Error('quebrou ao confirmar'); }, 50);
</script>`;

test('extensão de verdade: guarda o console da aba testada e o bug criado no TestFlow leva tudo', async ({ baseURL }) => {
  const ext = fileURLToPath(new URL('../../extensao', import.meta.url));
  const ctx = await chromium.launchPersistentContext('', {
    baseURL,
    headless: true,
    executablePath: process.env.PW_CHROMIUM_FULL || undefined,
    viewport: { width: 1300, height: 900 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  try {
    await ctx.route('http://loja.test/**', (route) => (route.request().url().endsWith('.png')
      ? route.fulfill({ status: 404, body: '' })
      : route.fulfill({ contentType: 'text/html; charset=utf-8', body: LOJA })));
    // o service worker da extensão subiu
    if (!ctx.serviceWorkers().length) await ctx.waitForEvent('serviceworker');

    const loja = await ctx.newPage();
    await loja.goto('http://loja.test/checkout');
    await loja.waitForTimeout(800); // o lote de eventos vai a cada 250 ms

    const page = await ctx.newPage();
    await page.addInitScript(wsInit, 'ws-ext-real');
    await openEditor(page, { mode: 'split', prefs: { bugCapture: true } });
    await page.evaluate(() => window.__write('aplicacoes/Loja/casos/TC-7.md', '---\ntipo: caso-de-teste\nid: TC-7\ntitulo: Pagamento\napp: Loja\n---\n\n# TC-7 — Pagamento\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Pagar | Pedido confirmado | Quebrou | `FAIL` |\n\n## Evidências\n'));
    await page.click('#sidebarBtn');
    await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
    await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-7' }).click();
    await expect(page.locator('#fileName')).toContainText('TC-7');

    // a ponte responde (a extensão viu esta página como TestFlow)
    await page.keyboard.press('Control+Shift+P');
    await page.keyboard.type('Novo bug a partir deste documento');
    await page.keyboard.press('Enter');
    const dlg = page.locator('.app-dialog');
    await expect(dlg).toContainText('Console e contexto da aba testada (extensão)');
    const options = await dlg.locator('select option').allTextContents();
    expect(options[0]).toMatch(/^Loja · Checkout — loja\.test · \d+ erros?/);
    expect(options.join('|')).not.toMatch(/TestFlow|localhost/);
    await dlg.locator('button', { hasText: 'Criar e abrir' }).click();
    await expect(page.locator('#fileName')).toContainText('BUG-001');

    const bug = await page.evaluate(async () => {
      const name = (await window.__ls('aplicacoes/Loja/bugs')).find((n) => n.startsWith('BUG-001'));
      return window.__read(`aplicacoes/Loja/bugs/${name}`);
    });
    if (process.env.PW_DUMP) console.log(bug);
    expect(bug).toMatch(/^browser: (Chrome|Chromium) \d+$/m);
    expect(bug).toContain('| URL | http://loja.test/checkout/confirmar |');
    expect(bug).toContain('### Console e rede');
    expect(bug).toContain('Falha no checkout');
    expect(bug).toContain('Promise rejeitada sem tratamento: Error: pagamento recusado');
    expect(bug).toContain('quebrou ao confirmar');
    expect(bug).toContain('Não carregou: <img> http://loja.test/falta.png');
    expect(bug).not.toContain('c2VncmVkbw'); // token mascarado
    const log = await page.evaluate(async () => {
      const name = (await window.__ls('aplicacoes/Loja/bugs/evidencias')).find((n) => n.endsWith('-console.log'));
      return window.__read(`aplicacoes/Loja/bugs/evidencias/${name}`);
    });
    expect(log).toMatch(/PÁGINA {3}http:\/\/loja\.test\/checkout\n/);
    expect(log).toMatch(/PÁGINA {3}http:\/\/loja\.test\/checkout\/confirmar/);
    expect(log).toMatch(/AVISO {4}API antiga/);
  } finally {
    await ctx.close();
  }
});
