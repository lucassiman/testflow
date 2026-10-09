// 10.3 (1.24.0): árvore com ID · título e bolinha de status, Recentes recolhido com pasta aberta, menos avisos de rotina.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const tc = (id, titulo, st) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: ${titulo}\napp: Portal\n---\n\n# ${id} — ${titulo}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | a | b | | ${st} |\n`;

test('árvore: ID · título e status; nome do arquivo na dica; alterna pela paleta; sem aviso "Aberto"', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-interface1');
  await openEditor(page, { mode: 'preview', prefs: { treeLabels: 'titulo' } });
  await page.evaluate(async (files) => { for (const [p, t] of files) await window.__write(p, t); }, [
    ['aplicacoes/Portal/casos/TC-002-login-usuario-bloqueado-com-nome-longo.md', tc('TC-002', 'Login bloqueado', '`FAIL`')],
    ['aplicacoes/Portal/casos/TC-003-recuperar.md', tc('TC-003', 'Recuperar senha', '')],
    ['aplicacoes/Portal/docs/nota.md', '# Só uma nota\n'],
  ]);
  await expect(page.locator('.side-recents')).not.toHaveClass(/collapsed/);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const tree = page.locator('[data-side="wsList"]');
  const tc2 = tree.locator('.side-file[data-ws-path$="TC-002-login-usuario-bloqueado-com-nome-longo.md"]');
  await expect(tc2.locator('.side-id')).toHaveText('TC-002');
  await expect(tc2).toContainText('Login bloqueado');
  await expect(tc2.locator('.side-dot-fail')).toHaveCount(1);
  await expect(tc2).toHaveAttribute('title', /TC-002 — Login bloqueado \(FAIL\)\naplicacoes\/Portal\/casos\/TC-002-login/);
  await expect(tree.locator('.side-file[data-ws-path$="TC-003-recuperar.md"] .side-dot-pending')).toHaveCount(1);
  await expect(tree.locator('.side-file[data-ws-path$="nota.md"]')).toContainText('nota'); // sem cabeçalho: nome do arquivo
  // com pasta aberta, Recentes recolhe sozinho (a árvore ganha o espaço)
  await expect(page.locator('.side-recents')).toHaveClass(/collapsed/);

  await tc2.click();
  await expect(page.locator('#fileName')).toContainText('TC-002');
  await page.waitForTimeout(400);
  await expect(page.locator('#toast')).not.toContainText('Aberto:');

  // salvar com outro status: a bolinha acompanha
  await page.locator('#preview td.status-cell').first().click();
  await page.keyboard.press('1');
  await page.keyboard.press('Control+s');
  await expect(tc2.locator('.side-dot-pass')).toHaveCount(1);

  // paleta: voltar ao nome do arquivo
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+P');
  await expect(page.locator('.cmd-item.active')).toBeVisible();
  await page.keyboard.type('Árvore: mostrar');
  await page.keyboard.press('Enter');
  await expect(tc2.locator('.side-name')).toHaveText(/TC-002-login-usuario-bloqueado-com-nome-longo/);
});
