// 10.3 (1.25.0): menos barras — formatação só num bloco (sem empurrar o texto), execução compacta e modo foco.
import { test, expect } from '@playwright/test';
import { openEditor } from './helpers.mjs';

const DOC = '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\n---\n\n# TC-1 — Login\n\nParágrafo de teste.\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | ok | `PASS` |\n| 2 | Entrar | Entra | | |\n';

test('barra de formatação só num bloco do Preview, sem empurrar o texto; Dividido mostra sempre', async ({ page }) => {
  await openEditor(page, { mode: 'preview', doc: DOC });
  const tb = page.locator('#toolbar');
  await expect(tb).toBeHidden();
  const p = page.locator('#preview p', { hasText: 'Parágrafo de teste' });
  const y0 = (await p.boundingBox()).y;
  await p.click();
  await expect(tb).toBeVisible();
  expect(Math.abs((await p.boundingBox()).y - y0)).toBeLessThan(2); // o texto não pulou
  await page.keyboard.press('Escape'); // encerra a edição: a barra fica (o bloco continua selecionado)
  await expect(tb).toBeVisible();
  await page.click('button[data-menu="codeMenu"]'); // ainda dá para usar a barra
  await expect(page.locator('#codeMenu')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(tb).toBeHidden();

  // barra de execução: só os status que existem
  const bar = page.locator('.exec-bar');
  await expect(bar.locator('.exec-chip')).toHaveCount(2); // PASS 1 e PENDING 1
  await expect(bar).not.toContainText('BLOCKED');

  await page.click('button[data-mode="split"]');
  await expect(tb).toBeVisible();
  await page.click('button[data-mode="preview"]');
  await expect(tb).toBeHidden();

  // preferência "sempre"
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Barra de formatação no Preview');
  await page.keyboard.press('Enter');
  await expect(tb).toBeVisible();
});

test('modo foco: Ctrl+Shift+. esconde topo, barras e barra lateral; ⤢ volta; fica lembrado', async ({ page }) => {
  await openEditor(page, { mode: 'preview', doc: DOC, prefs: { sidebar: true } });
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+.');
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('.statusbar')).toBeHidden();
  await expect(page.locator('.exec-bar')).toBeHidden();
  await expect(page.locator('#preview h1')).toBeVisible();
  await page.reload();
  await page.waitForSelector('#preview .md-block');
  await expect(page.locator('.topbar')).toBeHidden();
  await page.locator('#focusExit').click();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.statusbar')).toBeVisible();
});
