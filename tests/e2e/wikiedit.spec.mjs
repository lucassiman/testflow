// [[link]] digitado no Preview: em parágrafo com texto, em célula de tabela, com rótulo (| na tabela).
import { test, expect } from '@playwright/test';
import { openEditor, raw } from './helpers.mjs';

const doc = '# TC-5\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | Travou | |\n\n## Observações\n\nTexto que já existia.\n';

test('Preview: [[link]] digitado vira link (parágrafo com texto e célula da tabela)', async ({ page }) => {
  await openEditor(page, { doc });
  await page.locator('#preview p', { hasText: 'Texto que já existia.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Bloqueado por [[TC-3]] e [[TC-4|o caso de login]].');
  await page.keyboard.press('Control+Enter');
  await expect.poll(() => raw(page)).toContain('Texto que já existia. Bloqueado por [[TC-3]] e [[TC-4|o caso de login]].');
  await expect(page.locator('#preview a.wikilink')).toHaveCount(2);

  await page.locator('#preview td', { hasText: 'Travou' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' — bloqueado por [[TC-3]] e [[TC-9|ver login]]');
  await page.keyboard.press('Control+Enter');
  await expect.poll(() => raw(page)).toContain('| 1 | Abrir | Abre | Travou — bloqueado por [[TC-3]] e [[TC-9\\|ver login]] | |');
  await expect(page.locator('#preview td a.wikilink')).toHaveCount(2);
  await expect(page.locator('#preview td a.wikilink').nth(1)).toHaveText('ver login');
});
