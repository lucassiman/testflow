// Pasta em disco lento (Google Drive / iCloud / OneDrive no Mac): cada pasta demora para listar e cada arquivo para abrir.
// A árvore aparece rápido (pastas lidas em paralelo), não some ao voltar para a janela, e cliques repetidos não abrem várias abas.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

test.setTimeout(120_000);

/** Deixa o disco lento: cada listagem de pasta espera __fsDelay ms; cada leitura de arquivo, __fileDelay ms. */
const slowDisk = () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const entries = FileSystemDirectoryHandle.prototype.entries;
  FileSystemDirectoryHandle.prototype.entries = async function* slowEntries() { await wait(window.__fsDelay || 0); yield* entries.call(this); };
  const getFile = FileSystemFileHandle.prototype.getFile;
  FileSystemFileHandle.prototype.getFile = async function slowGetFile() { await wait(window.__fileDelay || 0); return getFile.call(this); };
  window.__scans = 0;
};

async function setup(page, name) {
  await page.addInitScript(slowDisk);
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true } });
  // 6 aplicações × (casos, bugs, evidências) = 30 pastas; 120 documentos
  await page.evaluate(async () => {
    for (let a = 1; a <= 6; a++) {
      for (let i = 0; i < 20; i++) {
        const bug = i % 4 === 3;
        const id = `${bug ? 'BUG' : 'TC'}-${a}${String(i).padStart(2, '0')}`;
        const dir = `aplicacoes/App${a}/${bug ? 'bugs' : 'casos'}`;
        await window.__write(`${dir}/${id}.md`, `---\ntipo: ${bug ? 'bug' : 'caso-de-teste'}\nid: ${id}\ntitulo: Documento ${id}\n---\n\n# ${id}\n`);
      }
      await window.__write(`aplicacoes/App${a}/casos/evidencias/p.png`, 'x');
      await window.__write(`aplicacoes/App${a}/bugs/evidencias/p.png`, 'x');
    }
  });
  await page.evaluate(() => { window.__fsDelay = 150; window.__fileDelay = 15; });
}

test('disco lento: árvore aparece com as pastas lidas em paralelo e não some ao voltar para a janela', async ({ page }) => {
  await setup(page, 'ws-lento-arvore');
  const t0 = Date.now();
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsName"]')).toContainText('120 arquivos', { timeout: 30_000 });
  const ms = Date.now() - t0;
  console.log(`[disco lento] árvore em ${ms} ms`);
  // ~33 pastas × 150 ms: uma de cada vez passaria de 5 s; em paralelo, bem menos
  expect(ms).toBeLessThan(3500);

  // voltar para a janela (focus) relê a pasta, mas a árvore continua na tela durante a releitura
  await page.waitForTimeout(5200);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('[data-side="wsName"]')).toContainText('lendo…');
  await expect(page.locator('[data-side="wsList"] .side-file').first()).toBeVisible();
  expect(await page.locator('[data-side="wsList"] .side-empty', { hasText: 'Lendo a pasta' }).count()).toBe(0);
  // vários pedidos de leitura ao mesmo tempo viram uma só
  await page.evaluate(() => { for (let i = 0; i < 3; i++) window.dispatchEvent(new Event('focus')); });
  await expect(page.locator('[data-side="wsName"]')).toContainText('120 arquivos', { timeout: 30_000 });

  // diagnóstico mostra os tempos
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Diagnóstico');
  await page.keyboard.press('Enter');
  await expect(page.locator('.app-dialog')).toContainText(/Varredura: \d+ ms · 3\d pastas/);
});

test('disco lento: cliques repetidos abrem uma aba só, e vale o último arquivo clicado', async ({ page }) => {
  await setup(page, 'ws-lento-clique');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsName"]')).toContainText('120 arquivos', { timeout: 30_000 });
  await page.evaluate(() => { window.__fileDelay = 700; }); // abrir um arquivo demora
  const file = (id) => page.locator(`[data-side="wsList"] .side-file[data-ws-path$="/${id}.md"]`);

  // o mesmo arquivo clicado 3 vezes: uma aba
  await file('TC-100').click();
  await file('TC-100').click();
  await file('TC-100').click();
  await expect(page.locator('#fileName')).toContainText('TC-100', { timeout: 10_000 });
  await page.waitForTimeout(1500);
  await expect(page.locator('.tab')).toHaveCount(1); // uma aba só

  // três arquivos diferentes em seguida: abre só o último
  await file('TC-101').click();
  await file('TC-102').click();
  await file('TC-200').click();
  await expect(page.locator('#fileName')).toContainText('TC-200', { timeout: 10_000 });
  await page.waitForTimeout(2000);
  await expect(page.locator('.tab')).toHaveCount(2); // TC-100 e TC-200
  await expect(page.locator('.tab', { hasText: 'TC-101' })).toHaveCount(0);
});
