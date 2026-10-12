// 12.1 (1.58.0): painel da rodada e barra Execução com as ações principais à vista e o resto num ⋯ agrupado pelos
// módulos do topo; atalhos da tela inicial por módulo.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit, CASE, raw } from './helpers.mjs';

const tc = (id) => `---
tipo: caso-de-teste
id: ${id}
titulo: Caso ${id}
app: Portal
tags: [regressao]
---

# ${id}

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | Abrir | Abre | | |
`;

async function workspace(page, name, docs) {
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true, publisherName: 'Lucas' } });
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(p, t); }, docs);
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file').first()).toBeVisible();
}

async function newRun(page) {
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  await expect(page.locator('.cp-item').first()).toBeVisible();
}

test('painel da rodada: principais à vista, o resto no ⋯ por módulo; encerrada mostra reteste e relatórios', async ({ page }) => {
  await workspace(page, 'ws-modulos', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1')],
    ['aplicacoes/Portal/casos/TC-2.md', tc('TC-2')],
  ]);
  await newRun(page);
  const panel = page.locator('#cyclePanel');
  const foot = panel.locator('.cp-foot');
  // à vista: só o da hora
  await expect(foot.locator('[data-cp="finish"]')).toBeVisible();
  const visible = await foot.locator(':scope > .cp-btn').evaluateAll((bs) => bs.map((b) => b.getAttribute('data-cp')));
  expect(visible.filter((c) => !['next', 'cycle', 'summary', 'finish'].includes(c || ''))).toEqual([]);
  await expect(foot.locator('[data-cp="summary"]')).toBeVisible();
  await expect(panel.locator('[data-cp="assign"]')).toBeHidden();
  await expect(panel.locator('[data-cp="links"]')).toBeHidden();

  // ⋯: agrupado pelos módulos do topo
  const more = page.locator('#cpMore');
  await panel.locator('[data-menu="cpMore"]').click();
  await expect(more).toBeVisible();
  await expect(panel.locator('[data-menu="cpMore"]')).toHaveAttribute('aria-expanded', 'true');
  // com o documento da execução aberto, dispositivo e relatório automatizado (são dela) também aparecem
  await expect(more.locator('.menu-title')).toHaveText(['▶ Execução', '📋 Casos', '🤖 Automação']);
  await expect(more.locator('[data-cp="device"]')).toBeVisible();
  await expect(more.locator('[data-cp="auto"]')).toContainText('Anexar relatório');
  await expect(more.locator('[data-cp="assign"]')).toContainText('👥 Atribuir os casos');
  await expect(more.locator('[data-cp="reports"]')).toContainText('parciais até finalizar');
  await expect(more.locator('[data-cmd="trend"]')).toBeVisible();
  await expect(more.locator('[data-cmd="roundPage"]')).toBeVisible();
  await expect(more.locator('[data-cp="links"]')).toContainText('Vínculos da execução');
  // Esc fecha; escolher uma ação também
  await page.keyboard.press('Escape');
  await expect(more).toBeHidden();
  await panel.locator('[data-menu="cpMore"]').click();
  await more.locator('[data-cp="assign"]').click();
  await expect(more).toBeHidden();
  await expect(page.locator('.app-dialog')).toContainText('Atribuir os casos da rodada');
  await page.locator('.app-dialog-foot button', { hasText: 'Cancelar' }).click();

  // a mesma ação pela paleta (antes só existia no painel)
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Rodada: atribuir os casos');
  await expect(page.locator('.cmd-item.active')).toContainText('Rodada: atribuir os casos aos testadores');
  await page.keyboard.press('Escape');

  // encerrada: reteste, executar de novo (se tiver ciclo), como foi e relatórios ficam à vista
  await foot.locator('[data-cp="finish"]').click();
  await page.locator('.app-dialog button', { hasText: 'Finalizar e marcar SKIP' }).click();
  await expect(page.locator('.rs-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.rs-dialog')).toHaveCount(0);
  await expect(foot.locator('[data-cp="summary"]')).toContainText('Como foi');
  await expect(foot.locator('[data-cp="reports"]')).toBeVisible();
  await expect(foot.locator('[data-cp="finish"]')).toHaveCount(0);
  await panel.locator('[data-menu="cpMore"]').click();
  await expect(more.locator('[data-cp="assign"]')).toHaveCount(0);
  await expect(more.locator('[data-cmd="trend"]')).toBeVisible();
});

test('barra Execução: ⋯ com evidências, dados e Claude num caso; a ação roda e o menu fecha', async ({ page }) => {
  await openEditor(page, { mode: 'preview', doc: CASE });
  const bar = page.locator('.exec-bar');
  await expect(bar.locator('[data-act="run"]')).toBeVisible();
  await bar.locator('[data-menu="execMore"]').click();
  const more = page.locator('#execMore');
  await expect(more).toBeVisible();
  await expect(more.locator('.menu-title')).toHaveText(['📸 Evidências e bugs', '📋 Casos', '📤 Compartilhar']);
  await expect(more.locator('[data-cmd="capture"]')).toContainText('Ctrl+Alt+P');
  await expect(more.locator('[data-cmd="newBug"]')).toBeVisible();
  // o que já está à vista na barra não se repete
  await expect(more.locator('[data-cmd="nextCase"]')).toHaveCount(0);
  // fica inteiro na tela (não é cortado pela barra, que rola na horizontal)
  const box = await more.boundingBox();
  expect(box && box.height).toBeGreaterThan(200);
  expect(box && box.x + box.width).toBeLessThanOrEqual(1300);
  await more.locator('[data-cmd="sharedPanel"]').click();
  await expect(more).toBeHidden();
  await expect(page.locator('#sharedPanel')).toBeVisible();
});

test('barra Execução numa execução: ⋯ com relatórios, reteste, time e automação', async ({ page }) => {
  await workspace(page, 'ws-modulos-barra', [['aplicacoes/Portal/casos/TC-1.md', tc('TC-1')]]);
  await newRun(page);
  // "Criar e começar" deixa o documento da execução aberto
  await expect(page.locator('#cyclePanel [data-cp="cycle"]')).toHaveCount(0);
  await page.locator('.exec-bar [data-menu="execMore"]').click();
  const more = page.locator('#execMore');
  await expect(more.locator('.menu-title')).toHaveText(['▶ Execução', '📋 Casos', '🤖 Automação', '📤 Compartilhar']);
  for (const c of ['roundSummary', 'execReports', 'rerunFailed', 'assignRound', 'roundPage', 'attachAutomation']) await expect(more.locator(`[data-cmd="${c}"]`)).toBeVisible();
  await expect(more.locator('[data-cmd="copyClaude"][data-value="summary"]')).toBeVisible();
});

test('tela inicial: atalhos agrupados pelos módulos do topo; sem pasta, só os que não precisam dela', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-modulos-home');
  await openEditor(page, { mode: 'preview', prefs: { home: true } });
  const home = page.locator('#home');
  await expect(home).toBeVisible();
  const start = home.locator('.home-start');
  await expect(start.locator('.home-mod h3')).toHaveText(['📋 Casos', '▶ Execução', '📄 Arquivo']);
  await expect(start.locator('[data-home-cmd="openWorkspace"]')).toBeVisible();
  await expect(start.locator('[data-home-cmd="trend"]')).toHaveCount(0);
  // com a pasta aberta, aparecem os módulos que dependem dela
  await page.evaluate(() => window.__write('aplicacoes/Portal/casos/TC-1.md', '---\ntipo: caso-de-teste\nid: TC-1\n---\n\n# TC-1\n'));
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(home).toContainText('1 documentos');
  await expect(start.locator('.home-mod h3')).toHaveText(['📋 Casos', '▶ Execução', '🤖 Automação', '🏛 Publicar', '📄 Arquivo', '📂 Pasta de trabalho']);
  await expect(start.locator('.home-mod[aria-label="Execução"]').locator('[data-home-cmd]')).toHaveText(['▶ Rodada de execução…', '⏯ Executar um ciclo salvo…', '📈 Tendência entre rodadas', '🌐 Página da rodada para o time…']);
  await start.locator('[data-home-cmd="newCase"]').click();
  await expect(home).toBeHidden();
  await expect.poll(() => raw(page)).toMatch(/^tipo: caso-de-teste$/m);
});
