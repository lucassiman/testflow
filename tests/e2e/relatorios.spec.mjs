// Fase 10.2: 🏁 Finalizar execução gera os 4 relatórios em relatorios/<EXEC-ID>/ e liga na execução; 📑 Relatórios regera
// mantendo o que o QA escreveu.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

const tc = (id, title, jira) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: ${title}\napp: Portal\njira: ${jira}\n---\n\n# ${id} — ${title}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n`;
const plan = '---\ntipo: plano-de-teste\nid: PT-1\ntitulo: Plano da sprint\napp: Portal\n---\n\n# PT-1\n\nEscopo: [[TC-1]], [[TC-2]].\n\n## Critérios de saída\n\n- [ ] Nenhum bug Crítico ou Alto aberto\n- [ ] 100% dos casos executados\n';

test('finalizar a rodada gera os 4 relatórios; regerar mantém o aceite escrito pelo QA', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-relatorios');
  await openEditor(page, { mode: 'preview', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async (files) => { for (const [p, t] of files) await window.__write(p, t); }, [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1', 'Login', 'QA-1')],
    ['aplicacoes/Portal/casos/TC-2.md', tc('TC-2', 'Cadastro', 'QA-2')],
    ['aplicacoes/Portal/planos/PT-1.md', plan],
  ]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(3);
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill('Sprint 7');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  const panel = page.locator('#cyclePanel');
  await panel.locator('.cp-item', { hasText: 'TC-1' }).click();
  await expect(page.locator('.runner .run-step')).toContainText('Passo 1');
  await page.keyboard.press('1');
  await page.locator('.runner button', { hasText: 'Concluir' }).first().click();
  await expect(page.locator('#fileName')).toContainText('TC-2', { timeout: 10_000 });
  await panel.locator('[data-cp="cycle"]').click();
  await panel.locator('[data-cp="finish"]').click();
  await page.locator('.app-dialog button', { hasText: 'Finalizar e marcar SKIP' }).click();
  await expect(page.locator('.rs-dialog')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('📑 4 relatório(s) em aplicacoes/Portal/planos/relatorios/EXEC-');

  const dir = await page.evaluate(async () => `aplicacoes/Portal/planos/relatorios/${(await window.__ls('aplicacoes/Portal/planos/relatorios'))[0]}`);
  expect(await page.evaluate((d) => window.__ls(d), dir)).toEqual(['01-encerramento.md', '02-defeitos.md', '03-rastreabilidade.md', '04-log-comparativo.md']);
  const enc = await page.evaluate((d) => window.__read(`${d}/01-encerramento.md`), dir);
  expect(enc).toContain('Do plano [[PT-1]]');
  expect(enc).toMatch(/\| 100% dos casos executados \| ≥ 100% executados \| 50% \(1\/2\) \| ❌ \|/);
  expect(enc).toMatch(/^recomendacao: NÃO LIBERAR$/m);
  const ras = await page.evaluate((d) => window.__read(`${d}/03-rastreabilidade.md`), dir);
  expect(ras).toMatch(/\| 🎫 QA-1 \| \[\[TC-1\]\] `PASS` \| 1 PASS \|/);
  // a execução ganhou a seção Relatórios com os links
  await page.keyboard.press('Escape');
  expect(await raw(page)).toMatch(/## Relatórios\n\nGerados em .*\n\n- 🏁 \[\[EXEC-\d{8}-\d{6}-ENC\]\] — Encerramento e Go\/No-Go/);

  // o QA preenche o aceite; regerar pelo painel mantém
  await page.evaluate(async (d) => {
    const t = await window.__read(`${d}/01-encerramento.md`);
    await window.__write(`${d}/01-encerramento.md`, t.replace('| Aprovado por | |', '| Aprovado por | Maria (PO) |'));
  }, dir);
  // (gravado por fora do app: o índice ainda tem o texto antigo — vale o do disco)
  await panel.locator('[data-cp="reports"]').click();
  await expect(page.locator('#toast')).toContainText('📑 4 relatório(s)');
  const again = await page.evaluate((d) => window.__read(`${d}/01-encerramento.md`), dir);
  expect(again).toContain('| Aprovado por | Maria (PO) |');
  // abre o encerramento pelo aviso
  await page.locator('#toast .toast-action', { hasText: 'Abrir o encerramento' }).click();
  await expect(page.locator('#fileName')).toContainText('01-encerramento');
  await expect(page.locator('#preview h1')).toContainText('Encerramento e Go/No-Go — Sprint 7');
});
