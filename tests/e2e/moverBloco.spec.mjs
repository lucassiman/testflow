// Alça ⋮⋮ (estilo Notion): arrastar move o bloco; clicar abre o menu; título recolhido leva a seção.
import { test, expect } from '@playwright/test';
import { openEditor, raw } from './helpers.mjs';

/** Passa o mouse no bloco e arrasta a alça até `toY`. */
async function dragBlock(page, from, toY) {
  const box = await from.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 5);
  const handle = page.locator('.block-handle');
  await expect(handle).toBeVisible();
  const h = await handle.boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 40, toY, { steps: 8 });
  await expect(page.locator('.block-drop-line')).toBeVisible();
  await page.mouse.up();
}

test('alça ⋮⋮: arrastar move o bloco; Ctrl+Z desfaz', async ({ page }) => {
  const doc = '# T\n\nUm.\n\nDois.\n\nTrês.\n';
  await openEditor(page, { doc });
  const tres = await page.locator('#preview p', { hasText: 'Um.' }).boundingBox();
  await dragBlock(page, page.locator('#preview .md-block', { hasText: 'Três.' }), tres.y + 2);
  expect(await raw(page)).toBe('# T\n\nTrês.\n\nUm.\n\nDois.\n');
  await expect(page.locator('.block-selected')).toHaveCount(1);

  // para o fim do documento
  const last = await page.locator('#preview p', { hasText: 'Dois.' }).boundingBox();
  await dragBlock(page, page.locator('#preview .md-block', { hasText: 'Um.' }), last.y + last.height + 30);
  expect(await raw(page)).toBe('# T\n\nTrês.\n\nDois.\n\nUm.\n');

  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  expect(await raw(page)).toBe('# T\n\nTrês.\n\nUm.\n\nDois.\n');
});

test('alça ⋮⋮: clique abre o menu (mover, duplicar, apagar); YAML não tem alça', async ({ page }) => {
  const doc = '---\ntipo: nota\n---\n\n# T\n\nUm.\n\nDois.\n';
  await openEditor(page, { doc });
  await page.locator('#preview .md-block[data-type="frontmatter"]').hover();
  await expect(page.locator('.block-handle')).toBeHidden();

  await page.locator('#preview p', { hasText: 'Dois.' }).hover();
  await page.locator('.block-handle').click();
  await expect(page.locator('.block-menu')).toBeVisible();
  await page.locator('.block-menu [data-bm="up"]').click();
  expect(await raw(page)).toBe('---\ntipo: nota\n---\n\n# T\n\nDois.\n\nUm.\n');
  await expect(page.locator('.block-menu')).toBeHidden();

  await page.locator('#preview p', { hasText: 'Um.' }).hover();
  await page.locator('.block-handle').click();
  await page.locator('.block-menu [data-bm="dup"]').click();
  expect(await raw(page)).toBe('---\ntipo: nota\n---\n\n# T\n\nDois.\n\nUm.\n\nUm.\n');
  await page.locator('#preview p', { hasText: 'Dois.' }).hover();
  await page.locator('.block-handle').click();
  await page.locator('.block-menu [data-bm="del"]').click();
  expect(await raw(page)).toBe('---\ntipo: nota\n---\n\n# T\n\nUm.\n\nUm.\n');
});

test('alça ⋮⋮: título recolhido arrasta a seção inteira', async ({ page }) => {
  const doc = '# Doc\n\n## A\n\nTexto A.\n\n## B\n\nTexto B.\n';
  await openEditor(page, { doc });
  const headB = page.locator('#preview .md-block', { has: page.locator('h2', { hasText: 'B' }) });
  await headB.locator('.fold-toggle').click({ force: true });
  await expect(page.locator('#preview p', { hasText: 'Texto B.' })).toBeHidden();
  const a = await page.locator('#preview h2', { hasText: 'A' }).boundingBox();
  await dragBlock(page, headB, a.y + 1);
  expect(await raw(page)).toBe('# Doc\n\n## B\n\nTexto B.\n\n## A\n\nTexto A.\n');
});
