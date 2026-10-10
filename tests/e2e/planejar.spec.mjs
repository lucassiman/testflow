// 11.3: planejar e executar — previsão de tempo da rodada (1.44.0)…
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const HIST = '\n## Histórico de execuções\n\n| Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| 1 | 01/10/2026 | 10:00 | 10:20 | 20 min | | `PASS` | |\n\n### Rodada 1 — 01/10/2026 — `PASS`\n';
export const tc = (id, extra = '', hist = '') => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\ntags: [regressao]\n${extra}---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n${hist}`;

export async function workspace(page, name, docs) {
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true, publisherName: 'Lucas' } });
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(p, t); }, docs);
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file').first()).toBeVisible();
}

export async function newRun(page, filter = '') {
  await page.click('button[data-menu="newMenu"]');
  await page.click('#newMenu [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  if (filter) await picker.locator('.cpk-search').fill(filter);
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  await expect(page.locator('.cp-item').first()).toBeVisible();
}

test('previsão: o painel da rodada mostra quanto falta pela duração média dos casos', async ({ page }) => {
  await workspace(page, 'ws-previsao', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1', '', HIST)],
    ['aplicacoes/Portal/casos/TC-2.md', tc('TC-2', '', HIST.replace('20 min', '40 min'))],
    ['aplicacoes/Portal/casos/TC-3.md', tc('TC-3')],
  ]);
  await newRun(page);
  const fc = page.locator('.cp-forecast');
  // 20 + 40 + (sem histórico: média 30) = 1 h 30 min
  await expect(fc).toContainText('faltam ~1 h 30 min (3 casos)');
  await expect(fc).toHaveAttribute('title', /1 sem histórico/);
});
