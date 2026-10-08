// [+][⋮⋮] lado a lado na margem (o "+" não fica mais embaixo da alça) e caixa de destaque em bloco vazio.
import { test, expect } from '@playwright/test';
import { openEditor, raw } from './helpers.mjs';

test('[+][⋮⋮]: "+" cria bloco entre dois; Alt+"+" cria acima; ⋮⋮ continua arrastando', async ({ page }) => {
  await openEditor(page, { doc: '# T\n\nUm.\n\nDois.\n' });
  await page.locator('#preview p', { hasText: 'Um.' }).hover();
  const gutter = page.locator('.block-gutter');
  await expect(gutter).toBeVisible();
  const add = gutter.locator('.block-gutter-add');
  const handle = gutter.locator('.block-handle');
  // lado a lado, sem se cobrir
  const a = await add.boundingBox();
  const h = await handle.boundingBox();
  expect(a.x + a.width).toBeLessThanOrEqual(h.x + 0.5);
  // e sem cobrir o texto
  const p = await page.locator('#preview p', { hasText: 'Um.' }).boundingBox();
  expect(h.x + h.width).toBeLessThanOrEqual(p.x);

  await add.click();
  await expect(page.locator('#preview .md-block.new-block')).toHaveCount(1);
  await page.keyboard.type('Entre os dois');
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toBe('# T\n\nUm.\n\nEntre os dois\n\nDois.\n');

  // Alt+clique: acima
  await page.locator('#preview p', { hasText: 'Dois.' }).hover();
  await add.click({ modifiers: ['Alt'] });
  await page.keyboard.type('Acima do dois');
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toBe('# T\n\nUm.\n\nEntre os dois\n\nAcima do dois\n\nDois.\n');

  // ⋮⋮ arrasta normalmente
  await page.locator('#preview p', { hasText: 'Dois.' }).hover();
  const hb = await handle.boundingBox();
  const top = await page.locator('#preview p', { hasText: 'Um.' }).boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 40, top.y + 2, { steps: 8 });
  await page.mouse.up();
  expect(await raw(page)).toBe('# T\n\nDois.\n\nUm.\n\nEntre os dois\n\nAcima do dois\n');
});

test('destaque num bloco novo vazio: abre em edição, o texto entra na caixa e Enter abre outra linha', async ({ page }) => {
  await openEditor(page, { doc: '# T\n\nUm.\n\nDois.\n' });
  await page.locator('#preview p', { hasText: 'Um.' }).hover();
  await page.locator('.block-gutter-add').click();
  await expect(page.locator('#preview .md-block.new-block')).toHaveCount(1);
  await page.locator('button[data-menu="alertMenu"]').click();
  await page.locator('[data-cmd="alert"][data-value="NOTE"]').click();
  await expect(page.locator('#preview .md-block.editing blockquote.alert-note')).toHaveCount(1);
  await page.keyboard.type('Texto da nota');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Linha 2');
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toBe('# T\n\nUm.\n\n> [!NOTE]\n> Texto da nota\n>\n> Linha 2\n\nDois.\n');
});

test('caixa de destaque só com o título (feita antes da correção): clicar abre para escrever', async ({ page }) => {
  await openEditor(page, { doc: '# T\n\n> [!WARNING]\n> \n\nDepois.\n' });
  await page.locator('#preview .alert-title').click();
  await expect(page.locator('#preview .md-block.editing')).toHaveCount(1);
  await page.keyboard.type('Cuidado com o ambiente');
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toContain('> [!WARNING]\n> Cuidado com o ambiente');
  expect(await raw(page)).toContain('\n\nDepois.\n');
});
