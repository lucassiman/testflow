// Árvore da pasta de trabalho: botão para recolher/abrir todas as pastas.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

test('árvore: ⊟ recolhe todas as pastas, ⊞ abre todas (guarda o estado)', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-arvore-tudo');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async () => {
    const md = (id) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: ${id}\n---\n\n# ${id}\n`;
    await window.__write('aplicacoes/Portal/casos/TC-1.md', md('TC-1'));
    await window.__write('aplicacoes/Portal/bugs/BUG-1.md', md('BUG-1'));
    await window.__write('aplicacoes/Loja/casos/TC-2.md', md('TC-2'));
  });
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const files = page.locator('[data-side="wsList"] .side-file');
  await expect(files).toHaveCount(3);
  const toggle = page.locator('[data-side="toggleAll"]');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveText('⊟');

  await toggle.click(); // recolhe tudo: só a pasta de cima fica
  await expect(files).toHaveCount(0);
  await expect(toggle).toHaveText('⊞');
  await expect(page.locator('[data-side="wsList"] .side-folder.open')).toHaveCount(0);

  await toggle.click(); // abre tudo
  await expect(files).toHaveCount(3);
  await expect(toggle).toHaveText('⊟');

  // uma pasta recolhida à mão: o botão ainda recolhe o resto; depois abre tudo
  await page.locator('[data-side="wsList"] .side-folder', { hasText: 'Loja' }).first().click();
  await expect(files).toHaveCount(2);
  await toggle.click();
  await expect(files).toHaveCount(0);
  await toggle.click();
  await expect(files).toHaveCount(3);
});
