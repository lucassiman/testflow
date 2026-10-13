// 1.31.0: painel de execução minimizado (▁ / M) e ✕ Cancelar execução (começou sem querer).
import { test, expect } from '@playwright/test';
import { openEditor, CASE } from './helpers.mjs';

test('minimizar: passo, tempo e status numa faixa; marca, avança, volta ao passo com FAIL e expande', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await openEditor(page, { mode: 'preview', doc: CASE });
  await page.locator('.exec-bar [data-act="run"]').click();
  const runner = page.locator('.runner');
  await expect(page.locator('body')).toHaveClass(/runner-docked/);
  await runner.locator('[data-act="compact"]').first().click();
  await expect(runner).toHaveClass(/compact/);
  await expect(page.locator('body')).not.toHaveClass(/runner-docked/); // minimizado flutua, pequeno
  const box = await runner.boundingBox();
  expect(box.height).toBeLessThan(140);
  await expect(runner.locator('.run-actual')).toHaveCount(0);
  await expect(runner.locator('.run-mini-step')).toContainText('1/');
  await runner.locator('.run-mini-st[data-word="PASS"]').click();
  await expect(runner.locator('.run-mini-step')).toContainText('2/');
  await page.keyboard.press('2'); // FAIL no passo 2
  await expect(runner.locator('.run-mini-step')).toContainText('3/');
  const prob = runner.locator('[data-act="problem"]');
  await expect(prob).toBeVisible();
  await prob.click();
  await expect(runner).not.toHaveClass(/compact/);
  await expect(runner.locator('.run-step')).toContainText('(2 de');
  await expect(runner.locator('.run-actual')).toBeFocused();
  // M alterna (fora dos campos) e a escolha fica lembrada
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await expect(runner).toHaveClass(/compact/);
  await page.reload();
  await page.waitForSelector('#preview .md-block');
  await page.locator('.exec-bar [data-act="run"]').click();
  await expect(page.locator('.runner')).toHaveClass(/compact/);
  await page.keyboard.press('m');
  await expect(page.locator('.runner')).not.toHaveClass(/compact/);
});

test('cancelar execução: sem mudanças fecha na hora; com status marcados pede confirmação e desfaz', async ({ page }) => {
  await openEditor(page, { mode: 'preview', doc: CASE });
  const steps = page.locator('#preview table').first();
  const before = await steps.innerText();
  await page.locator('.exec-bar [data-act="run"]').click();
  const runner = page.locator('.runner');
  await runner.locator('[data-act="cancel"]').click();
  await expect(runner).toBeHidden();
  await expect(page.locator('.toast').last()).toContainText('nada foi registrado');

  await page.locator('.exec-bar [data-act="run"]').click();
  await runner.locator('[data-word="PASS"]').click();
  await runner.locator('[data-word="FAIL"]').click();
  await expect.poll(() => steps.innerText()).not.toBe(before);
  await runner.locator('[data-act="cancel"]').click();
  await expect(runner.locator('[data-act="cancel"]')).toHaveText('Cancelar mesmo?');
  await runner.locator('[data-act="cancel"]').click();
  await expect(runner).toBeHidden();
  await expect.poll(() => steps.innerText()).toBe(before);
  // a execução foi esquecida: ▶ Executar começa do zero, sem "Retomando"
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mdqa:prefs') || '{}').execRuns || {});
  expect(Object.keys(saved)).toHaveLength(0);
  // Ctrl+Z traz as marcações de volta
  await page.keyboard.press('Control+z');
  await expect.poll(() => steps.innerText()).not.toBe(before);
});

test('cancelar na rodada: o caso volta a "não começado" e a rodada antiga arquivada volta para a tabela', async ({ page }) => {
  const { wsInit } = await import('./helpers.mjs');
  const tc = (id) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\n---\n\n# ${id}\n\n## Passos\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir ${id} | Aberto | ok | \`PASS\` |\n| 2 | Salvar ${id} | Salvo | ok | \`PASS\` |\n`;
  await page.addInitScript(wsInit, 'ws-cancelar-rodada');
  await openEditor(page, { mode: 'preview', prefs: { publisherName: 'Lucas' } });
  await page.evaluate(async ([a, b]) => {
    await window.__write('aplicacoes/Portal/casos/TC-1.md', a);
    await window.__write('aplicacoes/Portal/casos/TC-2.md', b);
  }, [tc('TC-1'), tc('TC-2')]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(2);
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill('Regressão');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  const panel = page.locator('#cyclePanel');
  await panel.locator('.cp-item', { hasText: 'TC-1' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  const runner = page.locator('.runner');
  await expect(runner).toBeVisible();
  // a rodada anterior foi arquivada: a tabela começa limpa
  await expect(page.locator('#preview h2', { hasText: 'Histórico de execuções' })).toHaveCount(1);
  await runner.locator('[data-act="cancel"]').click();
  await runner.locator('[data-act="cancel"]').click();
  await expect(runner).toBeHidden();
  await expect(page.locator('#preview h2', { hasText: 'Histórico de execuções' })).toHaveCount(0);
  await expect(page.locator('#preview table').first()).toContainText('PASS');
  await expect(panel.locator('.cp-item', { hasText: 'TC-1' })).not.toHaveClass(/cp-(atual|andamento)/);
});

// V1 / item M (4.4): os numerais aplicam status também no painel flutuante minimizado (⧉ Flutuar + ▁).
// O Chromium do teste não abre a janelinha de verdade: troca-se a API por uma janela comum (popup) que faz o mesmo papel.
test('flutuante minimizado: os numerais aplicam status na janelinha em foco', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.addInitScript(() => {
    // @ts-ignore
    window.documentPictureInPicture = { requestWindow: async (opts) => window.open('', 'pipfake', `width=${opts?.width || 440},height=${opts?.height || 150}`) };
  });
  await openEditor(page, { mode: 'preview', doc: CASE });
  await page.locator('.exec-bar [data-act="run"]').click();
  const runner = page.locator('.runner');
  const popupPromise = page.waitForEvent('popup');
  await runner.locator('[data-act="float"]').first().click(); // ⧉ Flutuar
  const pop = await popupPromise;
  await pop.locator('.runner [data-act="compact"]').first().click(); // ▁ Minimizar, já na janelinha
  await expect(pop.locator('.runner.compact')).toBeVisible();
  await expect(pop.locator('.run-mini-step')).toContainText('1/');
  await pop.bringToFront();
  await pop.keyboard.press('1'); // PASS no passo 1
  await expect(pop.locator('.run-mini-step')).toContainText('2/');
  await pop.keyboard.press('2'); // FAIL no passo 2
  await expect(pop.locator('.run-mini-step')).toContainText('3/');
  const rows = await page.locator('#preview table').first().innerText();
  expect(rows).toMatch(/PASS/);
  expect(rows).toMatch(/FAIL/);
});
