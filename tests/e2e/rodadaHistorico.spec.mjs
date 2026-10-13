// Rodada com casos que já têm Histórico de execuções: ✓ Concluir abre o próximo caso no passo a executar
// (não no histórico do fim do documento), e reabrir um caso concluído também não cai no histórico.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const history = (id) => `\n## Histórico de execuções\n\n${[3, 2, 1].map((n) => `### Rodada ${n} — 0${n}/10/2026 10:00 — \`PASS\`\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n${Array.from({ length: 6 }, (_, k) => `| ${k + 1} | Passo antigo ${k + 1} do ${id} | ok | ok | \`PASS\` |`).join('\n')}\n`).join('\n')}`;
const tc = (id) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\n---\n\n# ${id} — Caso ${id}\n\n## Objetivo\n\n${'Texto do objetivo para ocupar espaço na tela. '.repeat(8)}\n\n## Passos\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir a tela do ${id} | Tela aberta | | |\n| 2 | Preencher o formulário do ${id} | Aceita | | |\n| 3 | Salvar o ${id} | Salvo | | |\n${history(id)}`;

/** O passo atual (linha destacada) está na tela e o título do histórico não. */
async function onTheStep(page) {
  await expect(page.locator('#preview tr.run-current')).toHaveCount(1);
  await page.waitForTimeout(400); // depois de qualquer rolagem atrasada (posição lembrada etc.)
  const pane = await page.locator('#previewPane').boundingBox();
  const row = await page.locator('#preview tr.run-current').boundingBox();
  expect(row.y).toBeGreaterThanOrEqual(pane.y - 1);
  expect(row.y + row.height).toBeLessThanOrEqual(pane.y + pane.height + 1);
  const hist = await page.locator('#preview h2', { hasText: 'Histórico de execuções' }).boundingBox();
  expect(hist.y).toBeGreaterThan(pane.y + pane.height * 0.5); // histórico fica abaixo, não no topo da tela
}

test('rodada com histórico: Concluir leva ao próximo caso no passo, não no histórico', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(wsInit, 'ws-rodada-historico');
  await openEditor(page, { mode: 'preview', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async ([a, b]) => {
    await window.__write('aplicacoes/Portal/casos/TC-1.md', a);
    await window.__write('aplicacoes/Portal/casos/TC-2.md', b);
  }, [tc('TC-1'), tc('TC-2')]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(2);
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="startRun"]');
  await page.click('.app-dialog button:has-text("Continuar")');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill('Regressão');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  const panel = page.locator('#cyclePanel');
  await panel.locator('.cp-item', { hasText: 'TC-1' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await expect(page.locator('.runner .run-step')).toContainText('Passo 1');
  await onTheStep(page);

  for (let i = 0; i < 3; i++) await page.keyboard.press('1');
  await page.locator('.runner button', { hasText: 'Concluir' }).first().click();
  await expect(page.locator('#fileName')).toContainText('TC-2', { timeout: 10_000 });
  await expect(page.locator('.runner .run-step')).toContainText('Passo 1');
  await onTheStep(page);

  // voltar ao TC-1 (revisão): também abre no passo, não no histórico
  await panel.locator('.cp-item', { hasText: 'TC-1' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await expect(page.locator('#preview tr.run-current')).toHaveCount(1);
  await onTheStep(page);
});
