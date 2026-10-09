// 11.1 (1.33.0): 🔂 Reteste das falhas — rodada nova só com os casos FAIL/BLOCKED da execução.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const tc = (id) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\n---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir ${id} | Aberto | | |\n`;
const exec = `---\ntipo: execucao\nid: EXEC-20261009-100000\ntitulo: Regressão Portal\napp: Portal\nepico: [PORTAL-10]\ninicio: 2026-10-09 10:00\nfim: 2026-10-09 11:00\nstatus: FAIL\ntags: [regressao, pix]\nqa-md: 1\n---\n\n# Regressão Portal\n\n## Casos do ciclo\n\n| # | Caso | Título | Status | Executado em | Bugs |\n| --- | --- | --- | --- | --- | --- |\n| 1 | [[TC-1]] | Caso TC-1 | \`PASS\` | 09/10/2026 10:10 | |\n| 2 | [[TC-2]] | Caso TC-2 | \`FAIL\` | 09/10/2026 10:20 | |\n| 3 | [[TC-3]] | Caso TC-3 | \`BLOCKED\` | 09/10/2026 10:30 | |\n| 4 | [[TC-4]] | Caso TC-4 | \`SKIP\` | | |\n\n## Encerramento\n\nFinalizada.\n`;

test('reteste das falhas: escolhe só FAIL/BLOCKED (ou com SKIP), herda vínculos e tags e aponta a origem', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-reteste');
  await openEditor(page, { mode: 'preview', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async ([list, e]) => {
    for (const [id, t] of list) await window.__write(`aplicacoes/Portal/casos/${id}.md`, t);
    await window.__write('aplicacoes/Portal/execucoes/regressao-portal.md', e);
  }, [['TC-1', 'TC-2', 'TC-3', 'TC-4'].map((id) => [id, tc(id)]), exec]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'regressao-portal' }).first().click();
  const panel = page.locator('#cyclePanel');
  const btn = panel.locator('[data-cp="retest"]');
  await expect(btn).toContainText('Reteste das falhas (2)');
  await btn.click();
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('2 caso(s) com FAIL ou BLOCKED');
  await expect(dlg.locator('button', { hasText: 'Incluir os SKIP também (3)' })).toBeVisible();
  await dlg.locator('button', { hasText: 'Criar reteste (2)' }).click();
  await expect(page.locator('#fileName')).toContainText('regressao-portal-reteste', { timeout: 10_000 });
  const raw = await page.evaluate(() => document.querySelector('#raw').value);
  expect(raw).toMatch(/^titulo: Regressão Portal — Reteste$/m);
  expect(raw).toMatch(/^epico: \[PORTAL-10\]$/m);
  expect(raw).toMatch(/^tags: \[regressao, pix, reteste\]$/m);
  expect(raw).toContain('reteste das falhas de [[EXEC-20261009-100000]]');
  expect(raw).toContain('[[TC-2]]');
  expect(raw).toContain('[[TC-3]]');
  expect(raw).not.toContain('[[TC-1]]');
  expect(raw).not.toContain('[[TC-4]]');
  await expect(panel.locator('.cp-item')).toHaveCount(2);
});
