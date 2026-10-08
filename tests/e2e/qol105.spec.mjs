// QoL de 05/10: nome do print com documento/passo/ação, retomar execução e repetir ambiente da última rodada.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8Dwn4GBgYGJgYEBAB0EAgGYBWbnAAAAAElFTkSuQmCC';

const CASE = (head = '', status = ['', '', '']) => `---
tipo: caso-de-teste
id: TC-042
titulo: Login bloqueado
status: PENDING
${head}---

# TC-042 — Login bloqueado

## Passos

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | Abrir /login | Tela exibida | | ${status[0]} |
| 2 | Informar "senha errada" [3x] | Mensagem de erro | | ${status[1]} |
| 3 | Informar senha certa | Dashboard | | ${status[2]} |

## Evidências

## Observações
`;

async function openWorkspaceCase(page, name, text) {
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async (t) => { await window.__write('casos/TC-042.md', t); }, text);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-042' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-042');
}

test('print do passo: nome com data/hora + documento + passo + ação, e legenda com a ação e a hora', async ({ page }) => {
  await openWorkspaceCase(page, 'ws-qol-nome', CASE());
  await page.click('.exec-action[data-act="run"]');
  await expect(page.locator('.runner .run-step')).toContainText('Passo 1');
  await page.keyboard.press('1'); // passo 1 PASS → vai para o 2
  await expect(page.locator('.runner .run-step')).toContainText('Passo 2');
  await page.evaluate((b) => window.__paste(b), PNG);
  await expect.poll(() => page.evaluate(() => window.__ls('casos/evidencias'))).toHaveLength(1);
  const [name] = await page.evaluate(() => window.__ls('casos/evidencias'));
  expect(name).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_TC-042-passo-2-informar-senha-errada-3x\.png$/);
  // legenda: "Passo 2 — <ação> · dd/mm hh:mm", sem [ ] que quebrariam o link
  await expect.poll(() => raw(page)).toMatch(/!\[Passo 2 — Informar "senha errada" 3x · \d\d\/\d\d \d\d:\d\d\]\(evidencias\/[^)]+\.png\)/);
});

test('print colado fora da execução: nome com data/hora + documento', async ({ page }) => {
  await openWorkspaceCase(page, 'ws-qol-nome2', CASE());
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  await page.evaluate((b) => window.__paste(b), PNG);
  await expect.poll(() => page.evaluate(() => window.__ls('casos/evidencias'))).toHaveLength(1);
  const [name] = await page.evaluate(() => window.__ls('casos/evidencias'));
  expect(name).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_TC-042\.png$/);
});

test('executar um caso que já tem passos com status retoma no primeiro passo em aberto e avisa', async ({ page }) => {
  await openEditor(page, { doc: CASE('', ['`PASS`', '`PASS`', '']) });
  await page.click('.exec-action[data-act="run"]');
  await expect(page.locator('.runner .run-step')).toContainText('Passo 3');
  await expect(page.locator('#toast')).toContainText('Retomando no passo 3 de 3');
});

test('ambiente da última execução: oferece preencher o que está em branco; ao concluir, guarda o do documento', async ({ page }) => {
  await openEditor(page, { doc: CASE('ambiente:\nbrowser:\nversao: 1.0\n'), prefs: { lastEnv: { ambiente: 'HML', browser: 'Chrome 130', versao: '2.14.0' } } });
  await page.click('.exec-action[data-act="run"]');
  const action = page.locator('#toast .toast-action');
  await expect(action).toBeVisible({ timeout: 6000 });
  await expect(page.locator('#toast')).toContainText('HML · Chrome 130');
  await expect(page.locator('#toast')).not.toContainText('2.14.0'); // versão já escrita no cabeçalho: não se troca
  await action.click();
  await expect.poll(() => raw(page)).toMatch(/\nambiente: HML\nbrowser: Chrome 130\nversao: 1\.0\n/);
  // Ctrl+Z desfaz o preenchimento
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect.poll(() => raw(page)).toMatch(/\nambiente:\nbrowser:\nversao: 1\.0\n/);
});

test('ambiente: sem nada em branco não oferece; concluir guarda ambiente/browser/versão para a próxima', async ({ page }) => {
  await openEditor(page, { doc: CASE('ambiente: PRD\nbrowser: Firefox 131\nversao: 3.0\n') });
  await page.click('.exec-action[data-act="run"]');
  await page.waitForTimeout(3200);
  await expect(page.locator('#toast .toast-action')).toHaveCount(0);
  await page.keyboard.press('1'); await page.keyboard.press('1'); await page.keyboard.press('1');
  await page.click('.runner [data-act="finish"]');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mdqa:prefs') || '{}').lastEnv);
  expect(saved).toEqual({ ambiente: 'PRD', browser: 'Firefox 131', versao: '3.0' });
});

test('editor de anotação: a caixa de texto cresce com o que se digita, sem barra de rolagem', async ({ page }) => {
  await openWorkspaceCase(page, 'ws-qol-caixa', CASE());
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  const big = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 500;
    const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 800, 500);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.evaluate((b) => window.__paste(b), big);
  await expect.poll(() => raw(page)).toMatch(/evidencias\//);
  const img = page.locator('#preview img[data-md-src]').first();
  await img.hover();
  await img.locator('xpath=ancestor::div[contains(@class,"md-block")]').locator('.block-tools button[data-act="annotate"]').click();
  const canvas = page.locator('.annot-overlay canvas');
  await expect(canvas).toBeVisible();
  await page.locator('.annot-overlay [data-tool="text"]').click();
  const b = await canvas.boundingBox();
  await page.mouse.click(b.x + 30, b.y + 30);
  const input = page.locator('.annot-text-input');
  await expect(input).toBeFocused();
  const sizes = () => input.evaluate((el) => ({ h: el.clientHeight, sh: el.scrollHeight, w: el.clientWidth, sw: el.scrollWidth }));
  const h0 = (await sizes()).h;
  await page.keyboard.type('primeira linha');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('segunda linha');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('terceira linha com bastante texto para forçar a quebra automática do campo');
  const s = await sizes();
  expect(s.h).toBeGreaterThan(h0 + 20);       // cresceu
  expect(s.sh).toBeLessThanOrEqual(s.h + 1);   // sem rolagem vertical
  expect(s.sw).toBeLessThanOrEqual(s.w + 1);   // sem rolagem horizontal
  await page.locator('.annot-overlay [data-act="cancel"]').click();
});
