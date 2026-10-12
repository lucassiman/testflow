// 10.3 (1.28.0): painel da rodada — barra com as cores dos status, filtro (pendentes / falhas) e duração por caso.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const tc = (id) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\n---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | a | b | | |\n`;

test('painel da rodada: barra colorida, filtros e duração', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-painel-rodada');
  await openEditor(page, { mode: 'preview', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async (files) => { for (const [p, t] of files) await window.__write(p, t); }, ['TC-1', 'TC-2', 'TC-3', 'TC-4'].map((id) => [`aplicacoes/Portal/casos/${id}.md`, tc(id)]));
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(4);
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill('R');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  const panel = page.locator('#cyclePanel');
  await panel.locator('.cp-item', { hasText: 'TC-1' }).click();
  await expect(page.locator('.runner .run-step')).toContainText('Passo 1');
  await page.keyboard.press('2'); // FAIL
  await page.locator('.runner button', { hasText: 'Concluir' }).first().click();
  await expect(page.locator('#fileName')).toContainText('TC-2', { timeout: 10_000 });
  await expect(panel.locator('.cp-seg-fail')).toHaveCount(1);
  await expect(panel.locator('.cp-item', { hasText: 'TC-1' }).locator('.cp-dur')).toContainText('⏱');
  await panel.locator('[data-f="falhas"]').click();
  await expect(panel.locator('.cp-item')).toHaveCount(2); // TC-1 (falha) + TC-2 (aberto)
  await panel.locator('[data-f="pendentes"]').click();
  await expect(panel.locator('.cp-item')).toHaveCount(3);
  await panel.locator('[data-f="todos"]').click();
  await expect(panel.locator('.cp-item')).toHaveCount(4);
});
