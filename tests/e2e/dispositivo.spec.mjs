// Dispositivo/ambiente: escolher no painel da execução, ver no cabeçalho, nas tags e no chip.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

test('dispositivo da execução: Mobile iOS com versão vira campo, tag e chip', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(wsInit, 'ws-dispositivo');
  await openEditor(page, { mode: 'split', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async () => {
    await window.__write('aplicacoes/Portal/casos/TC-1.md', '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\ntags: [regressao]\nbrowser:\ndispositivo:\n---\n\n# TC-1 — Login\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n');
  });
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(1);
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill('Mobile');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  const panel = page.locator('#cyclePanel');
  await expect(panel.locator('.cp-item')).toHaveCount(1);

  await panel.locator('[data-cp="device"]').click();
  const dv = page.locator('.dv-dialog');
  await expect(dv.locator('.dv-version')).toBeHidden();
  await dv.locator('input[value="ios"]').check();
  await expect(dv.locator('.dv-version')).toBeVisible();
  await dv.locator('[data-dv="version"]').fill('18');
  await dv.locator('button', { hasText: 'Salvar dispositivo' }).click();
  await expect.poll(() => raw(page)).toMatch(/^dispositivo: Mobile iOS — iOS 18$/m);
  await expect.poll(() => raw(page)).toMatch(/^tags: \[regressao, mobile, ios\]$/m);
  await expect(panel.locator('.cp-links')).toContainText('Mobile iOS — iOS 18');

  // trocar para WEB tira as tags do iOS
  await panel.locator('[data-cp="device"]').click();
  await page.locator('.dv-dialog input[value="web"]').check();
  await page.locator('.dv-dialog button', { hasText: 'Salvar dispositivo' }).click();
  await expect.poll(() => raw(page)).toMatch(/^dispositivo: WEB$/m);
  await expect.poll(() => raw(page)).toMatch(/^tags: \[regressao, web\]$/m);
});
