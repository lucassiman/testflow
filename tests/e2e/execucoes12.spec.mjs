// R2 (8.2): execuções — E2: com várias abertas, sempre dá para saber qual é e cada ação vai para a da aba.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const tc = (id) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\ntags: [regressao]\n---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n`;

async function workspace(page, name, docs) {
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true, publisherName: 'Lucas' } });
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(p, t); }, docs);
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file').first()).toBeVisible();
}

/** Nova rodada com os casos visíveis; devolve o ID da execução (pelo painel). */
async function newRun(page, name, prev = '') {
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="startRun"]');
  await page.click('.app-dialog button:has-text("Continuar")');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill(name);
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  await expect(page.locator('#toast')).toContainText(/Rodada EXEC-\d{8}-\d{6} criada/);
  const ident = page.locator('#cyclePanel .cp-ident');
  await expect(ident).toHaveText(/^EXEC-\d{8}-\d{6}/);
  if (prev) await expect(ident).not.toHaveText(prev);
  return /** @type {string} */ ((await ident.textContent()) || '').trim();
}

test('E2: duas execuções abertas — o painel e a barra dizem qual é; a aba do caso segue a execução de onde ele veio', async ({ page }) => {
  await workspace(page, 'ws-e2', [['aplicacoes/Portal/casos/TC-1.md', tc('TC-1')]]);
  const a = await newRun(page, 'Rodada A');
  await page.waitForTimeout(1100); // IDs por segundo
  // caso aberto pela A: aba com ▶ e a barra ▶ Execução com o ID da A
  await page.locator('#cyclePanel .cp-item[data-key="TC-1"]').click();
  await expect(page.locator('.runner .run-exec')).toHaveText(a);
  const caseTab = page.locator('.tab', { hasText: 'TC-1' });
  await expect(caseTab.locator('.tab-mark-run')).toHaveAttribute('title', new RegExp(a));
  // a B vira a ativa
  await page.locator('.runner [data-act="close"]').click();
  const b = await newRun(page, 'Rodada B', a);
  expect(b).not.toBe(a);
  // de volta à aba do caso: vale a A (de onde ele veio), não a última criada
  await caseTab.click();
  await expect(page.locator('#cyclePanel .cp-ident')).toHaveText(a);
  // abrindo a B, o painel é o da B; e voltar ao caso (aba) traz a A de novo
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'rodada-b' }).first().click();
  await expect(page.locator('#cyclePanel .cp-ident')).toHaveText(b);
  await caseTab.click();
  await expect(page.locator('#cyclePanel .cp-ident')).toHaveText(a);
});
