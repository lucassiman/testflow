// 1.68.0: 🎯 Teste de confirmação do bug — execução só do bug, passos do bug no executor, PASS pergunta se fecha;
// o reteste das falhas traz a confirmação dos bugs ligados a elas, antes dos casos.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const tc = (id) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\n---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir ${id} | Aberto | | |\n`;
const bug = '---\ntipo: bug\nid: BUG-3\ntitulo: Envio falha\napp: Portal\nstatus: FAIL\nseveridade: Alta\n---\n\n# BUG-3 — Envio falha\n\n## Resumo\n\nVisto em [[TC-2]].\n\n## Passos para reproduzir\n\n1. Abrir o cadastro\n2. Clicar em Enviar\n\n## Resultado esperado\n\nMensagem "Enviado"\n\n## Resultado obtido\n\nErro 500\n\n## Evidências\n\n';
const raw = (page) => page.evaluate(() => /** @type {HTMLTextAreaElement} */ (document.querySelector('#raw')).value);

async function setup(page, name, extra = []) {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'split', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async ([files]) => { for (const [p, t] of files) await window.__write(p, t); }, [[
    ['aplicacoes/Portal/casos/TC-2.md', tc('TC-2')],
    ['aplicacoes/Portal/bugs/BUG-3.md', bug],
    ...extra,
  ]]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
}

test('🎯 no bug: execução só dele, os passos do bug no executor, PASS fecha o bug com o OK', async ({ page }) => {
  await setup(page, 'ws-confirma');
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'BUG-3' }).first().click();
  await expect(page.locator('#fileName')).toContainText('BUG-3');
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="confirmBug"]');
  // o bug ganhou a tabela e já está executando
  await expect(page.locator('.runner')).toBeVisible({ timeout: 10_000 });
  expect(await raw(page)).toMatch(/## Teste de confirmação[^]*\| 2 \| Clicar em Enviar \| Mensagem "Enviado" \|/);
  await expect(page.locator('#cyclePanel .cp-item')).toHaveCount(1);
  await expect(page.locator('#cyclePanel .cp-confirm')).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('1');
  await page.locator('.runner [data-act="finish"]').click();
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Fechar o bug agora');
  await dlg.locator('button', { hasText: 'Fechar o bug' }).click();
  // era o único: volta para a execução, com o bug confirmado
  await expect(page.locator('#fileName')).toContainText('confirmacao-do-bug-3', { timeout: 10_000 });
  await expect.poll(() => raw(page)).toMatch(/## Confirmação de bugs[^]*\| 1 \| \[\[BUG-3\]\] \| Envio falha \| `PASS` \| \d\d\/\d\d\/\d{4} \d\d:\d\d \| \[\[TC-2\]\] \|/);
  expect(await raw(page)).toMatch(/^tags: \[[^\]]*confirmacao\]$/m);
  expect(await raw(page)).not.toContain('## Casos do ciclo');
  const saved = await page.evaluate(() => window.__read('aplicacoes/Portal/bugs/BUG-3.md'));
  expect(saved).toMatch(/^status: PASS$/m);
  expect(saved).toMatch(/## Andamento\n\n- \d\d\/\d\d\/\d{4} \d\d:\d\d — ✅ Teste de confirmação `PASS` em \[\[EXEC-[\d-]+\]\]: corrigido — bug fechado\./);
  expect(saved).toMatch(/## Histórico de execuções/);
});

test('reteste das falhas: a confirmação do bug da falha vem antes da regressão (e dá para desmarcar)', async ({ page }) => {
  const exec = '---\ntipo: execucao\nid: EXEC-20261009-100000\ntitulo: Regressão Portal\napp: Portal\ninicio: 2026-10-09 10:00\nfim: 2026-10-09 11:00\nstatus: FAIL\ntags: [regressao]\nqa-md: 1\n---\n\n# Regressão Portal\n\n## Casos do ciclo\n\n| # | Caso | Título | Status | Executado em | Bugs |\n| --- | --- | --- | --- | --- | --- |\n| 1 | [[TC-2]] | Caso TC-2 | `FAIL` | 09/10/2026 10:20 | [[BUG-3]] |\n\n## Encerramento\n\nFinalizada.\n';
  await setup(page, 'ws-confirma-reteste', [['aplicacoes/Portal/execucoes/regressao-portal.md', exec]]);
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'regressao-portal' }).first().click();
  await page.locator('#cyclePanel [data-cp="retest"]').click();
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Os testes de confirmação dos bugs vêm antes da regressão');
  await expect(dlg.locator('label', { hasText: 'Confirmação dos bugs (1)' }).locator('input')).toBeChecked();
  await expect(dlg.locator('label', { hasText: 'Regressão: os casos que falharam' }).locator('input')).toBeChecked();
  await dlg.locator('button', { hasText: 'Criar reteste (1)' }).click();
  await expect(page.locator('#fileName')).toContainText('regressao-portal-reteste', { timeout: 10_000 });
  const text = await raw(page);
  expect(text).toMatch(/## Confirmação de bugs[^]*\| 1 \| \[\[BUG-3\]\] \| Envio falha \|  \|  \| \[\[TC-2\]\] \|[^]*## Casos do ciclo[^]*\[\[TC-2\]\]/);
  await expect(page.locator('#cyclePanel .cp-item')).toHaveCount(2);
  // ▶ Próximo caso começa pelo bug
  await page.locator('.exec-bar [data-act="cycleNext"]').click();
  await expect(page.locator('#fileName')).toContainText('BUG-3');
  await expect(page.locator('.runner')).toBeVisible();
});
