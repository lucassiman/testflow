// 1.31.1: muitas abas em tela pequena — a faixa rola por dentro, sem barra de rolagem por cima das abas.
import { test, expect } from '@playwright/test';
import { openEditor, setRaw } from './helpers.mjs';

test('muitas abas: sem barra por cima, ‹ › e lista ⌄ para chegar em qualquer aba; a ativa fica à vista', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await openEditor(page, { mode: 'split', doc: '# A0\n' });
  for (let i = 1; i <= 11; i++) {
    await page.keyboard.press('Alt+n');
    await setRaw(page, `# Documento numero ${i}\n`);
  }
  const bar = page.locator('#tabbar');
  const strip = bar.locator('.tab-strip');
  await expect(bar.locator('.tab')).toHaveCount(12);
  await expect(bar).toHaveClass(/overflow/);
  // sem barra de rolagem e a faixa não é mais alta que as abas (nada cobre os nomes)
  expect(await strip.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('none');
  const tabBox = await bar.locator('.tab.active').boundingBox();
  const stripBox = await strip.boundingBox();
  expect(stripBox.y + stripBox.height).toBeLessThanOrEqual(tabBox.y + tabBox.height + 1);
  // a ativa (última criada) está à vista
  expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(stripBox.x + stripBox.width + 1);
  // ‹ rola para o começo
  const left = bar.locator('[data-scroll="-1"]');
  await expect(left).toBeEnabled();
  for (let k = 0; k < 6 && await left.isEnabled(); k++) { await left.click(); await page.waitForTimeout(350); }
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(0);
  await expect(left).toBeDisabled();
  // roda do mouse rola na horizontal
  await strip.hover();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  // lista ⌄ mostra todas e troca de aba
  await bar.locator('.tab-list').click();
  const menu = page.locator('.tab-menu');
  await expect(menu.locator('button')).toHaveCount(12);
  const firstId = await bar.locator('.tab').first().getAttribute('data-id');
  await menu.locator('button').first().click();
  await expect(menu).toHaveCount(0);
  await expect(bar.locator('.tab.active')).toHaveAttribute('data-id', firstId);
  const act = await bar.locator('.tab.active').boundingBox();
  const sb = await strip.boundingBox();
  expect(act.x).toBeGreaterThanOrEqual(sb.x - 1);
});

test('documento novo e aberto abrem no Preview (padrão); Dividido fica a critério do usuário', async ({ page }) => {
  await openEditor(page, { mode: 'split', prefs: { openMode: undefined } });
  // ao iniciar: Preview, mesmo com o último modo salvo como Dividido
  await expect(page.locator('#workspace')).toHaveAttribute('data-mode', 'preview');
  await page.click('[data-mode="split"]');
  await expect(page.locator('#workspace')).toHaveAttribute('data-mode', 'split');
  // documento novo: volta ao Preview, com um bloco em edição para digitar
  await page.keyboard.press('Alt+n');
  await expect(page.locator('#workspace')).toHaveAttribute('data-mode', 'preview');
  await expect(page.locator('#preview .md-block.editing')).toHaveCount(1);
  await page.keyboard.type('# Meu documento');
  await page.locator('.statusbar').click({ position: { x: 5, y: 5 } }); // sai do bloco: grava
  await expect(page.locator('#preview h1')).toHaveText('Meu documento');
  // a escolha "último modo" está na paleta
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Ao abrir documento');
  await page.keyboard.press('Enter');
  await page.click('[data-mode="split"]');
  await page.keyboard.press('Alt+n');
  await expect(page.locator('#workspace')).toHaveAttribute('data-mode', 'split');
});
