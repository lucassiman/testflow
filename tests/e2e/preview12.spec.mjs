import { test, expect } from '@playwright/test';
import { openEditor, raw } from './helpers.mjs';

// Preview: tabela digitada no bloco vira tabela no Ctrl+Enter.

const ROWS = ['| A | B |', '| --- | --- |', '| 1 | 2 |'];
const EXPECTED = 'Texto.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n';

/** @param {import('@playwright/test').Page} page */
async function typeRows(page) {
  for (const [i, l] of ROWS.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(l);
  }
  await page.keyboard.press('Control+Enter');
}

test('tabela digitada num bloco novo vira tabela no Ctrl+Enter', async ({ page }) => {
  await openEditor(page, { doc: 'Texto.\n' });
  await page.locator('#preview').dblclick({ position: { x: 200, y: 300 } });
  await expect(page.locator('#preview .md-block.new-block')).toHaveCount(1);
  await typeRows(page);
  expect(await raw(page)).toBe(EXPECTED);
  await expect(page.locator('#preview table')).toHaveCount(1);
});

test('tabela digitada depois de um parágrafo existente vira tabela no Ctrl+Enter', async ({ page }) => {
  await openEditor(page, { doc: 'Texto.\n' });
  await page.locator('#preview p', { hasText: 'Texto.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await typeRows(page);
  expect(await raw(page)).toBe(EXPECTED);
  await expect(page.locator('#preview table')).toHaveCount(1);
});

test('"/" Espaço em branco grava &nbsp; e o Preview mostra uma linha vazia', async ({ page }) => {
  await openEditor(page, { doc: 'Um.\n\nDois.\n' });
  await page.locator('#preview p', { hasText: 'Um.' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Espaço em branco');
  await page.keyboard.press('Enter');
  await expect.poll(() => raw(page)).toBe('Um.\n\n&nbsp;\n\nDois.\n');
  await expect(page.locator('#preview p')).toHaveCount(3);
});

test('blocos de código quebram a linha longa; o ↩ do bloco liga a rolagem e fica guardado', async ({ page }) => {
  await openEditor(page, { doc: '```\n' + 'x'.repeat(400) + '\n```\n' });
  const pre = page.locator('#preview pre').first();
  const fits = () => pre.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(await fits()).toBe(true);
  await pre.hover();
  await page.locator('#preview .block-tools [data-act="wrap"]').click();
  expect(await fits()).toBe(false);
  await page.reload();
  await page.waitForSelector('#preview pre');
  expect(await page.evaluate(() => document.documentElement.classList.contains('code-nowrap'))).toBe(true);
});

test('Fechar todas as abas fecha tudo e mostra o Início', async ({ page }) => {
  await openEditor(page, { doc: 'Um.\n', prefs: { home: true } });
  await page.keyboard.press('Alt+N');
  await expect(page.locator('#tabbar .tab')).toHaveCount(2);
  await page.locator('#tabbar .tab-list').click();
  await page.locator('.tab-menu [data-close-all]').click();
  // a primeira aba tem texto não salvo: pergunta
  await page.getByRole('button', { name: /Descartar|Não salvar/ }).click();
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#tabbar .tab')).toHaveCount(1);
});

test('Ctrl+Alt+Shift+P liga a captura sem tirar print; o 📸 seguinte usa a mesma janela', async ({ page }) => {
  await openEditor(page, { doc: 'Texto.\n' });
  await page.evaluate(() => {
    window.__captures = 0;
    navigator.mediaDevices.getDisplayMedia = async () => {
      window.__captures++;
      const c = Object.assign(document.createElement('canvas'), { width: 160, height: 100 });
      const g = c.getContext('2d');
      setInterval(() => { g.fillStyle = `hsl(${Math.random() * 360}, 70%, 50%)`; g.fillRect(0, 0, 160, 100); }, 40);
      return c.captureStream(15);
    };
  });
  await page.keyboard.press('Control+Alt+Shift+P');
  await expect(page.locator('#captureStatus')).toBeVisible();
  expect(await raw(page)).toBe('Texto.\n'); // nenhum print
  expect(await page.evaluate(() => window.__captures)).toBe(1);
});

test('"/" Mapa mental desenha o mindmap; ampliado abre ajustado à tela e arrasta', async ({ page }) => {
  await openEditor(page, { doc: 'Plano.\n' });
  await page.locator('#preview p', { hasText: 'Plano.' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Mapa mental');
  await page.keyboard.press('Enter');
  await expect.poll(() => raw(page)).toContain('mindmap\n  root((Plano de teste))');
  const svg = page.locator('#preview .mermaid-svg svg');
  await expect(svg).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#preview .mermaid-error')).toHaveCount(0);

  await page.locator('#preview .mermaid-svg').hover();
  await page.locator('#preview .block-tools [data-act="zoom"]').click();
  const modal = page.locator('#zoomModal');
  await expect(modal).toBeVisible();
  const body = page.locator('#zoomBody');
  // ajustado: cabe sem rolagem
  expect(await body.evaluate((b) => b.scrollWidth <= b.clientWidth + 1 && b.scrollHeight <= b.clientHeight + 1)).toBe(true);
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  expect(await body.evaluate((b) => b.scrollWidth > b.clientWidth)).toBe(true);
  const before = await body.evaluate((b) => b.scrollLeft);
  const box = await body.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(await body.evaluate((b) => b.scrollLeft)).toBeGreaterThan(before);
  await page.keyboard.press('f');
  expect(await body.evaluate((b) => b.scrollWidth <= b.clientWidth + 1)).toBe(true);
});
