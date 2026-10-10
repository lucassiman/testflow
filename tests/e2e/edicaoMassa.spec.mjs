// 11.2 (1.41.0): edição em massa — escolher os casos, mudar prioridade e tags, prévia, gravar, desfazer.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const tc = (id, prio, tags) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\nprioridade: ${prio}\ntags: [${tags}]\n---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Status |\n| --- | --- | --- | --- |\n| 1 | a | b | |\n`;

test('edição em massa: pasta → casos marcados → prioridade e tags; aberto vira edição; desfazer volta', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-massa');
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true, publisherName: 'Lucas' } });
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(p, t); }, [
    ['aplicacoes/Portal/casos/PIX/TC-1.md', tc('TC-1', 'Média', 'pix, obsoleto')],
    ['aplicacoes/Portal/casos/PIX/TC-2.md', tc('TC-2', 'Baixa', 'pix')],
    ['aplicacoes/Portal/casos/TC-3.md', tc('TC-3', 'Baixa', '')],
  ]);
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).first().click();
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Edição em massa');
  await page.keyboard.press('Enter');
  const picker = page.locator('.cpk-dialog');
  await expect(picker).toBeVisible();
  await expect(picker.locator('.cpk-name')).toBeHidden();
  await picker.locator('.cpk-search').fill('pix');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-act="ok"]').click();
  const dlg = page.locator('.bulk-dialog');
  await expect(dlg).toContainText('2 caso(s)');
  await dlg.locator('[data-b="prioridade"]').selectOption('Alta');
  await dlg.locator('[data-b="addTags"]').fill('regressao');
  await dlg.locator('.bulk-tag', { hasText: '#obsoleto' }).click();
  await expect(dlg.locator('[data-b="removeTags"]')).toHaveValue('obsoleto');
  await expect(dlg.locator('.bulk-preview')).toContainText('Muda 2 de 2: TC-1, TC-2');
  await dlg.locator('[data-act="ok"]').click();
  await expect(page.locator('#toast')).toContainText('2 caso(s) editado(s)');
  // o aberto (TC-1) mudou no editor; o fechado (TC-2) no disco
  await expect(page.locator('.fm-card')).toContainText('Alta');
  const tc2 = () => page.evaluate(() => window.__read('aplicacoes/Portal/casos/PIX/TC-2.md'));
  await expect.poll(tc2).toMatch(/prioridade: Alta\ntags: \[pix, regressao\]/);
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/casos/TC-3.md'))).toMatch(/prioridade: Baixa/);
  await page.locator('#toast button', { hasText: 'Desfazer' }).click();
  await expect.poll(tc2).toMatch(/prioridade: Baixa\ntags: \[pix\]/);
  await expect(page.locator('.fm-card')).toContainText('Média');
});
