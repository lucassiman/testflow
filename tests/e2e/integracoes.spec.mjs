// 11.5 — integrações e acompanhamento: testes instáveis (1.52.0) e exportar .feature (1.52.0).
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

/** @param {import('@playwright/test').Page} page @param {string} text */
async function palette(page, text) {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** @param {import('@playwright/test').Page} page */
async function openWorkspace(page) {
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
}

const execDoc = (id, day, status) => `---\ntipo: execucao\nid: ${id}\ntitulo: Automação ${day}\napp: Portal\ndata: 2026-10-${day}\n---\n\n# ${id}\n\n## Testes automatizados\n\n> 🤖 **Playwright** — \`ci.json\` · importado em ${day}/10/2026 10:00\n\n### Resultados\n\n| # | Teste | Arquivo | Duração | Resultado | Obs |\n| ---: | --- | --- | ---: | --- | --- |\n| 1 | login @TC-1 | login.spec.ts:3 | 1,2 s | \`PASS\` | |\n| 2 | cadastro TC-2 | login.spec.ts:9 | 0,9 s | \`${status}\` | |\n`;

const report = {
  name: 'ci.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({
    config: {}, stats: { startTime: '2026-10-06T10:00:00Z', duration: 2100 },
    suites: [{ title: 'login.spec.ts', file: 'login.spec.ts', specs: [
      { title: 'login @TC-1', file: 'login.spec.ts', line: 3, tests: [{ projectName: 'chromium', results: [{ status: 'passed', duration: 1200 }] }] },
      { title: 'cadastro TC-2', file: 'login.spec.ts', line: 9, tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 900, error: { message: 'boom' } }] }] },
    ] }],
  })),
};

test('instáveis: o relatório novo marca o teste que alterna PASS/FAIL; a tendência lista os instáveis', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-flaky');
  await openEditor(page, { mode: 'split', prefs: { automationRootAsked: true } });
  await page.evaluate(async (docs) => { for (const [p, t] of docs) await window.__write(p, t); }, [
    ['aplicacoes/Portal/execucoes/EXE-1.md', execDoc('EXE-1', '01', 'PASS')],
    ['aplicacoes/Portal/execucoes/EXE-2.md', execDoc('EXE-2', '02', 'FAIL')],
    ['aplicacoes/Portal/execucoes/EXE-3.md', execDoc('EXE-3', '03', 'PASS')],
  ]);
  await openWorkspace(page);
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(3);
  await page.click('button[data-menu="newMenu"]');
  const chooser = page.waitForEvent('filechooser');
  await page.click('#newMenu [data-cmd="newAutoRun"]');
  await (await chooser).setFiles(report);
  await expect.poll(() => raw(page)).toMatch(/^## Testes automatizados$/m);
  const text = await raw(page);
  expect(text).toMatch(/\| cadastro TC-2 \|[^\n]*`FAIL` \| boom · ⚠ instável: 3 trocas PASS↔FAIL em 4 execuções \|/);
  expect(text.split('\n').find((l) => l.includes('| login @TC-1 |'))).not.toContain('instável');
  await page.keyboard.press('Control+s');

  await palette(page, 'Tendência entre rodadas');
  await expect(page.locator('#fileName')).toContainText('tendencia');
  await expect(page.locator('#preview')).toContainText('Testes automatizados instáveis');
  await expect(page.locator('#preview')).toContainText('✓✗✓✗');
});

const BDD = '---\ntipo: cenario-bdd\nid: CEN-004\ntitulo: Carrinho\napp: Loja\njira: LOJA-12\ntags: [checkout]\n---\n\n# CEN-004 — Carrinho\n\n## Cenários\n\n```gherkin\nFuncionalidade: Carrinho de compras\n\n  Cenário: Adicionar item\n    Dado que estou na vitrine\n    Então o carrinho mostra 1 item\n```\n\n```gherkin\nFeature: Coupons\n  Scenario: Apply coupon\n    Given a cart\n```\n';

test('.feature: grava na pasta da automação, substitui o arquivo antigo do TestFlow e não toca no escrito à mão', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-feature');
  // a "pasta de features" da automação: outra pasta (OPFS) no seletor de pastas
  await page.addInitScript(() => {
    const ws = window.showDirectoryPicker;
    window.__features = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('repo-features', { create: true });
    window.showDirectoryPicker = async (opts) => (opts?.id === 'mdqa-features' ? window.__features() : ws(opts));
    window.__feat = async (name) => { try { return await (await (await (await window.__features()).getFileHandle(name)).getFile()).text(); } catch { return null; } };
    window.__featLs = async () => { const out = []; for await (const k of (await window.__features()).keys()) out.push(k); return out.sort(); };
  });
  await openEditor(page, { mode: 'split' });
  await page.evaluate(async (t) => {
    await window.__write('aplicacoes/Loja/casos/CEN-004.md', t);
    const dir = await window.__features();
    const put = async (n, c) => { const w = await (await dir.getFileHandle(n, { create: true })).createWritable(); await w.write(c); await w.close(); };
    await put('carrinho-antigo.feature', '# language: pt\n# Gerado pelo TestFlow a partir de CEN-004 (x) em 01/10/2026.\nFuncionalidade: velha\n');
    await put('cen-004-coupons-2.feature', 'Feature: escrito à mão\n');
  }, BDD);
  await openWorkspace(page);
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'CEN-004' }).click();
  await expect(page.locator('#fileName')).toContainText('CEN-004');

  await palette(page, 'Exportar .feature (Gherkin) deste documento');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Exportar 2 arquivos .feature');
  await expect(dlg).toContainText('cen-004-carrinho-de-compras.feature — Carrinho de compras');
  await dlg.locator('button', { hasText: 'Escolher a pasta…' }).click();
  await expect(page.locator('#toast')).toContainText('2 .feature em repo-features/: 1 novo(s), 1 atualizado(s)');
  expect(await page.evaluate(() => window.__featLs())).toEqual(['carrinho-antigo.feature', 'cen-004-coupons-2-testflow.feature', 'cen-004-coupons-2.feature']);
  const pt = await page.evaluate(() => window.__feat('carrinho-antigo.feature'));
  expect(pt).toMatch(/^# language: pt\n# Gerado pelo TestFlow a partir de CEN-004 \(aplicacoes\/Loja\/casos\/CEN-004\.md\)/);
  expect(pt).toContain('@CEN-004 @LOJA-12 @checkout\nFuncionalidade: Carrinho de compras');
  expect(await page.evaluate(() => window.__feat('cen-004-coupons-2.feature'))).toBe('Feature: escrito à mão\n');
  expect(await page.evaluate(() => window.__feat('cen-004-coupons-2-testflow.feature'))).toContain('Feature: Coupons');

  // de novo: a pasta foi lembrada e nada novo é criado
  await palette(page, 'Exportar .feature (Gherkin) deste documento');
  await dlg.locator('button', { hasText: 'Gravar em repo-features/' }).click();
  await expect(page.locator('#toast')).toContainText('0 novo(s), 2 atualizado(s)');
  expect(await page.evaluate(() => window.__featLs())).toHaveLength(3);

  // todos os cenários da pasta
  await palette(page, 'Exportar .feature de todos os cenários BDD');
  await expect(dlg).toContainText('1 documento(s) com cenários BDD');
  await dlg.locator('button', { hasText: 'Gravar em repo-features/' }).click();
  await expect(page.locator('#toast')).toContainText('0 novo(s), 2 atualizado(s)');
});

test('reporter da automação (1.53.0): a paleta mostra e copia o trecho do Playwright com o caminho da pasta de trabalho', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(wsInit, 'ws-reporter');
  await openEditor(page, { mode: 'split', prefs: { wsDiskPaths: { 'ws-reporter': String.raw`C:\dev\qa` } } });
  await page.evaluate(() => window.__write('aplicacoes/Portal/casos/TC-1.md', '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\n---\n\n# TC-1 — Login\n'));
  await openWorkspace(page);
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await palette(page, 'Reporter da automação');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText("reporter: [['list'], ['<pasta do TestFlow>/reporter-dist/testflow.mjs', { pasta: 'C:/dev/qa', app: 'Portal' }]],");
  await expect(dlg).toContainText(String.raw`node "<pasta do TestFlow>/reporter-dist/testflow.mjs" importar junit.xml --pasta "C:\dev\qa" --app "Portal"`);
  await dlg.locator('button', { hasText: 'Copiar trecho do Playwright' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("{ pasta: 'C:/dev/qa', app: 'Portal' }");
});
