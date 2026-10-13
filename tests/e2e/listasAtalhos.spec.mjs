import { test, expect } from '@playwright/test';
import { openEditor, raw } from './helpers.mjs';

// Preview editável: Markdown ao digitar ("- ", "1. ", "# ", "> ", "[ ] ") e Tab / Shift+Tab em listas.

test('Tab indenta o item da lista e Shift+Tab desfaz; o foco não sai do bloco', async ({ page }) => {
  await openEditor(page, { doc: '- um\n- dois\n- tres\n' });
  await page.locator('#preview li', { hasText: 'dois' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  await expect(page.locator('#preview .md-block.editing')).toBeVisible(); // continua editando o bloco
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toBe('- um\n  - dois\n- tres\n');

  await page.locator('#preview li li', { hasText: 'dois' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toBe('- um\n- dois\n- tres\n');
});

test('Tab no primeiro item não faz nada (e não perde o foco)', async ({ page }) => {
  await openEditor(page, { doc: '- um\n- dois\n' });
  await page.locator('#preview li', { hasText: 'um' }).click();
  await page.keyboard.press('Tab');
  await expect(page.locator('#preview .md-block.editing')).toBeVisible();
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toBe('- um\n- dois\n');
});

test('digitar "- ", "1. ", "[ ] " e "## " já formata o bloco', async ({ page }) => {
  await openEditor(page, { doc: 'Texto.\n' });
  await page.locator('#preview p', { hasText: 'Texto.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- [ ] fazer');
  await page.keyboard.press('Enter');
  await page.keyboard.type('feito');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Control+Enter');
  const text = await raw(page);
  expect(text).toContain('- [ ] fazer\n  - [ ] feito');

  await page.locator('#preview p', { hasText: 'Texto.' }).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## Título novo');
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toContain('## Título novo');
});

test('o marcador só vale no começo da linha', async ({ page }) => {
  await openEditor(page, { doc: 'Texto.\n' });
  await page.locator('#preview p', { hasText: 'Texto.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' - ainda texto');
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toBe('Texto. - ainda texto\n');
});

test('fechar **negrito**, *itálico*, `código` e ~~riscado~~ formata o trecho', async ({ page }) => {
  await openEditor(page, { doc: 'Texto.\n' });
  await page.locator('#preview p', { hasText: 'Texto.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' **forte** e *ital* e `cod` e ~~riscado~~ fim');
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toBe('Texto. **forte** e *ital* e `cod` e ~~riscado~~ fim\n');
});

test('Tab no Markdown bruto de um bloco de código indenta em vez de sair do campo', async ({ page }) => {
  await openEditor(page, { doc: '```js\nif (a) {\nb();\n}\n```\n' });
  await page.locator('#preview .md-block.type-code').first().click();
  const area = page.locator('textarea.block-raw');
  await expect(area).toBeVisible();
  await area.evaluate((t) => { t.focus(); const i = t.value.indexOf('b();'); t.setSelectionRange(i, i); });
  await page.keyboard.press('Tab');
  await expect(area).toBeFocused();
  await page.keyboard.press('Control+Enter');
  expect(await raw(page)).toBe('```js\nif (a) {\n  b();\n}\n```\n');
});
