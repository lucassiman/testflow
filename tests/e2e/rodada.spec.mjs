// Rodada de execução: seleção dos casos, painel lateral com a checklist, concluir → próximo, revisar um caso concluído sem perder o estado.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

const tc = (id, title) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: ${title}\napp: Portal\ntags: [regressao]\n---\n\n# ${id} — ${title}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n| 2 | Enviar | Envia | | |\n`;

test('rodada: filtro/atalhos no modal, painel lateral, concluir avança e revisar um caso volta ao foco', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(wsInit, 'ws-rodada');
  await openEditor(page, { mode: 'split', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async ([a, b, c]) => {
    await window.__write('aplicacoes/Portal/casos/PORTAL-1/TC-1.md', a);
    await window.__write('aplicacoes/Portal/casos/PORTAL-1/TC-2.md', b);
    await window.__write('aplicacoes/Portal/casos/PORTAL-2/TC-3.md', c);
  }, [tc('TC-1', 'Login'), tc('TC-2', 'Cadastro'), tc('TC-3', 'Relatório')]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(3);

  await page.click('button[data-menu="newMenu"]');
  await page.click('#newMenu [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await expect(picker).toBeVisible();
  const ok = picker.locator('button', { hasText: 'Criar e começar' });
  await expect(ok).toBeDisabled();
  await picker.locator('.cpk-search').fill('relat');
  await expect(picker.locator('.cpk-item')).toHaveCount(1);
  await picker.locator('.cpk-search').fill('');
  await picker.locator('.cpk-item').nth(0).click();
  await picker.locator('.cpk-item').nth(1).click();
  await expect(picker.locator('[data-cpk="count"]')).toContainText('2 de 3');
  await expect(ok).toBeEnabled();
  await picker.locator('button', { hasText: 'Limpar' }).click();
  await expect(picker.locator('[data-cpk="count"]')).toContainText('0 de 3');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await expect(picker.locator('[data-cpk="count"]')).toContainText('3 de 3');
  await picker.locator('[data-cpk="name"]').fill('Rodada teste');
  await ok.click();
  await expect(page.locator('#fileName')).toContainText('rodada-teste');

  const panel = page.locator('#cyclePanel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.cp-item')).toHaveCount(3);

  // ▶ Próximo caso → TC-1 e conclui (PASS); o TC-2 abre sozinho
  await panel.locator('[data-cp="next"]').click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await expect(page.locator('.runner')).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('1');
  await page.locator('.runner [data-act="finish"]').click();
  await expect(page.locator('#fileName')).toContainText('TC-2');
  await expect(panel.locator('.cp-item[data-key="TC-1"]')).toContainText('PASS');
  await expect(panel.locator('.cp-item[data-key="TC-2"]')).toHaveClass(/open/);
  await expect(page.locator('.runner')).toBeVisible();

  // marca um passo do TC-2 e vai rever o TC-1 pelo painel
  await page.keyboard.press('1');
  await panel.locator('.cp-item[data-key="TC-1"]').click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await expect(page.locator('.runner')).toBeVisible();
  await page.keyboard.press('2');
  await page.locator('.runner [data-act="finish"]').click();
  await expect(page.locator('#fileName')).toContainText('TC-2');
  await expect(panel.locator('.cp-item[data-key="TC-1"]')).toContainText('FAIL');

  // histórico do TC-1 segue com uma única rodada
  const hist = await page.evaluate(() => window.__read('aplicacoes/Portal/casos/PORTAL-1/TC-1.md'));
  expect(hist.split('\n').filter((l) => /^\| 1 \| \d\d\/\d\d\/\d{4} /.test(l))).toHaveLength(1);

  // recolher o painel
  await panel.locator('[data-cp="toggle"]').first().click();
  await expect(panel.locator('.cp-mini')).toBeVisible();
  await panel.locator('[data-cp="toggle"]').click();
  await expect(panel.locator('.cp-item')).toHaveCount(3);

  // finalizar com o TC-3 sem executar: confirma, vira SKIP e abre o resumo
  await panel.locator('[data-cp="finish"]').click();
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('TC-3');
  await expect(dlg).toContainText('SKIP');
  await dlg.locator('button', { hasText: 'Finalizar e marcar SKIP' }).click();
  const rs = page.locator('.rs-dialog');
  await expect(rs).toBeVisible();
  await expect(rs).toContainText('Como foi essa rodada?');
  await expect(rs.locator('.rs-problem')).toContainText('TC-1');
  await expect(rs.locator('.rs-skipped')).toContainText('TC-3');
  await expect(rs.locator('.rs-rate')).toContainText('0%');
  await page.keyboard.press('Escape');
  await expect(rs).toHaveCount(0);
  await expect(page.locator('#fileName')).toContainText('rodada-teste');
  await expect.poll(() => raw(page)).toMatch(/\| 3 \| \[\[TC-3\]\] \| [^|]+ \| `SKIP` \|/);
  await expect.poll(() => raw(page)).toMatch(/^fim: /m);
});
