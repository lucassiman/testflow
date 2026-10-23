// 🤝 Teste em dupla do ticket: roteiro curto com os casos do ticket, na pasta dele, com ▶ Executar e ⏱ Sessão.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

const E = 'aplicacoes/Portal/casos/PORTAL-10 Pagamentos';
const T = `${E}/PORTAL-120 Pix`;
const tc = (id, titulo, extra = '') => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: ${titulo}\napp: Portal\njira: PORTAL-120\nepico: PORTAL-10\n${extra}---\n\n# ${id} — ${titulo}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Tela | | |\n| 2 | Confirmar | ${titulo} ok | | |\n`;
const files = [
  [`${E}/PORTAL-10.md`, '---\ntipo: epico\nid: PORTAL-10\ntitulo: Pagamentos\napp: Portal\n---\n\n# PORTAL-10 — Pagamentos\n'],
  [`${T}/PORTAL-120.md`, '---\ntipo: historia\nid: PORTAL-120\ntitulo: Pagamento com Pix\napp: Portal\nepico: PORTAL-10\n---\n\n# PORTAL-120 — Pix\n\n## Critérios de aceite\n\n- [ ] QR code aparece ao escolher Pix\n- [ ] QR code expira em 30 minutos\n'],
  [`${T}/TC-1.md`, tc('TC-1', 'Pagar com Pix', 'prioridade: Alta\n')],
  [`${T}/TC-2.md`, tc('TC-2', 'Pix expirado')],
  [`${T}/TC-3.md`, tc('TC-3', 'Comprovante')],
  ['aplicacoes/Portal/casos/TC-9.md', '---\ntipo: caso-de-teste\nid: TC-9\ntitulo: Outro\napp: Portal\n---\n\n# TC-9\n'],
];

test('teste em dupla: roteiro do ticket a partir de um caso dele; de novo, oferece abrir o existente', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-dupla');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(p, t); }, files);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(files.length);
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).first().click();
  await expect(page.locator('#fileName')).toContainText('TC-1');

  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="pairTest"]');
  await expect(page.locator('#fileName')).toContainText('DUP-PORTAL-120');
  const doc = await raw(page);
  expect(doc).toMatch(/^tipo: teste-em-dupla$/m);
  expect(doc).toMatch(/^id: DUP-PORTAL-120$/m);
  expect(doc).toMatch(/^titulo: Teste em dupla — Pagamento com Pix$/m);
  expect(doc).toMatch(/^jira: PORTAL-120$/m);
  expect(doc).toMatch(/^epico: PORTAL-10$/m);
  expect(doc).toMatch(/- \[ \] QR code expira em 30 minutos/);
  expect(doc).toMatch(/\| 1 \| \[\[TC-1\]\] — Pagar com Pix \| Pagar com Pix ok \|/);
  expect(doc).toMatch(/\| 3 \| ⚠ \[\[TC-2\]\] — Pix expirado \|/);
  // gravado na pasta do ticket, junto dos casos
  const names = await page.evaluate((d) => window.__ls(d), T);
  expect(names.some((n) => n.startsWith('DUP-PORTAL-120'))).toBe(true);
  // na chamada: ▶ Executar e ⏱ Sessão na barra
  await expect(page.locator('.exec-action[data-act="run"]')).toBeVisible();
  await expect(page.locator('.exec-action[data-act="session"]')).toBeVisible();

  // de outro documento sem ticket: escolhe o ticket na lista; já existe → abrir o existente
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-9' }).first().click();
  await expect(page.locator('#fileName')).toContainText('TC-9');
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Teste em dupla');
  await page.keyboard.press('Enter');
  await page.locator('.cmd-menu .cmd-item', { hasText: 'PORTAL-120 Pix' }).click();
  await expect(page.locator('.app-dialog')).toContainText('já tem um teste em dupla');
  await page.click('.app-dialog button:has-text("Abrir o existente")');
  await expect(page.locator('#fileName')).toContainText('DUP-PORTAL-120');
});

test('teste em dupla com mais de um ticket: "Mais um ticket…" monta um documento só, separado por ticket', async ({ page }) => {
  const T2 = `${E}/PORTAL-121 Boleto`;
  const tc2 = (id, titulo) => tc(id, titulo).replace('jira: PORTAL-120', 'jira: PORTAL-121');
  await page.addInitScript(wsInit, 'ws-dupla-multi');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(p, t); }, [
    ...files,
    [`${T2}/TC-21.md`, tc2('TC-21', 'Gerar boleto')],
    [`${T2}/TC-22.md`, tc2('TC-22', 'Boleto inválido')],
  ]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(files.length + 2);
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).first().click();
  await expect(page.locator('#fileName')).toContainText('TC-1');

  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="pairTest"]');
  await expect(page.locator('.app-dialog')).toContainText('só deste ticket');
  await page.click('.app-dialog button:has-text("Mais um ticket")');
  await page.locator('.cmd-menu .cmd-item', { hasText: 'PORTAL-121 Boleto' }).click();
  // não sobrou outro ticket com casos: cria direto

  await expect(page.locator('#fileName')).toContainText('DUP-PORTAL-120');
  const doc = await raw(page);
  expect(doc).toMatch(/^jira: \[PORTAL-120, PORTAL-121\]$/m);
  expect(doc).toMatch(/^titulo: Teste em dupla — PORTAL-120 \+ PORTAL-121$/m);
  expect(doc).toMatch(/### PORTAL-120 — Pagamento com Pix\n\n- \[ \] QR code aparece/);
  expect(doc).toMatch(/## Roteiro\n\n### PORTAL-120 — Pagamento com Pix\n\n\| # /);
  expect(doc).toMatch(/### PORTAL-121 — Boleto\n\n\| # [^\n]+\n[^\n]+\n\| 1 \| \[\[TC-21\]\] — Gerar boleto \|[^\n]+\n\| 2 \| ⚠ \[\[TC-22\]\] — Boleto inválido \|/);
  // na pasta do primeiro ticket
  const names = await page.evaluate((d) => window.__ls(d), T);
  expect(names.some((n) => n.startsWith('DUP-PORTAL-120'))).toBe(true);
  // ▶ Executar percorre as duas tabelas
  await expect(page.locator('.exec-action[data-act="run"]')).toBeVisible();

  // começando pelo outro ticket: acha o existente (que já tem o PORTAL-121)
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-21' }).first().click();
  await expect(page.locator('#fileName')).toContainText('TC-21');
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="pairTest"]');
  await page.click('.app-dialog button:has-text("Criar o roteiro")');
  await expect(page.locator('.app-dialog')).toContainText('já tem um teste em dupla');
  await page.click('.app-dialog button:has-text("Abrir o existente")');
  await expect(page.locator('#fileName')).toContainText('DUP-PORTAL-120');
});
