// 11.2 (1.42.0): importação em massa — Novo ▾ → Casos de uma planilha → prévia → um documento por caso → desfazer.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const CSV = `ID,Title,Section,Section Hierarchy,Priority,Preconditions,Steps (Step),Steps (Expected Result),References
C101,Login com senha válida,Login,Portal > Login,High,Usuário ativo,Abrir /login,Tela de login,PORTAL-120
,,,,,,Entrar,Painel,
C102,Login bloqueado,Login,Portal > Login,Critical,,Errar a senha 3 vezes,Conta bloqueada,PORTAL-121
`;

test('importar casos do TestRail: prévia, cria TC-… por seção, pula já importados, desfazer', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-importar');
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true } });
  await page.evaluate(async () => { await window.__write('aplicacoes/Portal/casos/TC-007.md', '---\ntipo: caso-de-teste\nid: TC-007\ntitulo: Já existe\napp: Portal\n---\n\n# TC-007\n'); });
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-007' })).toBeVisible();
  const pick = async () => {
    await page.click('button[data-menu="newMenu"]');
    const chooser = page.waitForEvent('filechooser');
    await page.click('#newMenu [data-cmd="importCases"]');
    await (await chooser).setFiles({ name: 'testrail.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  };
  await pick();
  const dlg = page.locator('.imp-dialog');
  await expect(dlg.locator('.imp-sum')).toContainText('2 caso(s) com 3 passo(s) — formato TestRail');
  await expect(dlg.locator('.imp-list li').first()).toContainText('Login com senha válida');
  await expect(dlg.locator('[data-i="app"]')).toHaveValue('Portal');
  await dlg.locator('[data-act="ok"]').click();
  await expect(page.locator('#toast')).toContainText('2 caso(s) importado(s)');
  const files = () => page.evaluate(async () => (await window.__ls('aplicacoes/Portal/casos/portal/login')) || []);
  await expect.poll(files).toHaveLength(2);
  const names = await files();
  expect(names[0]).toMatch(/^TC-008-login-com-senha-valida\.md$/);
  const text = await page.evaluate((n) => window.__read(`aplicacoes/Portal/casos/portal/login/${n}`), names[0]);
  expect(text).toMatch(/^importado-de: TestRail C101$/m);
  expect(text).toMatch(/\| 2 \| Entrar \| Painel \| \| \|/);
  // de novo: os dois já foram importados
  await pick();
  await expect(dlg.locator('.imp-sum')).toContainText('2 já foram importados antes');
  await expect(dlg.locator('[data-i="skip"]')).toBeChecked();
  await dlg.locator('[data-act="close"]').first().click();
  // importa de novo (sem pular, tudo em casos/) e desfaz
  await pick();
  await dlg.locator('[data-i="skip"]').uncheck();
  await dlg.locator('[data-i="layout"]').selectOption('casos');
  await dlg.locator('[data-act="ok"]').click();
  await expect(page.locator('#toast')).toContainText('2 caso(s) importado(s)');
  await expect.poll(async () => (await page.evaluate(async () => (await window.__ls('aplicacoes/Portal/casos')) || [])).filter((n) => /^TC-01[01]/.test(n)).length).toBe(2);
  await page.locator('#toast button', { hasText: 'Desfazer' }).click();
  await expect.poll(async () => (await page.evaluate(async () => (await window.__ls('aplicacoes/Portal/casos')) || [])).filter((n) => /^TC-01[01]/.test(n)).length).toBe(0);
});
