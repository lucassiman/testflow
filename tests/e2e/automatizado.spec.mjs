// Relatório automatizado (Playwright JSON) anexado a uma execução: ao lado dos manuais, sem misturar; e execução só automatizada.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

const tc = (id, title) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: ${title}\napp: Portal\ntags: [regressao]\n---\n\n# ${id} — ${title}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n`;
const report = (name) => ({
  name,
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({
    config: {}, stats: { startTime: '2026-10-06T10:00:00Z', duration: 2100 },
    suites: [{ title: 'login.spec.ts', file: 'login.spec.ts', specs: [
      { title: 'login @TC-1', file: 'login.spec.ts', line: 3, tests: [{ projectName: 'chromium', results: [{ status: 'passed', duration: 1200 }] }] },
      { title: 'cadastro TC-2', file: 'login.spec.ts', line: 9, tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 900, error: { message: 'boom' } }] }] },
    ] }],
  })),
});

test('relatório automatizado na execução (mista) e execução só automatizada', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(wsInit, 'ws-auto-exec');
  await openEditor(page, { mode: 'split', prefs: { publisherName: 'Lucas', automationRootAsked: true } });
  await page.evaluate(async ([a, b]) => {
    await window.__write('aplicacoes/Portal/casos/TC-1.md', a);
    await window.__write('aplicacoes/Portal/casos/TC-2.md', b);
  }, [tc('TC-1', 'Login'), tc('TC-2', 'Cadastro')]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(2);

  // 1) rodada avulsa com os dois casos manuais
  await page.click('button[data-menu="newMenu"]');
  await page.click('#newMenu [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill('Mista');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  const panel = page.locator('#cyclePanel');
  await expect(panel.locator('.cp-item')).toHaveCount(2);
  await expect(panel.locator('.cp-auto')).toHaveCount(0);

  // 2) anexar o relatório Playwright: entra como seção própria e o painel mostra o bloco 🤖
  const chooser = page.waitForEvent('filechooser');
  await panel.locator('[data-cp="auto"]').click();
  await (await chooser).setFiles(report('resultado.json'));
  await expect.poll(() => raw(page)).toMatch(/^## Testes automatizados$/m);
  await expect(panel.locator('.cp-auto')).toContainText('1 PASS');
  await expect(panel.locator('.cp-auto')).toContainText('1 FAIL');
  await expect(panel.locator('.cp-item')).toHaveCount(2); // os manuais seguem pendentes, intactos
  expect(await raw(page)).toMatch(/\| Resultado \| Obs \|/);
  expect(await raw(page)).toMatch(/\| 1 \| \[\[TC-1\]\] \|[^|]*\|\s*\|\s*\|\s*\|/);

  // 3) finalizar: o resumo mostra o bloco automatizado separado (50%) e os manuais como SKIP
  await panel.locator('[data-cp="finish"]').click();
  await page.locator('.app-dialog button', { hasText: 'Finalizar e marcar SKIP' }).click();
  const rs = page.locator('.rs-dialog');
  await expect(rs.locator('.rs-auto')).toContainText('Playwright');
  await expect(rs.locator('.rs-auto .rs-rate')).toContainText('50%');
  await expect(rs.locator('.rs-auto')).toContainText('cadastro TC-2');
  await expect(rs.locator('.rs-skipped')).toContainText('TC-1');
  await page.keyboard.press('Escape');
  await expect.poll(() => raw(page)).toMatch(/\*\*Testes automatizados \(Playwright\):\*\*/);

  // 4) execução só automatizada
  await page.click('button[data-menu="newMenu"]');
  const chooser2 = page.waitForEvent('filechooser');
  await page.click('#newMenu [data-cmd="newAutoRun"]');
  await (await chooser2).setFiles(report('ci.json'));
  await expect(page.locator('#fileName')).toContainText('execucao-automatizada');
  await expect.poll(() => raw(page)).toMatch(/^tipo: execucao$/m);
  await expect.poll(() => raw(page)).toMatch(/^## Testes automatizados$/m);
  await expect.poll(() => raw(page)).toMatch(/^status: FAIL$/m);
  await expect(panel.locator('.cp-empty')).toBeVisible();
  await expect(panel.locator('.cp-auto')).toContainText('2 automatizados');
  await panel.locator('[data-cp="summary"]').click();
  await expect(page.locator('.rs-dialog .rs-auto')).toContainText('50%');
  await expect(page.locator('.rs-dialog .rs-tiles')).toHaveCount(1); // só o bloco automatizado
});
