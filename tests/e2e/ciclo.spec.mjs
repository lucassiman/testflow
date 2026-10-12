// Ciclo (definição salva) × execuções (#1, #2…), pular caso e executar de novo.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit, roundMore } from './helpers.mjs';

const tc = (id, title) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: ${title}\napp: Portal\ntags: [regressao]\n---\n\n# ${id} — ${title}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n| 2 | Enviar | Envia | | |\n`;

test('ciclo salvo: executar duas vezes, pular caso, finalizar e ver o histórico no ciclo', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(wsInit, 'ws-ciclo-def');
  await openEditor(page, { mode: 'split', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async ([a, b, c]) => {
    await window.__write('aplicacoes/Portal/casos/TC-1.md', a);
    await window.__write('aplicacoes/Portal/casos/TC-2.md', b);
    await window.__write('aplicacoes/Portal/casos/TC-3.md', c);
  }, [tc('TC-1', 'Login'), tc('TC-2', 'Cadastro'), tc('TC-3', 'Relatório')]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(3);

  // 1) salvar o ciclo (definição), sem executar
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newCycle"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('.cpk-links summary').click();
  await picker.locator('[data-link="sprint"]').fill('Sprint 42');
  await picker.locator('[data-link="jira"]').fill('QA-7');
  await picker.locator('[data-cpk="name"]').fill('Regressão 2.5');
  await picker.locator('button', { hasText: 'Salvar ciclo' }).click();
  await expect(page.locator('#fileName')).toContainText('regressao-2-5');
  await expect.poll(() => raw(page)).toMatch(/^tipo: ciclo-regressao$/m);
  expect(await raw(page)).not.toMatch(/^inicio:/m);
  await expect.poll(() => raw(page)).toMatch(/^sprint: Sprint 42$/m);
  await expect.poll(() => raw(page)).toMatch(/^jira: \[QA-7\]$/m);
  await expect(page.locator('#cyclePanel')).toBeHidden();
  const pill = page.locator('#docState [data-state="cycledef"]');
  await expect(pill).toBeVisible();

  // 2) executar o ciclo: execução #1
  await pill.click();
  await expect(page.locator('#fileName')).toContainText('execucao-1');
  await expect.poll(() => raw(page)).toMatch(/^numero: 1$/m);
  await expect.poll(() => raw(page)).toMatch(/^ciclo: CICLO-/m);
  const panel = page.locator('#cyclePanel');
  await expect(panel.locator('.cp-item')).toHaveCount(3);

  // a execução herda os vínculos do ciclo; dá para editar pelo painel
  await expect.poll(() => raw(page)).toMatch(/^sprint: Sprint 42$/m);
  await expect(panel.locator('.cp-links')).toContainText('Sprint 42');
  await expect(panel.locator('.cp-links')).toContainText('QA-7');
  await roundMore(page, 'links');
  const lk = page.locator('.lk-dialog');
  await lk.locator('[data-link="sprint"]').fill('Sprint 43');
  await lk.locator('button', { hasText: 'Salvar vínculos' }).click();
  await expect.poll(() => raw(page)).toMatch(/^sprint: Sprint 43$/m);
  await expect(panel.locator('.cp-links')).toContainText('Sprint 43');

  // 3) pular o TC-3 sem abrir
  await panel.locator('.cp-skip[data-key="TC-3"]').click();
  await expect(panel.locator('.cp-item[data-key="TC-3"]')).toContainText('SKIP');

  // 4) executar TC-1 (PASS) e TC-2 (FAIL); ao terminar volta à execução
  await panel.locator('[data-cp="next"]').click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await expect(page.locator('.runner')).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('1');
  await page.locator('.runner [data-act="finish"]').click();
  await expect(page.locator('#fileName')).toContainText('TC-2');
  await expect(page.locator('.runner')).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await page.locator('.runner [data-act="finish"]').click();
  await expect(page.locator('#fileName')).toContainText('execucao-1');
  await expect.poll(() => raw(page)).toMatch(/\| 3 \| \[\[TC-3\]\] \| [^|]+ \| `SKIP` \|/);

  // 5) finalizar: resumo com 50% (1 PASS de 2 executados; o SKIP fica de fora)
  await panel.locator('[data-cp="finish"]').click();
  await page.locator('.app-dialog button', { hasText: 'Finalizar execução' }).click();
  const rs = page.locator('.rs-dialog');
  await expect(rs.locator('.rs-rate')).toContainText('50%');
  await expect(rs.locator('.rs-skipped')).toContainText('TC-3');
  await expect(rs.locator('.rs-links')).toContainText('Sprint 43');
  await page.keyboard.press('Escape');

  // 6) executar de novo: execução #2 do mesmo ciclo
  await panel.locator('[data-cp="again"]').click();
  await expect(page.locator('#fileName')).toContainText('execucao-2');
  await expect.poll(() => raw(page)).toMatch(/^numero: 2$/m);

  // a execução #2 começa limpa: a rodada do TC-1 da #1 vai para o Histórico (Rodada 1) e os passos voltam em branco
  await panel.locator('[data-cp="next"]').click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await expect(page.locator('.runner')).toBeVisible();
  await expect.poll(() => raw(page)).toMatch(/### Rodada 1/);

  // 7) o ciclo guarda o histórico das execuções
  await roundMore(page, 'def');
  await expect(page.locator('#fileName')).toContainText('regressao-2-5');
  await expect.poll(() => raw(page)).toMatch(/\| 1 \| \[\[EXEC-[^\]]+\]\] \| [^|]+ \| [^|]+ \| `FAIL` \| 50% \|/);
  await expect.poll(() => raw(page)).toMatch(/\| 2 \| \[\[EXEC-[^\]]+\]\] \| [^|]+ \| — \| em andamento \| — \|/);
});
