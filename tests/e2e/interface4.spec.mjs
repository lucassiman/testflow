// 10.3 (1.27.0): menu Novo agrupado e paleta com categorias e "usados recentemente".
// 12.1 (1.57.0): Novo ▾ só cria documentos; um menu por módulo no topo; a paleta usa os mesmos módulos.
import { test, expect } from '@playwright/test';
import { openEditor, raw } from './helpers.mjs';

test('menu Novo agrupado; Caso de teste abre o modelo', async ({ page }) => {
  await openEditor(page, { mode: 'preview' });
  await page.click('button[data-menu="newMenu"]');
  const titles = page.locator('#newMenu .menu-title');
  await expect(titles).toHaveText(['Documento', 'Importar']);
  await expect(page.locator('#newMenu [data-cmd="newCase"]')).toHaveCount(0);
  await expect(page.locator('#newMenu [data-cmd="newRun"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.click('button[data-menu="mod-casos"]');
  await page.click('#mod-casos [data-cmd="newCase"]');
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
  await expect(page.locator('.cmd-group', { hasText: /^Execução$/ })).toHaveCount(1);
  await expect(page.locator('.cmd-group', { hasText: 'Editar e exibir' })).toHaveCount(1);
  await page.keyboard.type('Modo foco');
  await page.keyboard.press('Enter');
  await expect(page.locator('.topbar')).toBeHidden();
  await page.keyboard.press('Control+Shift+.');
  await expect(page.locator('.topbar')).toBeVisible();
  await open();
  await expect(groups.first()).toHaveText('Usados recentemente');
  await expect(page.locator('.cmd-item').first()).toContainText('Modo foco');
});

test('menus por módulo no topo (1.57.0): cada um com as suas ações; o atalho e o rótulo levam ao comando', async ({ page }) => {
  await openEditor(page, { mode: 'preview' });
  const mods = page.locator('#moduleMenus [data-menu]');
  await expect(mods).toHaveCount(7);
  await expect(mods.nth(0)).toHaveAttribute('aria-label', 'Dia');
  await expect(mods.nth(0)).toBeHidden(); // diário opcional: sem notas do diário nem preferência, o menu Dia não aparece
  await expect(mods.nth(2)).toHaveAttribute('aria-label', 'Execução');
  await page.click('button[data-menu="mod-execucao"]');
  await expect(page.locator('button[data-menu="mod-execucao"]')).toHaveAttribute('aria-expanded', 'true');
  const pop = page.locator('#mod-execucao');
  await expect(pop.locator('.menu-title')).toHaveText(['Começar', 'Durante', 'Resultados', 'Acompanhar com o time', 'Configurar']);
  await expect(pop.locator('[data-cmd="trend"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
  await expect(page.locator('button[data-menu="mod-execucao"]')).toHaveAttribute('aria-expanded', 'false');
  // menu longo numa tela baixa: rola dentro do menu, sem sair da tela
  await page.setViewportSize({ width: 1300, height: 420 });
  await page.click('button[data-menu="mod-compartilhar"]');
  const share = page.locator('#mod-compartilhar');
  await expect(share).toBeVisible();
  const box = await share.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(420);
  await share.locator('[data-cmd="sensitive"]').scrollIntoViewIfNeeded();
  await share.locator('[data-cmd="sensitive"]').click();
  await expect.poll(() => page.locator('#toast, .sens-dialog').allInnerTexts().then((t) => t.join(' '))).toMatch(/sens[ií]ve/i);
});
