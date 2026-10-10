// 11.2 (1.39.0): aprovação do caso — pílula no topo, enviar para revisão, aprovar, alterado depois de aprovado e
// a rodada "só aprovados".
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const tc = (id, ap) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\n${ap ? `aprovacao: ${ap}\n` : ''}---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n`;

test('aprovação: rascunho → em revisão → aprovado; mudar o passo pede de novo; rodada só com aprovados', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-aprovacao');
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true, publisherName: 'Lucas' } });
  await page.evaluate(async ([a, b]) => {
    await window.__write('aplicacoes/Portal/casos/TC-1.md', a);
    await window.__write('aplicacoes/Portal/casos/TC-2.md', b);
  }, [tc('TC-1', 'rascunho'), tc('TC-2', '')]);
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).first().click();
  const pill = page.locator('#docState [data-state="approval"]');
  await expect(pill).toContainText('em elaboração');

  // enviar para revisão (com o revisor)
  await pill.click();
  await page.locator('.cmd-menu .cmd-item', { hasText: 'Enviar para revisão' }).click();
  await page.locator('.app-dialog-field input').fill('Ana');
  await page.locator('.app-dialog-foot button', { hasText: 'Enviar para revisão' }).click();
  await expect(pill).toContainText('em revisão');
  await expect(pill).toHaveAttribute('title', /Ana/);

  // aprovar
  await pill.click();
  await page.locator('.cmd-menu .cmd-item', { hasText: 'grava quem e quando' }).first().click();
  await expect(pill).toContainText('aprovado');
  await expect(pill).toHaveAttribute('title', /Lucas/);

  // executar não muda a aprovação
  await page.locator('.exec-bar [data-act="run"]').click();
  await page.keyboard.press('1');
  await page.locator('.runner [data-act="finish"]').click();
  await expect(pill).toContainText('aprovado');
  await expect(pill).not.toContainText('alterado');

  // mudar o passo: aprovado · alterado
  await page.locator('#preview td', { hasText: /^Abre$/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' a tela inicial');
  await page.keyboard.press('Control+Enter');
  await expect(pill).toContainText('alterado');
  await pill.click();
  await page.locator('.cmd-menu .cmd-item', { hasText: 'Aprovar de novo' }).click();
  await expect(pill).not.toContainText('alterado');
  await page.keyboard.press('Control+s');

  // rodada nova com "só aprovados": TC-2 (sem aprovação) some da lista
  await page.click('button[data-menu="newMenu"]');
  await page.click('#newMenu [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await expect(picker.locator('.cpk-item')).toHaveCount(2);
  await expect(picker.locator('.cpk-item', { hasText: 'TC-1' }).locator('.cpk-ap')).toHaveText('✅');
  await picker.locator('[data-cpk="approved"]').check();
  await expect(picker.locator('.cpk-item')).toHaveCount(1);
  await expect(picker.locator('.cpk-item')).toContainText('TC-1');
  await picker.locator('[data-act="close"]').first().click();
  // a preferência fica lembrada
  await page.click('button[data-menu="newMenu"]');
  await page.click('#newMenu [data-cmd="newRun"]');
  await expect(page.locator('.cpk-dialog [data-cpk="approved"]')).toBeChecked();
  await expect(page.locator('.cpk-dialog .cpk-item')).toHaveCount(1);
});
