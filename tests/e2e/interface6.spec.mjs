// 10.3 (1.29.0): painel de execução encaixado à direita (com espaço) e cartão do cabeçalho recolhível.
import { test, expect } from '@playwright/test';
import { openEditor, CASE } from './helpers.mjs';

test('painel de execução encaixa à direita quando há espaço e não cobre a tabela; em tela estreita flutua', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await openEditor(page, { mode: 'preview', doc: CASE });
  await page.locator('.exec-bar [data-act="run"]').click();
  const runner = page.locator('.runner');
  await expect(runner).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/runner-docked/);
  const table = await page.locator('#preview table').boundingBox();
  const box = await runner.boundingBox();
  expect(table.x + table.width).toBeLessThanOrEqual(box.x + 1);
  await page.setViewportSize({ width: 900, height: 800 });
  await expect(page.locator('body')).not.toHaveClass(/runner-docked/);
  await runner.locator('[data-act="close"]').click();
  await expect(runner).toBeHidden();
  await expect(page.locator('body')).not.toHaveClass(/runner-docked/);
});

test('cartão do cabeçalho: compacto (ambiente e Jira na linha), ▾ mais mostra os campos sem abrir o formulário', async ({ page }) => {
  await openEditor(page, { mode: 'preview', doc: '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\nstatus: PASS\nambiente: HML\njira: QA-9\nresponsavel: Ana\ntags: [login]\n---\n\n# TC-1\n' });
  const card = page.locator('#preview .fm-card');
  await expect(card.locator('.fm-grid')).toBeHidden();
  await expect(card.locator('.fm-compact-only', { hasText: 'HML' })).toBeVisible();
  await expect(card.locator('.fm-compact-only', { hasText: 'QA-9' })).toBeVisible();
  await card.locator('[data-fm-toggle]').click();
  await expect(card.locator('.fm-grid')).toBeVisible();
  await expect(card).toContainText('Ana');
  await expect(page.locator('.meta-form')).toHaveCount(0);
  await page.reload();
  await page.waitForSelector('#preview .md-block');
  await expect(page.locator('body')).not.toHaveClass(/fm-compact/);
});
