// 11.5 — integrações e acompanhamento: testes instáveis (1.52.0) (1.52.0).
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

/** @param {import('@playwright/test').Page} page @param {string} text */
async function palette(page, text) {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** @param {import('@playwright/test').Page} page */
async function openWorkspace(page) {
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
}

const execDoc = (id, day, status) => `---\ntipo: execucao\nid: ${id}\ntitulo: Automação ${day}\napp: Portal\ndata: 2026-10-${day}\n---\n\n# ${id}\n\n## Testes automatizados\n\n> 🤖 **Playwright** — \`ci.json\` · importado em ${day}/10/2026 10:00\n\n### Resultados\n\n| # | Teste | Arquivo | Duração | Resultado | Obs |\n| ---: | --- | --- | ---: | --- | --- |\n| 1 | login @TC-1 | login.spec.ts:3 | 1,2 s | \`PASS\` | |\n| 2 | cadastro TC-2 | login.spec.ts:9 | 0,9 s | \`${status}\` | |\n`;

const report = {
  name: 'ci.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify({
    config: {}, stats: { startTime: '2026-10-06T10:00:00Z', duration: 2100 },
    suites: [{ title: 'login.spec.ts', file: 'login.spec.ts', specs: [
      { title: 'login @TC-1', file: 'login.spec.ts', line: 3, tests: [{ projectName: 'chromium', results: [{ status: 'passed', duration: 1200 }] }] },
      { title: 'cadastro TC-2', file: 'login.spec.ts', line: 9, tests: [{ projectName: 'chromium', results: [{ status: 'failed', duration: 900, error: { message: 'boom' } }] }] },
    ] }],
  })),
};

test('instáveis: o relatório novo marca o teste que alterna PASS/FAIL; a tendência lista os instáveis', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-flaky');
  await openEditor(page, { mode: 'split', prefs: { automationRootAsked: true } });
  await page.evaluate(async (docs) => { for (const [p, t] of docs) await window.__write(p, t); }, [
    ['aplicacoes/Portal/execucoes/EXE-1.md', execDoc('EXE-1', '01', 'PASS')],
    ['aplicacoes/Portal/execucoes/EXE-2.md', execDoc('EXE-2', '02', 'FAIL')],
    ['aplicacoes/Portal/execucoes/EXE-3.md', execDoc('EXE-3', '03', 'PASS')],
  ]);
  await openWorkspace(page);
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(3);
  await page.click('button[data-menu="mod-execucao"]');
  const chooser = page.waitForEvent('filechooser');
  await page.click('#mod-execucao [data-cmd="startRun"]');
  await page.selectOption('select[data-select]', 'auto');
  await page.click('.app-dialog button:has-text("Continuar")');
  await (await chooser).setFiles(report);
  await expect.poll(() => raw(page)).toMatch(/^## Testes automatizados$/m);
  const text = await raw(page);
  expect(text).toMatch(/\| cadastro TC-2 \|[^\n]*`FAIL` \| boom · ⚠ instável: 3 trocas PASS↔FAIL em 4 execuções \|/);
  expect(text.split('\n').find((l) => l.includes('| login @TC-1 |'))).not.toContain('instável');
  await page.keyboard.press('Control+s');

  await palette(page, 'Tendência entre rodadas');
  await expect(page.locator('#fileName')).toContainText('tendencia');
  await expect(page.locator('#preview')).toContainText('Testes automatizados instáveis');
  await expect(page.locator('#preview')).toContainText('✓✗✓✗');
});

test('reporter da automação (1.53.0): a paleta mostra e copia o trecho do Playwright com o caminho da pasta de trabalho', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(wsInit, 'ws-reporter');
  await openEditor(page, { mode: 'split', prefs: { wsDiskPaths: { 'ws-reporter': String.raw`C:\dev\qa` } } });
  await page.evaluate(() => window.__write('aplicacoes/Portal/casos/TC-1.md', '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\napp: Portal\n---\n\n# TC-1 — Login\n'));
  await openWorkspace(page);
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await palette(page, 'Reporter da automação');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText("reporter: [['list'], ['<pasta do TestFlow>/reporter-dist/testflow.mjs', { pasta: 'C:/dev/qa', app: 'Portal' }]],");
  await expect(dlg).toContainText(String.raw`node "<pasta do TestFlow>/reporter-dist/testflow.mjs" importar junit.xml --pasta "C:\dev\qa" --app "Portal"`);
  await dlg.locator('button', { hasText: 'Copiar trecho do Playwright' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("{ pasta: 'C:/dev/qa', app: 'Portal' }");
});
