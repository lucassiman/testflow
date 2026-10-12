// 1.43.0: massa por ambiente — 🌐 no topo troca a massa; Preview, painel 🔑 e execução seguem; histórico registra o ambiente.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const COMP = `---\ntipo: compartilhado\nid: COMP-PORTAL\ntitulo: Logins\napp: Portal\nescopo: app\n---\n\n# COMP\n\n## Dados: Logins\n\n| Chave | E-mail | Senha |\n| --- | --- | --- |\n| admin | admin@loja.com | 123 |\n\n## Dados: Logins (hml)\n\n| Chave | E-mail | Senha |\n| --- | --- | --- |\n| admin | admin@hml.loja.com | Hml#1 |\n\n## Dados: Logins (prod)\n\n| Chave | E-mail | Senha |\n| --- | --- | --- |\n| admin | qa.prod@loja.com | Prd#9 |\n`;
const TC = `---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\nambiente: HML\n---\n\n# TC-1\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Entrar com {{admin.e-mail}} | Painel | | |\n`;

test('ambiente: começa pelo do cabeçalho, 🌐 troca a massa no Preview, no painel e na execução; histórico com o ambiente', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-ambientes');
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true } });
  await page.evaluate(async ([c, t]) => {
    await window.__write('aplicacoes/Portal/compartilhados/portal.md', c);
    await window.__write('aplicacoes/Portal/casos/TC-1.md', t);
  }, [COMP, TC]);
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).first().click();
  const chip = page.locator('#envChip');
  await expect(chip).toContainText('HML');
  const prev = page.locator('#preview');
  await expect(prev.locator('.sh-var')).toHaveText('admin@hml.loja.com');

  await chip.click();
  await page.locator('.cmd-menu .cmd-item', { hasText: 'PROD' }).click();
  await expect(chip).toContainText('PROD');
  await expect(chip).toHaveClass(/env-prod/);
  await expect(prev.locator('.sh-var')).toHaveText('qa.prod@loja.com');
  await page.keyboard.press('Alt+k');
  await expect(page.locator('#sharedPanel .sh-env')).toContainText('PROD');
  await expect(page.locator('#sharedPanel')).toContainText('qa.prod@loja.com');

  await page.locator('.exec-bar [data-act="run"]').click();
  const runner = page.locator('.runner');
  await expect(runner.locator('.run-env')).toContainText('PROD');
  await expect(runner.locator('.run-var').first()).toContainText('qa.prod@loja.com');
  await page.keyboard.press('1');
  await runner.locator('[data-act="finish"]').click();
  await expect(prev.locator('td', { hasText: /^PROD$/ })).toHaveCount(1);

  // voltar ao do cabeçalho
  await chip.click();
  await page.locator('.cmd-menu .cmd-item', { hasText: 'Usar o do cabeçalho' }).click();
  await expect(chip).toContainText('HML');
  await expect(prev.locator('.sh-var')).toHaveText('admin@hml.loja.com');
});

test('compartilhado: 🌐 → preparar a massa por ambiente cria as seções em branco', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-ambientes-prep');
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true } });
  await page.evaluate(async (c) => { await window.__write('aplicacoes/Portal/compartilhados/portal.md', c); }, COMP.replace(/\n## Dados: Logins \(hml\)[\s\S]*$/, '\n'));
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'portal' }).first().click();
  await expect(page.locator('#preview h2', { hasText: 'Dados: Logins' }).first()).toBeVisible(); // o documento já abriu
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Ambiente ativo');
  await page.keyboard.press('Enter');
  await page.locator('.cmd-menu .cmd-item', { hasText: 'Preparar a massa' }).click();
  await page.locator('.app-dialog-foot button', { hasText: 'Criar as seções' }).click();
  await expect(page.locator('#toast')).toContainText('3 seção(ões) criada(s)');
  await expect(page.locator('#preview h2', { hasText: 'Dados: Logins (prod)' })).toHaveCount(1);
  await expect(page.locator('#preview h2', { hasText: 'Dados: Logins (local)' })).toHaveCount(0);
});
