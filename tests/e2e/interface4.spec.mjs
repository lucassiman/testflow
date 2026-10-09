// 10.3 (1.27.0): menu Novo agrupado (Documento · Execução · Importar) e paleta com categorias e "usados recentemente".
import { test, expect } from '@playwright/test';
import { openEditor, raw } from './helpers.mjs';

test('menu Novo agrupado; Caso de teste abre o modelo', async ({ page }) => {
  await openEditor(page, { mode: 'preview' });
  await page.click('button[data-menu="newMenu"]');
  const titles = page.locator('#newMenu .menu-title');
  await expect(titles).toHaveText(['Documento', 'Execução', 'Importar']);
  await page.click('#newMenu [data-cmd="newCase"]');
  await expect.poll(() => raw(page)).toMatch(/^tipo: caso-de-teste$/m);
});

test('paleta: ações por categoria e as usadas recentemente no topo', async ({ page }) => {
  await openEditor(page, { mode: 'preview' });
  const open = async () => { await page.keyboard.press('Control+Shift+P'); await expect(page.locator('.cmd-item.active')).toBeVisible(); };
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await open();
  const groups = page.locator('.cmd-group');
  await expect(groups.first()).not.toHaveText('Usados recentemente');
  await expect(page.locator('.cmd-group', { hasText: 'Execução e rodadas' })).toHaveCount(1);
  await expect(page.locator('.cmd-group', { hasText: 'Exibição' })).toHaveCount(1);
  await page.keyboard.type('Modo foco');
  await page.keyboard.press('Enter');
  await expect(page.locator('.topbar')).toBeHidden();
  await page.keyboard.press('Control+Shift+.');
  await expect(page.locator('.topbar')).toBeVisible();
  await open();
  await expect(groups.first()).toHaveText('Usados recentemente');
  await expect(page.locator('.cmd-item').first()).toContainText('Modo foco');
});
