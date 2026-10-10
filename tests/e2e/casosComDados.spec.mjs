// 11.2 (1.38.0): caso com dados (data-driven) — {{dado}} no Preview, o painel de execução percorre as iterações,
// cada ✓ Concluir registra uma (coluna Dados) e a última fecha o caso.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const SHARED = `---\ntipo: compartilhado\nid: COMP-PORTAL\ntitulo: Logins do Portal\napp: Portal\nescopo: app\n---\n\n# COMP-PORTAL\n\n## Dados: Logins\n\n| Chave | E-mail | Senha | Perfil |\n| --- | --- | --- | --- |\n| admin | admin@loja.com | S3nha!Forte | Administrador |\n| cliente | cliente@loja.com | 123456 | Cliente |\n\n## Passos: Fazer login\n\nParâmetros: usuario\n\n| # | Ação | Resultado esperado |\n| --- | --- | --- |\n| 1 | Informar {{usuario.e-mail}} e a senha {{usuario.senha}} | Painel de {{usuario.perfil}} |\n`;
const TC = `---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Menu por perfil\napp: Portal\niterar: Logins\n---\n\n# TC-1\n\n## Passos\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | ↪ Fazer login (dado) | Logado | | |\n| 2 | Abrir o menu de {{dado.perfil}} | Menu do perfil | | |\n`;

test('caso com dados: {{dado}} varia por iteração; o painel executa admin e depois cliente; histórico com a coluna Dados', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(wsInit, 'ws-casos-dados');
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true, publisherName: 'Lucas' } });
  await page.evaluate(async ([s, a]) => {
    await window.__write('aplicacoes/Portal/compartilhados/portal.md', s);
    await window.__write('aplicacoes/Portal/casos/TC-1.md', a);
  }, [SHARED, TC]);
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).first().click();
  const prev = page.locator('#preview');
  await expect(prev.locator('.sh-inc')).toHaveText('↪ Fazer login · dado');
  const chip = prev.locator('.sh-iter');
  await expect(chip).toHaveText('🔁 perfil');
  await expect(chip).toHaveAttribute('title', /admin: Administrador[\s\S]*cliente: Cliente/);
  await expect(page.locator('#lintStatus')).toContainText('Sem avisos');

  // execução: 1ª iteração (admin)
  await page.locator('.exec-bar [data-act="run"]').click();
  const runner = page.locator('.runner');
  await expect(runner.locator('.run-iter')).toContainText('admin');
  await expect(runner.locator('.run-iter')).toContainText('1/2');
  await expect(runner.locator('.run-inc')).toContainText('admin@loja.com');
  await expect(runner.locator('[data-act="finish"]')).toHaveText('✓ Concluir iteração');
  await page.keyboard.press('1');
  await expect(runner.locator('.run-field').first()).toContainText('Administrador');
  await page.keyboard.press('2');
  await runner.locator('[data-act="finish"]').click();

  // 2ª iteração (cliente): tabela limpa, os dados mudaram
  await expect(runner.locator('.run-iter')).toContainText('cliente');
  await expect(runner.locator('.run-iter')).toContainText('2/2');
  await expect(runner.locator('.run-inc')).toContainText('cliente@loja.com');
  await expect(runner.locator('[data-act="finish"]')).toHaveText('✓ Concluir');
  await expect(prev.locator('h3', { hasText: 'Rodada 1' })).toContainText(/FAIL.*admin \(1\/2\)/);
  await expect(prev.locator('th', { hasText: /^Dados$/ })).toHaveCount(1);
  await page.keyboard.press('1');
  await page.keyboard.press('1');
  await runner.locator('[data-act="finish"]').click();
  await expect(runner).toBeHidden();
  await expect(prev.locator('td', { hasText: 'cliente (2/2)' })).toHaveCount(1);
  await expect(prev.locator('td', { hasText: 'admin (1/2)' })).toHaveCount(1);
  await expect(prev.locator('h3', { hasText: /Rodada/ })).toHaveCount(1); // a última iteração fica na tabela, como uma rodada comum
});
