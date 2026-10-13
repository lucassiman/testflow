// Diário opcional: sem notas nem preferência, o menu Dia e o cartão Hoje não aparecem; liga pela paleta.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

test('diário desligado por padrão numa pasta sem diário; Alt+T só avisa; ligar pela paleta mostra o menu', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-diario-off');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(() => window.__write('aplicacoes/Portal/casos/TC-1.md', '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Pagar\napp: Portal\n---\n\n# TC-1 — Pagar\n'));
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(1);
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).first().click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await expect(page.locator('button[data-menu="mod-dia"]')).toBeHidden();

  await page.keyboard.press('Alt+t');
  await expect(page.locator('#toast')).toContainText('O diário está desligado');

  // paleta: as ações do Dia não aparecem; a preferência sim
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Começar o dia');
  await expect(page.locator('.cmd-menu .cmd-item', { hasText: 'Começar o dia: nota de hoje' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Diário pessoal');
  await page.keyboard.press('Enter');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Diário pessoal e lembretes');
  await dlg.locator('label', { hasText: 'Usar o diário' }).locator('input').check();
  await dlg.locator('label', { hasText: 'Lembrar de começar' }).locator('input').check();
  await dlg.locator('button', { hasText: /^Salvar$/ }).click();
  await expect(page.locator('#toast')).toContainText('Diário ligado · lembretes às 09:00 e 17:30');
  await expect(page.locator('button[data-menu="mod-dia"]')).toBeVisible();
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('mdqa:prefs') || '{}').diary);
  expect(prefs).toMatchObject({ on: true, lembretes: true, inicio: '09:00', fim: '17:30', uteis: true, url: '' });
});
