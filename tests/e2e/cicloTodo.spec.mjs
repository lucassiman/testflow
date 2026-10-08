// Documento sem passos (checklist) no ciclo: avaliado como um todo, sem quebrar a rodada.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

const tc = '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\ntags: [regressao]\n---\n\n# TC-1 — Login\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n';
const chk = '---\ntipo: checklist\nid: CHK-1\ntitulo: Checklist de release\napp: Portal\nstatus: PENDING\ntags: [regressao]\n---\n\n# CHK-1 — Checklist de release\n\n- [ ] Login ok\n- [ ] Logout ok\n';

test('checklist no ciclo: avaliado como um todo pelo painel; o resto da rodada segue', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(wsInit, 'ws-ciclo-todo');
  await openEditor(page, { mode: 'split', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async ([a, b]) => {
    await window.__write('aplicacoes/Portal/casos/TC-1.md', a);
    await window.__write('aplicacoes/Portal/checklists/CHK-1.md', b);
  }, [tc, chk]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(2);

  await page.click('button[data-menu="newMenu"]');
  await page.click('#newMenu [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await expect(picker.locator('.cpk-whole')).toHaveCount(1); // o checklist vem marcado "como um todo"
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill('Com checklist');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  const panel = page.locator('#cyclePanel');
  await expect(panel.locator('.cp-item')).toHaveCount(2);
  await expect(panel.locator('.cp-item[data-key="CHK-1"]')).toContainText('como um todo');

  // abre o checklist: não inicia o executor de passos; o painel pede o resultado do documento
  await panel.locator('.cp-item[data-key="CHK-1"]').click();
  await expect(page.locator('#fileName')).toContainText('CHK-1');
  await expect(page.locator('.runner')).toBeHidden();
  await expect(panel.locator('.cp-whole')).toContainText('0/2 itens marcados');
  await panel.locator('[data-cp="whole"][data-st="PASS"]').click();

  // segue para o próximo pendente (o caso normal); o checklist ficou PASS na lista
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await expect(panel.locator('.cp-item[data-key="CHK-1"]')).toContainText('PASS');
  await panel.locator('[data-cp="cycle"]').click();
  await expect(page.locator('#fileName')).toContainText('com-checklist');
  await expect.poll(() => raw(page)).toMatch(/\| 1 \| \[\[CHK-1\]\] \| [^|]+ \| `PASS` \| \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} \|/);

  // finalizar: o caso sem execução vira SKIP e a rodada fecha com 100% (1 PASS de 1)
  await panel.locator('[data-cp="finish"]').click();
  await page.locator('.app-dialog button', { hasText: 'Finalizar e marcar SKIP' }).click();
  await expect(page.locator('.rs-dialog .rs-rate')).toContainText('100%');
});
