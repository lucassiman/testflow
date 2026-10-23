// 1.72.0: o documento virou ticket no Jira (chave colada no jira:) → o código passa a ser a chave; nome do arquivo e links acompanham.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

const BUG = '---\ntipo: bug\nid: BUG-7\ntitulo: Pagamento trava\napp: Portal\njira:\n---\n\n# BUG-7 — Pagamento trava\n\nVisto no BUG-7.\n';
const CASO = '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Pagar\napp: Portal\njira:\n---\n\n# TC-1 — Pagar\n\nFalhou: [[BUG-7]].\n';

test('chave do Jira colada no jira: do bug → Ctrl+S troca o código, o título, o nome do arquivo e os links; no caso, não', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await page.addInitScript(wsInit, 'ws-jira-id');
  await openEditor(page, { mode: 'split' });
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(p, t); }, [
    ['aplicacoes/Portal/bugs/BUG-7-pagamento-trava.md', BUG],
    ['aplicacoes/Portal/casos/TC-1-pagar.md', CASO],
  ]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const tree = page.locator('[data-side="wsList"]');
  await tree.getByRole('button', { name: 'BUG-7-pagamento-trava', exact: true }).click();
  await expect(page.locator('#fileName')).toContainText('BUG-7-pagamento-trava');

  // copiou e colou no Jira: põe a chave no cartão do cabeçalho
  await page.locator('#preview .md-block.type-frontmatter').click();
  await page.locator('.meta-form [data-key="jira"]').fill('port-55');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#toast')).toContainText('BUG-7 virou PORT-55 (a chave do Jira no campo jira:)', { timeout: 8000 });
  await expect(page.locator('#fileName')).toContainText('PORT-55-pagamento-trava', { timeout: 8000 });
  const doc = await raw(page);
  expect(doc).toMatch(/^id: PORT-55$/m);
  expect(doc).toMatch(/^# PORT-55 — Pagamento trava$/m);
  expect(doc).toContain('Visto no PORT-55.');
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/bugs/BUG-7-pagamento-trava.md'))).toBeNull();
  await expect.poll(() => page.evaluate(() => window.__read('aplicacoes/Portal/casos/TC-1-pagar.md'))).toContain('Falhou: [[PORT-55]].');

  // caso de teste: o jira: é o ticket que ele testa — o código fica
  await tree.getByRole('button', { name: 'TC-1-pagar', exact: true }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1-pagar');
  await page.locator('#preview .md-block.type-frontmatter').click();
  await page.locator('.meta-form [data-key="jira"]').fill('PORT-120');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#toast')).toContainText('Salvo');
  expect(await raw(page)).toMatch(/^id: TC-1$/m);
  await expect(page.locator('#fileName')).toContainText('TC-1-pagar');
});

test('o Claude gravou a chave (código trocado fora do editor): ao reler a pasta, o arquivo é renomeado', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-jira-id-fora');
  await openEditor(page, { mode: 'split' });
  await page.evaluate(async (t) => { await window.__write('aplicacoes/Portal/bugs/BUG-7-pagamento-trava.md', t); }, BUG.replace('app: Portal\n', 'app: Portal\nuid: abcd2345\n'));
  await page.evaluate(async (t) => { await window.__write('aplicacoes/Portal/casos/TC-1-pagar.md', t); }, CASO);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const tree = page.locator('[data-side="wsList"]');
  await expect(tree.getByRole('button', { name: 'BUG-7-pagamento-trava', exact: true })).toBeVisible();
  // como o qa_atualizar_cabecalho grava (id trocado pela chave, mesmo uid)
  await page.evaluate(async (t) => { await window.__write('aplicacoes/Portal/bugs/BUG-7-pagamento-trava.md', t); },
    BUG.replace('app: Portal\n', 'app: Portal\nuid: abcd2345\n').replace(/BUG-7/g, 'PORT-55').replace('jira:\n', 'jira: PORT-55\n'));
  await page.locator('[data-side="refresh"]').click();
  await expect(tree.getByRole('button', { name: 'PORT-55-pagamento-trava', exact: true })).toBeVisible({ timeout: 8000 });
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/bugs/BUG-7-pagamento-trava.md'))).toBeNull();
  await expect.poll(() => page.evaluate(() => window.__read('aplicacoes/Portal/casos/TC-1-pagar.md'))).toContain('Falhou: [[PORT-55]].');
});
