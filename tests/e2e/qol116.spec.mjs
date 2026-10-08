// QoL de 07/10: aviso de print grande (reduzir / manter / sempre) e voltar ao ponto onde parou ao reabrir o arquivo.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const DOC = `---\ntipo: nota\n---\n\n# Nota\n\n## Evidências\n`;

async function openWsDoc(page, name, path, text) {
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async ([p, t]) => { await window.__write(p, t); }, [path, text]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: path.split('/').at(-1).replace(/\.md$/, '') }).click();
  await expect(page.locator('#fileName')).toContainText(path.split('/').at(-1).replace(/\.md$/, ''));
}

/** Cola um PNG de ruído (não comprime: ~ 9 MB) montado no próprio navegador. */
const pasteBig = (page) => page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 2400; c.height = 1300;
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i++) img.data[i] = (i % 4 === 3) ? 255 : (Math.random() * 256) | 0;
  g.putImageData(img, 0, 0);
  window.__paste(c.toDataURL('image/png').split(',')[1]);
});

const sizes = (page) => page.evaluate(async () => {
  const d = await (await (await navigator.storage.getDirectory()).getDirectoryHandle(window.__wsName)).getDirectoryHandle('notas').then((x) => x.getDirectoryHandle('evidencias')).catch(() => null);
  const out = [];
  if (d) for await (const [k, h] of d.entries()) if (h.kind === 'file') out.push({ name: k, size: (await h.getFile()).size });
  return out;
});

test('print grande: pergunta; Reduzir grava menor que 2 MB; "sempre manter" não pergunta mais', async ({ page }) => {
  await page.addInitScript(() => { window.__wsName = 'ws-print-grande'; });
  await openWsDoc(page, 'ws-print-grande', 'notas/NOTA-1.md', DOC);
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');

  await pasteBig(page);
  const dialog = page.locator('.app-dialog');
  await expect(dialog).toContainText('Print grande');
  await dialog.getByRole('button', { name: 'Reduzir' }).click();
  await expect.poll(async () => (await sizes(page)).length).toBe(1);
  const [small] = await sizes(page);
  expect(small.size).toBeLessThan(2 * 1024 * 1024);
  await expect(page.locator('#toast')).toContainText(/Print reduzido|Evidência salva/);

  // manter + "fazer sempre assim": o próximo não pergunta e grava o original
  await pasteBig(page);
  await expect(dialog).toBeVisible();
  await dialog.locator('.app-dialog-checks input[type="checkbox"]').check();
  await dialog.getByRole('button', { name: 'Manter original' }).click();
  await expect.poll(async () => (await sizes(page)).length).toBe(2);
  await pasteBig(page);
  await expect.poll(async () => (await sizes(page)).length).toBe(3);
  await expect(dialog).toBeHidden();
  const big = (await sizes(page)).filter((f) => f.size > 2 * 1024 * 1024);
  expect(big).toHaveLength(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mdqa:prefs')).bigPrint)).toBe('keep');
});

test('reabrir um arquivo volta ao ponto onde parou (rolagem do Preview)', async ({ page }) => {
  const long = `# Longo\n\n${Array.from({ length: 120 }, (_, i) => `Parágrafo ${i + 1} com algum texto para ocupar espaço.`).join('\n\n')}\n`;
  await openWsDoc(page, 'ws-posicao', 'notas/LONGO.md', long);
  await page.evaluate(() => { document.querySelector('.preview-pane').scrollTop = 1500; });
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+w'); // fecha a aba (guarda a posição)
  await expect(page.locator('#fileName')).not.toContainText('LONGO');
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'LONGO' }).click();
  await expect(page.locator('#toast')).toContainText('de volta onde você parou');
  await expect.poll(() => page.evaluate(() => document.querySelector('.preview-pane').scrollTop)).toBeGreaterThan(1400);

  // recarregar o app: a aba volta já no mesmo lugar
  await page.reload();
  await page.waitForSelector('#preview .md-block');
  await expect.poll(() => page.evaluate(() => document.querySelector('.preview-pane').scrollTop)).toBeGreaterThan(1400);
});
