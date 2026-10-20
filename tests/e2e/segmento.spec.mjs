// Segmentos: reunir tudo o que nasceu de um épico/ticket/execução, herança do pai para o filho e a pasta do épico.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

const C = 'aplicacoes/Portal/casos';
const E = `${C}/PORTAL-10 Pagamentos`;
const files = [
  [`${E}/PORTAL-10.md`, '---\ntipo: epico\nid: PORTAL-10\ntitulo: Pagamentos\napp: Portal\nsprint: Sprint 7\ntags: [pagamentos]\n---\n\n# PORTAL-10 — Pagamentos\n'],
  [`${E}/PORTAL-120/PORTAL-120.md`, '---\ntipo: historia\nid: PORTAL-120\ntitulo: Pix\napp: Portal\nepico: PORTAL-10\ntags: [pix]\n---\n\n# PORTAL-120 — Pix\n'],
  [`${E}/PORTAL-120/TC-1.md`, '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Pix aprovado\napp: Portal\njira: PORTAL-120\nepico: PORTAL-10\ntags: [pix]\n---\n\n# TC-1 — Pix aprovado\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Pagar | Pago | | |\n'],
  ['aplicacoes/Portal/bugs/BUG-1.md', '---\ntipo: bug\nid: BUG-1\ntitulo: QR some\nstatus: FAIL\n---\n\n# BUG-1\n\nEncontrado em [[TC-1]].\n'],
  [`${C}/TC-9.md`, '---\ntipo: caso-de-teste\nid: TC-9\ntitulo: Outro\napp: Portal\n---\n\n# TC-9\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | a | b | | |\n'],
];

test('segmento do épico: reunir pela árvore, caso novo na pasta do ticket herda do pai, rodada pelo épico herda', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-segmento');
  await openEditor(page, { mode: 'preview', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(p, t); }, files);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(files.length);

  // 🧩 Reunir o segmento pela pasta do épico
  await page.locator(`[data-folder="${E}/"]`).click({ button: 'right' });
  await page.locator('.side-menu [data-menu-act="segment"]').click();
  await expect(page.locator('[data-side="searchInput"]')).toHaveValue('seg:PORTAL-10');
  const results = page.locator('[data-side="searchResults"]');
  await expect(results.locator('.side-hit-doc')).toHaveCount(4);
  for (const id of ['PORTAL-10', 'PORTAL-120', 'TC-1', 'BUG-1']) await expect(results).toContainText(id);
  await expect(results).not.toContainText('TC-9');

  // caso novo dentro da pasta do ticket: jira, épico, tags e sprint vêm dos pais
  await page.locator('.side-tabs [data-tab="files"]').click();
  await page.locator(`[data-folder="${E}/PORTAL-120/"]`).click({ button: 'right' });
  await page.locator('.side-menu [data-menu-act="newHere"]').click();
  await page.keyboard.type('Caso de teste');
  await page.keyboard.press('Enter');
  await expect(page.locator('#fileName')).toContainText('TC-');
  const novo = await raw(page);
  expect(novo).toMatch(/^jira: PORTAL-120$/m);
  expect(novo).toMatch(/^epico: PORTAL-10$/m);
  expect(novo).toMatch(/^sprint: Sprint 7$/m);
  expect(novo).toMatch(/^tags: \[.*pix.*\]$/m);
  expect(novo).toMatch(/^tags: \[.*pagamentos.*\]$/m);

  // rodada pelo atalho do épico: a execução herda o épico e a tag em comum
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="startRun"]');
  await page.click('.app-dialog button:has-text("Continuar")');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('.cpk-chip', { hasText: '📚 PORTAL-10' }).click();
  await expect(picker.locator('[data-cpk="count"]')).toContainText('2 de 3');
  await picker.locator('[data-cpk="name"]').fill('Pagamentos');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  // bug aberto ligado aos casos: a janela 🎯 sugere a confirmação — aqui, sem ela
  await page.locator('.app-dialog button', { hasText: 'Sem confirmações' }).click();
  await expect(page.locator('#cyclePanel .cp-item')).toHaveCount(2);
  await expect(page.locator('#fileName')).toContainText('pagamentos');
  const exec = await raw(page);
  expect(exec).toMatch(/^tipo: execucao$/m);
  expect(exec).toMatch(/^epico: \[?PORTAL-10\]?$/m);
  expect(exec).toMatch(/^tags: \[regressao, pix\]$/m);
});
