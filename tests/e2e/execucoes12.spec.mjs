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

test('E3: execução nova nasce em execucoes/; as antigas (relatorios/) e os relatórios delas vão pelo 🗂 Mover', async ({ page }) => {
  const old = `---\ntipo: execucao\nid: EXEC-20261001-083000\ntitulo: Rodada antiga\napp: Portal\ninicio: 2026-10-01T08:30\nstatus: PASS\ntags: []\n---\n\n# Rodada antiga\n\n## Casos do ciclo\n\n| # | Caso | Título | Status | Quando | Bugs |\n| --- | --- | --- | --- | --- | --- |\n| 1 | [[TC-1]] | Caso TC-1 | PASS | 01/10 | |\n\n## Relatórios\n\n- 🏁 [[EXEC-20261001-083000-ENC]] — Encerramento\n`;
  const enc = '---\ntipo: relatorio-encerramento\nid: EXEC-20261001-083000-ENC\nexecucao: EXEC-20261001-083000\napp: Portal\n---\n\n# Encerramento\n\nDa [[EXEC-20261001-083000]].\n';
  await workspace(page, 'ws-e3', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1')],
    ['aplicacoes/Portal/relatorios/rodada-antiga.md', old],
    ['aplicacoes/Portal/relatorios/relatorios/EXEC-20261001-083000/01-encerramento.md', enc],
  ]);
  // rodada nova: em execucoes/ (a antiga em relatorios/ não puxa) e o aviso oferece mover as antigas
  await newRun(page, 'Rodada nova');
  await expect.poll(() => page.evaluate(() => window.__ls('aplicacoes/Portal/execucoes'))).toEqual(['rodada-nova.md']);
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Mover execuções para execucoes');
  await page.keyboard.press('Enter');
  const dlg = page.locator('.app-dialog', { hasText: 'Mover execuções para execucoes/' });
  await expect(dlg).toContainText('aplicacoes/Portal/execucoes/ — 1 documento(s)');
  await expect(dlg).toContainText('aplicacoes/Portal/relatorios/EXEC-20261001-083000/ — 1 documento(s)');
  await dlg.locator('button', { hasText: 'Mover' }).click();
  await expect.poll(() => page.evaluate(() => window.__ls('aplicacoes/Portal/execucoes'))).toEqual(['rodada-antiga.md', 'rodada-nova.md']);
  await expect.poll(() => page.evaluate(() => window.__ls('aplicacoes/Portal/relatorios/EXEC-20261001-083000'))).toEqual(['01-encerramento.md']);
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/relatorios/rodada-antiga.md'))).toBeNull();
});
