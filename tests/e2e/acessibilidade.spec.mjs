import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { openEditor, wsInit } from './helpers.mjs';

// Revisão de acessibilidade (10.3): axe-core nas telas principais, sem violações
// críticas/sérias, e a rodada operável só pelo teclado.
const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const walk = (d, b = '') => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p, `${b}${n}/`) : n.endsWith('.md') ? [[`${b}${n}`, readFileSync(p, 'utf8')]] : []; });

/** @param {import('@playwright/test').Page} page @param {string} name */
async function expectClean(page, name) {
  await page.addScriptTag({ content: axe }).catch(() => {});
  const bad = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((x) => x.target.join(' ')).join(' | ')}`);
  });
  expect(bad, `violações em "${name}"`).toEqual([]);
}

test('telas principais sem violações críticas/sérias (claro e escuro)', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(wsInit, 'ws-a11y');
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true, home: true, treeLabels: 'titulo', publisherName: 'Lucas' } });
  await expectClean(page, 'início');
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(`aplicacoes/Loja/${p}`, t.replace(/^---\n/, '---\napp: Loja\n')); }, walk('exemplos'));
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-002' }).first()).toBeVisible();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-002' }).first().click();
  await expect(page.locator('.exec-bar [data-act="run"]')).toBeVisible();
  await expectClean(page, 'caso');
  await page.locator('.exec-bar [data-act="run"]').click();
  await expect(page.locator('.runner')).toBeVisible();
  await expectClean(page, 'executando');

  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="startRun"]');
  await page.click('.app-dialog button:has-text("Continuar")');
  const picker = page.locator('.cpk-dialog');
  await expect(picker).toBeVisible();
  await expectClean(page, 'seletor de casos');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  // bug aberto ligado aos casos: a janela 🎯 sugere a confirmação — aqui, sem ela
  await page.locator('.app-dialog button', { hasText: 'Sem confirmações' }).click();
  await expect(page.locator('.cp-item').first()).toBeVisible();
  await expectClean(page, 'rodada');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await expectClean(page, 'rodada (escuro)');
});

test('seletor de casos e rodada só pelo teclado', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-a11y-kb');
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true } });
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(`aplicacoes/Loja/${p}`, t); }, walk('exemplos'));
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file').first()).toBeVisible();
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="startRun"]');
  await page.click('.app-dialog button:has-text("Continuar")');
  const picker = page.locator('.cpk-dialog');
  await expect(picker).toBeVisible();
  // a primeira linha é a parada do Tab; ↓ move, Espaço marca
  const rows = picker.locator('.cpk-item');
  await expect(rows.first()).toHaveAttribute('tabindex', '0');
  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press(' ');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);

  // rodada: 1–5 status, → próximo passo, Enter leva ao campo "obtido"
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-002' }).first().click();
  await page.locator('.exec-bar [data-act="run"]').click();
  await expect(page.locator('.runner')).toBeVisible();
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur());
  await page.keyboard.press('Enter');
  await expect(page.locator('.runner .run-actual')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.keyboard.press('1');
  await expect(page.locator('.runner [data-word="PASS"]')).toHaveAttribute('aria-pressed', 'true');
  // os atalhos dos botões são anunciados
  await expect(page.locator('button[data-cmd="save"]')).toHaveAttribute('aria-keyshortcuts', 'Control+S');
});
