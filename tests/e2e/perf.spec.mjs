// Pasta grande (~2.000 documentos, o tamanho de um export do Notion inteiro): mede abrir a pasta, ler o índice,
// buscar, abrir o Painel e a paleta. Roda só com npm run test:perf — não entra no npm run test:e2e.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const N = Number(process.env.PERF_DOCS || 2000);
test.skip(!process.env.PERF && process.env.npm_lifecycle_event !== 'test:perf', 'medição de desempenho: npm run test:perf');
test.setTimeout(240_000);

test(`pasta grande: ${N} documentos`, async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-perf');
  await openEditor(page, { mode: 'preview' });
  // monta a pasta: 20 aplicações × (casos + bugs), cada caso com tabela de passos, [[links]] e cabeçalho completo
  const wrote = await page.evaluate(async (n) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('ws-perf', { create: true });
    const t0 = performance.now();
    const apps = Array.from({ length: 20 }, (_, i) => `App${i + 1}`);
    const dirs = new Map();
    const dirFor = async (path) => {
      if (dirs.has(path)) return dirs.get(path);
      let d = root;
      for (const p of path.split('/')) d = await d.getDirectoryHandle(p, { create: true });
      dirs.set(path, d);
      return d;
    };
    for (let i = 0; i < n; i++) {
      const app = apps[i % apps.length];
      const bug = i % 4 === 3;
      const id = bug ? `BUG-${String(i).padStart(4, '0')}` : `TC-${String(i).padStart(4, '0')}`;
      const rows = Array.from({ length: 8 }, (_, k) => `| ${k + 1} | Ação ${k + 1} do ${id} com texto de tamanho realista | Resultado esperado ${k + 1} | ${k % 3 ? 'ok' : ''} | ${k % 5 === 4 ? '`FAIL`' : k % 3 ? '`PASS`' : ''} |`).join('\n');
      const text = `---\ntipo: ${bug ? 'bug' : 'caso-de-teste'}\nid: ${id}\ntitulo: Documento ${i} de ${app}\napp: ${app}\nstatus: PENDING\nprioridade: Média\nambiente: HML\njira: QA-${1000 + i}\ntags: [${i % 7 ? 'regressao' : 'smoke'}, ${app.toLowerCase()}]\nqa-md: 1\n${i % 10 === 0 ? 'revisao: 2\npublicado_em: 2026-09-28 10:00\npublicado_por: Lucas\n' : ''}---\n\n# ${id} — Documento ${i}\n\nRelacionado a [[TC-${String((i + 1) % n).padStart(4, '0')}]] e [[TC-${String((i + 7) % n).padStart(4, '0')}]].\n\n## Passos\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n${rows}\n\n## Observações\n\n${'Texto de observação com palavras variadas para a busca. '.repeat(20)}${i === n - 7 ? 'agulhanopalheiro' : ''}\n`;
      const d = await dirFor(`aplicacoes/${app}/${bug ? 'bugs' : 'casos'}`);
      const w = await (await d.getFileHandle(`${id}.md`, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    }
    return Math.round(performance.now() - t0);
  }, N);
  console.log(`[perf] montar a pasta (${N} arquivos): ${wrote} ms`);

  /** @type {Record<string, number>} */
  const m = {};
  const time = async (label, fn) => { const t = Date.now(); await fn(); m[label] = Date.now() - t; console.log(`[perf] ${label}: ${m[label]} ms`); };

  await page.click('#sidebarBtn');
  await time('abrir a pasta (árvore)', async () => {
    await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
    await expect(page.locator('[data-side="wsName"]')).toContainText(`${N} arquivos`, { timeout: 60_000 });
  });
  await time('ler o índice (painel com todos)', async () => {
    await page.locator('[data-side="dashboard"]').click();
    await expect(page.locator('.dash-total')).toContainText(`${N} documentos`, { timeout: 120_000 });
  });
  await time('filtrar o painel (PENDING)', async () => {
    await page.locator('.dash-chip.dash-pending').click();
    await expect(page.locator('.dash-table tbody tr').first()).toBeVisible();
  });
  await page.keyboard.press('Escape');
  await time('buscar em todos (termo raro)', async () => {
    await page.keyboard.press('Control+Shift+F');
    await page.locator('[data-side="searchInput"]').fill('agulhanopalheiro');
    await expect(page.locator('[data-side="searchResults"] .side-hit').first()).toContainText('agulha', { timeout: 30_000 });
  });
  await time('paleta (Ctrl+Shift+P) com todos os arquivos', async () => {
    await page.keyboard.press('Control+Shift+P');
    await expect(page.locator('.cmd-menu')).toBeVisible();
    await page.keyboard.type('TC-1996');
    await expect(page.locator('.cmd-menu .cmd-item').first()).toContainText('TC-1996');
  });
  await page.keyboard.press('Escape');
  await time('abrir um documento pela árvore', async () => {
    await page.locator('.side-tabs [data-tab="files"]').click();
    await page.locator('[data-side="filter"]').fill('TC-0004');
    await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-0004' }).first().click();
    await expect(page.locator('#fileName')).toContainText('TC-0004');
  });
  console.log(`[perf] resumo ${JSON.stringify(m)}`);
  // limites generosos (máquina de CI é mais lenta que um notebook): o objetivo é pegar regressão grande
  expect(m['abrir a pasta (árvore)']).toBeLessThan(15_000);
  expect(m['buscar em todos (termo raro)']).toBeLessThan(5_000);
  expect(m['abrir um documento pela árvore']).toBeLessThan(3_000);
});
