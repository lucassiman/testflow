// 10.3 (1.26.0): tela inicial — rodada em andamento (▶ Continuar), pendências, fixados/recentes e atalhos.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const tc = (id, st) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\n---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | a | b | | ${st} |\n`;

test('tela inicial: aparece sem documento aberto, mostra pendências e a rodada, e some ao abrir um documento', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(wsInit, 'ws-home');
  await openEditor(page, { mode: 'preview', prefs: { home: true, publisherName: 'Lucas Siman' } });
  const home = page.locator('#home');
  await expect(home).toBeVisible();
  await expect(home).toContainText('Olá, Lucas');
  await expect(home).toContainText('Abra a pasta onde ficam seus documentos');
  await page.evaluate(async (files) => { for (const [p, t] of files) await window.__write(p, t); }, [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1', '`FAIL`')],
    ['aplicacoes/Portal/casos/TC-2.md', tc('TC-2', '')],
    ['aplicacoes/Portal/casos/TC-3.md', tc('TC-3', '`PASS`')],
  ]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(home).toContainText('3 documentos');
  await expect(home.locator('[data-home-search="status:FAIL"] .home-num')).toHaveText('1');
  await expect(home.locator('[data-home-search="execucao:nunca tipo:caso-de-teste"] .home-num')).toHaveText('1');

  // pendência → busca filtrada
  await home.locator('[data-home-search="status:FAIL"]').click();
  await expect(page.locator('[data-side="searchInput"]')).toHaveValue('status:FAIL');
  await expect(page.locator('[data-side="searchResults"]')).toContainText('TC-1');

  // nova rodada pelo atalho → o documento da execução abre (a tela some); Início mostra a rodada com ▶ Continuar
  await home.locator('[data-home-cmd="startRun"]').click();
  await page.click('.app-dialog button:has-text("Continuar")');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill('Sprint 9');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  await expect(home).toBeHidden();
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Início: rodada');
  await page.keyboard.press('Enter');
  await expect(home.locator('.home-round')).toContainText('Sprint 9');
  await expect(home.locator('.home-round')).toContainText('0/3 casos');
  await home.locator('[data-home="continue"]').click();
  await expect(home).toBeHidden();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await expect(page.locator('.runner .run-step')).toContainText('Passo 1');

  // o logo volta ao início; "ver o exemplo" abre o documento de exemplo
  await page.locator('.topbar .logo').click();
  await expect(home).toBeVisible();
  await home.locator('[data-home="example"]').click();
  await expect(home).toBeHidden();
  await expect(page.locator('#preview h1').first()).toContainText('Test Case: Login');
});
