// 10 (1.69.0): aba com o mesmo nome da árvore, filtro pelo nome do arquivo e pelo título, abertos em aba marcados na árvore.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const tc = (id, titulo, st) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: ${titulo}\napp: Portal\n---\n\n# ${id} — ${titulo}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | a | b | | ${st} |\n`;

test('aba igual à árvore; filtro por arquivo e por título; aberto em aba marcado', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-abas-nome');
  await openEditor(page, { mode: 'preview', prefs: { treeLabels: 'titulo' } });
  await page.evaluate(async (files) => { for (const [p, t] of files) await window.__write(p, t); }, [
    ['aplicacoes/Portal/casos/login-bloqueado-v2.md', tc('TC-002', 'Login bloqueado', '`FAIL`')],
    ['aplicacoes/Portal/casos/recuperar.md', tc('TC-003', 'Recuperar senha', '')],
    ['aplicacoes/Portal/docs/nota.md', '# Só uma nota\n'],
  ]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const tree = page.locator('[data-side="wsList"]');
  const tc2 = tree.locator('.side-file[data-ws-path$="login-bloqueado-v2.md"]');
  const tc3 = tree.locator('.side-file[data-ws-path$="recuperar.md"]');
  await expect(tc2.locator('.side-id')).toHaveText('TC-002');

  // filtro: pelo nome do arquivo (mostra o .md embaixo) e pelo título
  const filter = page.locator('[data-side="filter"]');
  await filter.fill('bloqueado-v2');
  await expect(tc2.locator('.side-file-name')).toHaveText('login-bloqueado-v2');
  await expect(tc3).toHaveCount(0);
  await filter.fill('recuperar senha');
  await expect(tc3).toBeVisible();
  await expect(tc2).toHaveCount(0);
  await filter.fill('tc-002');
  await expect(tc2).toBeVisible();
  await filter.fill('');
  await expect(tc2.locator('.side-file-name')).toHaveCount(0);

  // abre dois: as abas mostram ID · título; o nome do arquivo fica na dica
  await tc2.click();
  await expect(page.locator('#fileName')).toContainText('login-bloqueado-v2');
  await tc3.click();
  const tabs = page.locator('#tabbar .tab');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0).locator('.side-id')).toHaveText('TC-002');
  await expect(tabs.nth(0)).toContainText('Login bloqueado');
  await expect(tabs.nth(0).locator('.side-dot-fail')).toHaveCount(1);
  await expect(tabs.nth(0)).toHaveAttribute('title', /TC-002 — Login bloqueado \(FAIL\)\n.*login-bloqueado-v2\.md/);
  await expect(tabs.nth(1)).toContainText('Recuperar senha');

  // árvore: o ativo é "current"; o outro aberto em aba ganha a marca
  await expect(tc3).toHaveClass(/current/);
  await expect(tc2).toHaveClass(/is-open/);
  await expect(tree.locator('.side-file[data-ws-path$="nota.md"]')).not.toHaveClass(/is-open/);

  // lista de todas as abas: o nome do arquivo embaixo
  await page.locator('#tabbar .tab-list').click();
  await expect(page.locator('.tab-menu .tab-file').first()).toHaveText('login-bloqueado-v2');
  await page.keyboard.press('Escape');

  // fechou a aba: a marca sai
  await tabs.nth(0).locator('.tab-close').click();
  await expect(tc2).not.toHaveClass(/is-open/);
});
