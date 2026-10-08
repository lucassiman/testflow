// 1.2.0: próximo caso da pasta (depois de terminar) e uma pasta por ticket em casos/.
import { test, expect } from '@playwright/test';
import { openEditor, raw, setRaw, wsInit } from './helpers.mjs';

const T = 'aplicacoes/Portal/casos/PORTAL-7';
const tc = (id, st = ['', '']) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\njira: PORTAL-7\n---\n\n# ${id} — Caso ${id}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | ${st[0]} |\n| 2 | Enviar | Envia | | ${st[1]} |\n`;

test('próximo caso da pasta: pelo ✓ Concluir, marcando à mão, pela barra e por Alt+Shift+→', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(wsInit, 'ws-prox');
  await openEditor(page, { mode: 'split' });
  await page.evaluate(async ([T, a, b, c, d]) => {
    await window.__write(`${T}/TC-1.md`, a);
    await window.__write(`${T}/TC-2.md`, b); // já executado: é pulado
    await window.__write(`${T}/TC-3.md`, c);
    await window.__write(`${T}/TC-10.md`, d);
    await window.__write('aplicacoes/Portal/casos/OUTRO/TC-99.md', '---\ntipo: caso-de-teste\nid: TC-99\n---\n# TC-99\n');
  }, [T, tc('TC-1'), tc('TC-2', ['`PASS`', '`PASS`']), tc('TC-3'), tc('TC-10')]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"]').getByRole('button', { name: 'TC-1', exact: true }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1');

  // 1) ▶ Executar → ✓ Concluir: o aviso oferece o próximo não executado (TC-2 já foi)
  await page.locator('.exec-bar [data-act="run"]').click();
  await page.keyboard.press('1');
  await page.keyboard.press('1');
  await page.locator('.runner [data-act="finish"]').click();
  await expect(page.locator('#toast')).toContainText('TC-1: PASS');
  await expect(page.locator('#toast')).toContainText('Faltam 2 caso(s)');
  await page.locator('#toast .toast-action', { hasText: 'Próximo: TC-3' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-3');
  await expect(page.locator('.runner')).toBeVisible();
  // TC-1 foi salvo e a aba dele fechou
  await expect.poll(() => page.evaluate((T) => window.__read(`${T}/TC-1.md`), T)).toMatch(/## Histórico de execuções[\s\S]*\| 1 \| \d\d\//);
  await expect(page.locator('.tab')).toHaveCount(1);

  // 2) marcando à mão (painel fechado): no último passo, o aviso oferece o próximo
  await page.locator('.runner [data-act="close"]').click();
  await page.locator('#preview td.status-cell[data-row="0"]').click();
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await expect(page.locator('#toast')).toContainText('TC-3: FAIL');
  await expect(page.locator('#toast .toast-action')).toContainText('Próximo: TC-10');
  // 3) o botão da barra Execução faz o mesmo
  const next = page.locator('.exec-bar [data-act="caseNext"]');
  await expect(next).toContainText('Próximo caso: TC-10');
  await next.click();
  await expect(page.locator('#fileName')).toContainText('TC-10');
  await expect(page.locator('.runner')).toBeVisible();
  expect(await page.evaluate((T) => window.__read(`${T}/TC-3.md`), T)).toMatch(/\| 2 \| Enviar \| Envia \| +\| `FAIL` \|/);

  // 4) Alt+Shift+→ (sem terminar este): todos os outros já executados → abre o seguinte (dá a volta) e avisa
  await page.locator('.runner [data-act="close"]').click();
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await expect(page.locator('#toast')).toContainText('todos os casos desta pasta já foram executados');
  await expect(page.locator('.runner')).toBeHidden();
});

test('pasta por ticket: Ctrl+S sugere casos/<TICKET>/, organizar os soltos, novo aqui preenche jira:', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(wsInit, 'ws-ticket');
  await openEditor(page, { mode: 'split' });
  const c = (id, jira) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\njira: ${jira}\n---\n\n# ${id}\n\nVer [[TC-6]] e ![print](evidencias/p-${id}.png)\n`;
  await page.evaluate(async ([a, b, d]) => {
    await window.__write('_entrada/.keep', '');
    await window.__write('aplicacoes/Portal/casos/TC-5.md', a);
    await window.__write('aplicacoes/Portal/casos/TC-6.md', b);
    await window.__write('aplicacoes/Portal/casos/TC-7.md', d);
    await window.__write('aplicacoes/Portal/casos/evidencias/p-TC-5.png', 'PNG5');
    await window.__write('aplicacoes/Portal/casos/PORTAL-120 Pagamento Pix/.keep', '');
  }, [c('TC-5', 'PORTAL-9'), c('TC-6', '[PORTAL-120]'), c('TC-7', '')]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const tree = page.locator('[data-side="wsList"]');
  await expect(tree.locator('.side-file', { hasText: 'TC-5' })).toBeVisible();
  const dlg = page.locator('.app-dialog');

  // organizar os soltos (clique direito em casos/)
  await tree.locator('[data-folder="aplicacoes/Portal/casos/"]').click({ button: 'right' });
  await page.locator('.side-menu [data-menu-act="byTicket"]').click();
  await expect(dlg).toContainText('2 documento(s)');
  await expect(dlg).toContainText('aplicacoes/Portal/casos/PORTAL-9/ — 1 documento(s) (pasta nova)');
  await expect(dlg).toContainText('aplicacoes/Portal/casos/PORTAL-120 Pagamento Pix/ — 1 documento(s)');
  await dlg.locator('button', { hasText: 'Organizar' }).click();
  await expect(page.locator('#toast')).toContainText('2 documento(s) organizados em 2 pasta(s) de épico/ticket');
  await expect.poll(() => page.evaluate(() => window.__read('aplicacoes/Portal/casos/PORTAL-9/TC-5.md'))).toContain('# TC-5');
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/casos/PORTAL-9/evidencias/p-TC-5.png'))).toBe('PNG5');
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/casos/PORTAL-120 Pagamento Pix/TC-6.md'))).toContain('# TC-6');
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/casos/TC-5.md'))).toBeNull();
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/casos/TC-7.md'))).toContain('# TC-7'); // sem jira: fica

  // documento novo com jira: → Ctrl+S sugere a pasta do ticket
  await page.keyboard.press('Alt+n');
  await setRaw(page, '---\ntipo: caso-de-teste\nid: TC-8\ntitulo: Pix expirado\napp: Portal\njira: PORTAL-120\n---\n\n# TC-8 — Pix expirado\n');
  await page.keyboard.press('Control+s');
  await expect(dlg).toContainText('Salvar na pasta de trabalho');
  await expect(dlg).toContainText('jira: PORTAL-120');
  await expect(dlg.locator('select[data-select]')).toHaveValue('aplicacoes/Portal/casos/PORTAL-120 Pagamento Pix');
  await dlg.locator('button', { hasText: /^Salvar$/ }).click();
  await expect(page.locator('#toast')).toContainText('Salvo em aplicacoes/Portal/casos/PORTAL-120 Pagamento Pix/TC-8-pix-expirado.md');

  // novo documento aqui, numa pasta de ticket: app: e jira: preenchidos
  await tree.locator('[data-folder="aplicacoes/Portal/casos/PORTAL-9/"]').click({ button: 'right' });
  await page.locator('.side-menu [data-menu-act="newHere"]').click();
  await page.locator('.cmd-item', { hasText: 'Caso de teste' }).first().click();
  await expect(page.locator('#toast')).toContainText('aplicacoes/Portal/casos/PORTAL-9/');
  await expect.poll(() => raw(page)).toMatch(/\njira: PORTAL-9\n/);
  expect(await raw(page)).toMatch(/\napp: Portal\n/);
});
