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

test('atribuir: 👥 distribui os pendentes, chip do testador, filtro Minhas, carga e ▶ Próximo caso é o meu', async ({ page }) => {
  await workspace(page, 'ws-atribuir', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1', '', HIST.replace('20 min', '30 min'))],
    ['aplicacoes/Portal/casos/TC-2.md', tc('TC-2', '', HIST)],
    ['aplicacoes/Portal/casos/TC-3.md', tc('TC-3', '', HIST)],
  ]);
  await newRun(page);
  await page.locator('.cp-btn[data-cp="assign"]').click();
  await page.locator('.app-dialog-field input').first().fill('Lucas, Bruno');
  await page.locator('.app-dialog-foot button', { hasText: 'Atribuir' }).click();
  await expect(page.locator('#toast')).toContainText('Distribuídos — Lucas: 1 (~30 min) · Bruno: 2 (~40 min)');
  await expect(page.locator('.cp-item', { hasText: 'TC-1' }).locator('.cp-who')).toHaveText('L');
  await expect(page.locator('.cp-item', { hasText: 'TC-1' }).locator('.cp-who')).toHaveClass(/mine/);
  await expect(page.locator('.cp-load')).toContainText('Bruno 2');
  await page.locator('.cp-fchip[data-f="minhas"]').click();
  await expect(page.locator('.cp-item')).toHaveCount(1);
  // trocar o testador pelo chip
  await page.locator('.cp-fchip[data-f="todos"]').click();
  await page.locator('.cp-item', { hasText: 'TC-2' }).locator('.cp-who').click();
  await page.locator('.cmd-menu .cmd-item', { hasText: 'Lucas (eu)' }).click();
  await expect(page.locator('.cp-item', { hasText: 'TC-2' }).locator('.cp-who')).toHaveClass(/mine/);
  await page.keyboard.press('Control+s');
  // ▶ Próximo caso abre um dos meus (TC-1)
  await page.locator('.cp-btn[data-cp="next"]').click();
  await expect(page.locator('#preview h1')).toHaveText('TC-1');
});

test('matriz: nova rodada em HML e PROD cria uma execução por configuração; o caso feito em HML segue pendente em PROD', async ({ page }) => {
  await workspace(page, 'ws-matriz', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1')],
  ]);
  await page.click('button[data-menu="newMenu"]');
  await page.click('#newMenu [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="matrix"] summary').click();
  await picker.locator('[data-mx="ambientes"]').fill('HML, PROD');
  await picker.locator('[data-mx="navegadores"]').fill('Chrome');
  await expect(picker.locator('[data-cpk="mxnote"]')).toContainText('2 execução(ões): HML · Chrome · PROD · Chrome');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  await expect(page.locator('#toast')).toContainText('2 execução(ões) — uma por configuração');
  const cfg = page.locator('.cp-cfg');
  await expect(cfg).toHaveCount(2);
  await expect(cfg.nth(0)).toHaveClass(/on/);
  await page.locator('.cp-btn[data-cp="next"]').click();
  await expect(page.locator('#envChip')).toContainText('HML'); // o ambiente vem da rodada
  await expect(page.locator('.runner .run-step')).toBeVisible();
  await page.keyboard.press('1');
  await page.locator('.runner [data-act="finish"]').click();
  await expect(page.locator('.cp-cfg', { hasText: 'HML' })).toContainText('1/1');
  await page.locator('.cp-cfg', { hasText: 'PROD' }).click();
  await expect(page.locator('.cp-cfg', { hasText: 'PROD' })).toHaveClass(/on/);
  await expect(page.locator('.cp-item', { hasText: 'TC-1' })).toHaveClass(/cp-pendente|cp-atual/);
  await page.locator('.cp-btn[data-cp="next"]').click();
  await expect(page.locator('#envChip')).toContainText('PROD');
  await expect(page.locator('#preview td', { hasText: /HML · Chrome/ })).toHaveCount(1); // histórico da rodada em HML
});
