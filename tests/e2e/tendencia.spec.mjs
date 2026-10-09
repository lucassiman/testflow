// 11.1 (1.34.0): 📈 Tendência entre rodadas — visão pronta com gráficos.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const exec = (id, dia, rows) => `---\ntipo: execucao\nid: ${id}\ntitulo: Regressão ${dia}\napp: Portal\nsprint: Sprint 9\ninicio: 2026-10-${dia} 09:00\nfim: 2026-10-${dia} 10:00\nstatus: PENDING\n---\n\n# Regressão ${dia}\n\n## Casos do ciclo\n\n| # | Caso | Título | Status | Executado em | Bugs |\n| --- | --- | --- | --- | --- | --- |\n${rows.map(([k, s], i) => `| ${i + 1} | [[${k}]] | ${k} | \`${s}\` | | |`).join('\n')}\n`;

test('tendência: a paleta cria a visão em visoes/ com o gráfico de % de sucesso e as tabelas', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-tendencia');
  await openEditor(page, { mode: 'preview', prefs: { home: true } });
  await page.evaluate(async ([a, b]) => {
    await window.__write('aplicacoes/Portal/execucoes/r1.md', a);
    await window.__write('aplicacoes/Portal/execucoes/r2.md', b);
  }, [exec('EXEC-1', '01', [['TC-1', 'PASS'], ['TC-2', 'FAIL']]), exec('EXEC-2', '05', [['TC-1', 'PASS'], ['TC-2', 'PASS']])]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  // atalho na tela inicial
  await page.locator('#home [data-home-cmd="trend"]').click();
  await expect(page.locator('#fileName')).toContainText('tendencia', { timeout: 10_000 });
  const view = page.locator('#preview .qa-view');
  await expect(view.locator('.qa-view-sum')).toContainText('% de sucesso: 50% → 100% em 2 rodadas (▲ 50 pp)');
  const chart = view.locator('.qa-chart').first();
  await expect(chart.locator('figcaption')).toHaveText('% de sucesso por rodada');
  await expect(chart.locator('.qa-chart-col')).toHaveCount(2);
  await expect(chart.locator('.qa-chart-v').nth(1)).toHaveText('100%');
  await expect(view.locator('.qa-view-group', { hasText: 'Por rodada' })).toBeVisible();
  // clicar na barra abre a rodada
  await chart.locator('a.qa-chart-x').first().click();
  await expect(page.locator('#fileName')).toContainText('r1');
  // de novo pela paleta: abre a mesma visão (não cria outra)
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Tendência entre rodadas');
  await page.keyboard.press('Enter');
  await expect(page.locator('#fileName')).toContainText('tendencia');
  expect(await page.evaluate(() => window.__ls('visoes'))).toEqual(['tendencia.md']);
});
