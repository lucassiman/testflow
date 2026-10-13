// { } Comparar JSON: estrutura e diferenças lado a lado, erro localizado, inserir no documento e JSON grande por partes.
import { test, expect } from '@playwright/test';
import { openEditor, raw, CASE } from './helpers.mjs';

const L = { pedido: 'PED-1', status: 'processando', cliente: { id: 1, email: 'a@x.com' }, itens: [{ id: 'A', qtd: 1 }, { id: 'B', qtd: 2 }], updatedAt: '1' };
const R = { pedido: 'PED-1', status: 'enviado', cliente: { id: 1, email: 'a@x.com' }, itens: [{ id: 'B', qtd: 2 }, { id: 'A', qtd: 3 }], updatedAt: '2', rastreio: 'X' };

/** @param {import('@playwright/test').Page} page @param {'L' | 'R'} side @param {string} text */
const fill = (page, side, text) => page.evaluate(([s, t]) => {
  const ta = document.querySelector(`.jt-in[data-side="${s}"] textarea`);
  ta.value = t; ta.dispatchEvent(new Event('input'));
}, [side, text]);

test('comparar JSON: diferenças, opções, navegação, erro e levar para o caso', async ({ page }) => {
  await openEditor(page, { mode: 'preview', doc: CASE });
  await page.click('button[data-menu="mod-evidencias"]');
  await page.click('#mod-evidencias [data-cmd="jsonTool"]');
  const jt = page.locator('.jt');
  await expect(jt).toBeVisible();
  await fill(page, 'L', JSON.stringify(L, null, 2));
  await fill(page, 'R', JSON.stringify(R, null, 2));
  const sum = jt.locator('[data-jt="summary"]');
  await expect(sum).toContainText('3 alterados');
  await expect(sum).toContainText('1 novo');
  // itens pareados por id: A ↔ A mesmo com a ordem trocada
  await jt.locator('[data-jt="next"]').click();
  await expect(jt.locator('[data-jt="status"]')).toContainText('status');
  await jt.locator('[data-jt="next"]').click();
  await expect(jt.locator('[data-jt="status"]')).toContainText('itens[0→1].qtd');
  await expect(jt.locator('[data-jt="pos"]')).toHaveText('2 / 4');
  // ignorar chaves
  await jt.locator('.jt-opts summary').click();
  await jt.locator('[data-jt="ignore"]').fill('updatedAt');
  await expect(sum).toContainText('2 alterados');
  await jt.locator('.jt-opts summary').click();
  // erro localizado
  await fill(page, 'R', '{\n  "a": 1,\n}');
  await expect(jt.locator('[data-msg="R"]')).toContainText('vírgula sobrando antes de "}"');
  await expect(jt.locator('.jt-in[data-side="R"] .jt-st')).toHaveText('inválido · linha 3');
  // de volta: nomes dos lados e inserir no caso
  await fill(page, 'R', JSON.stringify(R));
  await jt.locator('.jt-in[data-side="L"] [data-jt="name"]').fill('HML');
  await jt.locator('.jt-in[data-side="R"] [data-jt="name"]').fill('PRD');
  await jt.locator('[data-jt="insert"]').click();
  await expect(page.locator('#toast')).toContainText('Diferenças inseridas');
  await page.keyboard.press('Escape');
  await expect(jt).toBeHidden();
  const doc = await raw(page);
  expect(doc).toMatch(/\*\*JSON — 3 diferenças:\*\* 2 alterados · 1 novo \(só em PRD\) · 0 removidos \(só em HML\) · chaves ignoradas: `updatedAt`\./);
  expect(doc).toContain('| Caminho | HML | PRD |');
  expect(doc).toContain('| `status` | `"processando"` | `"enviado"` |');
  expect(doc).toContain('<details><summary>HML × PRD (JSON)</summary>');
});

test('JSON grande: compara por partes e a próxima diferença abre só o caminho até ela', async ({ page }) => {
  await openEditor(page, { mode: 'preview' });
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Comparar JSON');
  await page.keyboard.press('Enter');
  const jt = page.locator('.jt');
  await expect(jt).toBeVisible();
  await page.evaluate(() => {
    const mk = (change) => ({ meta: { v: 1 }, lista: Array.from({ length: 20000 }, (_, i) => ({ id: i, nome: `item ${i}`, det: { a: i, c: i === change ? 'x' : 'y' } })) });
    for (const [s, v] of [['L', mk(-1)], ['R', mk(15000)]]) {
      const ta = document.querySelector(`.jt-in[data-side="${s}"] textarea`);
      ta.value = JSON.stringify(v, null, 2); ta.dispatchEvent(new Event('input'));
    }
  });
  await expect(jt.locator('[data-jt="banner"]')).toContainText('comparando por partes', { timeout: 10000 });
  await expect(jt.locator('[data-jt="summary"]')).toContainText('ramos não comparados');
  await expect(jt.locator('.jt-r')).toHaveCount(6); // raiz, meta e lista fechados, nos dois lados
  await expect(jt.locator('[data-jt="expandAll"]')).toBeDisabled();
  await jt.locator('[data-jt="next"]').click();
  await expect(jt.locator('[data-jt="status"]')).toContainText('lista[15000].det.c');
  await expect(jt.locator('[data-jt="status"]')).toContainText('"y"  →  "x"');
  // os itens da lista são pequenos: ao abrir a lista, cada um já foi conferido (sem montar os de dentro)
  await expect(jt.locator('[data-jt="summary"]')).not.toContainText('ramos não comparados');
  await expect(jt.locator('[data-jt="summary"]')).toContainText('1 alterado');
  await expect(jt.locator('[data-jt="pos"]')).toHaveText('1 / 1');
});
