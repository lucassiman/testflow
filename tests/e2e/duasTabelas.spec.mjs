// Segunda tabela com Status no mesmo documento (ex.: os pontos que o dev listou no teste em dupla):
// marcar com 1–5 fica na tabela onde você está — o painel ▶ Executar não puxa o documento de volta para o passo dele.
import { test, expect } from '@playwright/test';
import { openEditor, setRaw } from './helpers.mjs';

const steps = Array.from({ length: 14 }, (_, i) => `| ${i + 1} | Ação ${i + 1} | Resultado ${i + 1} | | |`).join('\n');
const filler = Array.from({ length: 30 }, (_, i) => `Parágrafo de anotação ${i + 1} da sessão em dupla, para a segunda tabela ficar bem abaixo da primeira.`).join('\n\n');
const DOC = `---
tipo: teste-em-dupla
id: TD-1
titulo: Dupla do ticket
---

# TD-1 — Dupla do ticket

## Passos

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
${steps}

## Anotações

${filler}

## Pontos do dev

| Ponto | Status |
| --- | --- |
| Valida CPF | |
| Mostra erro de rede | |
| Grava o log | |
`;

/** Linhas da tabela de pontos (texto do Raw). */
const pointRows = async (page) => (await page.evaluate(() => document.querySelector('#raw').value)).split('\n').filter((l) => /^\| (Valida|Mostra|Grava)/.test(l));

/** A célula está na área visível do Preview? */
const inView = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  const pane = document.querySelector('#previewPane');
  if (!el || !pane) return false;
  const r = el.getBoundingClientRect();
  const p = pane.getBoundingClientRect();
  return r.top >= p.top && r.bottom <= p.bottom;
}, sel);

test('segunda tabela com Status: 1–5 marca e avança nela, sem pular para a primeira (com e sem o painel ▶ Executar)', async ({ page }) => {
  await openEditor(page, { mode: 'split' });
  await setRaw(page, DOC);
  const pts = page.locator('#preview .md-block.type-table').nth(1).locator('td.status-cell');
  await expect(pts).toHaveCount(3);

  // com o painel de execução aberto (seguindo a tabela de passos)
  await page.locator('.exec-bar [data-act="run"]').click();
  await expect(page.locator('.runner')).toBeVisible();
  await expect(page.locator('.runner .run-step')).toContainText('Passo 1');

  await pts.nth(0).click();
  await expect(page.locator('.status-pop')).toBeVisible();
  await page.keyboard.press('1');
  await page.waitForTimeout(150);
  await page.keyboard.press('1');
  await page.waitForTimeout(150);
  expect(await pointRows(page)).toEqual(['| Valida CPF | `PASS` |', '| Mostra erro de rede | `PASS` |', '| Grava o log | |']);
  // o seletor está no 3º ponto e ele continua à vista
  await expect(pts.nth(2)).toHaveClass(/status-active/);
  expect(await inView(page, '#preview td.status-cell.status-active')).toBe(true);
  // a tabela de passos não foi tocada e o painel continua no passo 1
  expect((await page.evaluate(() => document.querySelector('#raw').value)).match(/`PASS`/g)?.length).toBe(2);
  await expect(page.locator('.runner .run-step')).toContainText('Passo 1');

  // Esc fecha o seletor: 1–5 volta a valer para o passo do painel — aí sim o documento vai até ele
  await page.keyboard.press('Escape');
  await expect(page.locator('.status-pop')).toBeHidden();
  await page.keyboard.press('1');
  await expect(page.locator('.runner .run-step')).toContainText('Passo 2');
  await expect.poll(() => page.evaluate(() => document.querySelector('#raw').value.split('\n').find((l) => l.startsWith('| 1 | Ação 1 |')))).toBe('| 1 | Ação 1 | Resultado 1 | | `PASS` |');
  expect(await inView(page, '#preview tr.run-current')).toBe(true);

  // sem o painel: o seletor também fica na segunda tabela
  await page.locator('.runner [data-act="close"]').click();
  await pts.nth(2).click();
  await page.keyboard.press('2');
  await page.waitForTimeout(150);
  expect((await pointRows(page))[2]).toBe('| Grava o log | `FAIL` |');
  expect(await inView(page, '#preview td.status-cell.status-active')).toBe(true);
});
