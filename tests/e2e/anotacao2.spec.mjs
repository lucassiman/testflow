// Editor de anotação: numeração, marca-texto, alças, tamanho do texto, duplicar, recorte, zoom e reedição.
import { test, expect } from '@playwright/test';
import { CASE, openEditor, raw, wsInit } from './helpers.mjs';

test('anotação: numeração, marca-texto, alças, duplicar, tamanho, recorte e reedição', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-anotar-2');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async (text) => { await window.__write('casos/TC-1.md', text); }, CASE);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  const big = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 500;
    const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 800, 500);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.evaluate((b) => window.__paste(b), big);
  await expect.poll(() => raw(page)).toMatch(/evidencias\//);

  const openAnnotator = async () => {
    const img = page.locator('#preview img[data-md-src]').first();
    await img.hover();
    await img.locator('xpath=ancestor::div[contains(@class,"md-block")]').locator('.block-tools button[data-act="annotate"]').click();
    await expect(page.locator('.annot-overlay canvas')).toBeVisible();
  };
  const canvas = page.locator('.annot-overlay canvas');
  const px = (x, y) => page.evaluate(([a, b]) => {
    const c = /** @type {HTMLCanvasElement} */ (document.querySelector('.annot-overlay canvas'));
    return Array.from(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).getImageData(a, b, 1, 1).data.slice(0, 3));
  }, [x, y]);
  const at = async (x, y) => {
    const b = /** @type {NonNullable<Awaited<ReturnType<typeof canvas.boundingBox>>>} */ (await canvas.boundingBox());
    return { x: b.x + (x / 800) * b.width, y: b.y + (y / 500) * b.height };
  };
  const drag = async (a, b) => {
    const from = await at(...a); const to = await at(...b);
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
  };
  const isRed = ([r, g]) => r > 200 && g < 90;

  await openAnnotator();
  // ① numeração: dois cliques = 1 e 2
  await page.locator('.annot-overlay [data-tool="num"]').click();
  for (const x of [200, 300]) { const p = await at(x, 200); await page.mouse.click(p.x, p.y); }
  expect(isRed(await px(205, 205))).toBe(true);
  expect(isRed(await px(305, 205))).toBe(true);

  // ▬ marca-texto translúcido: mistura com o fundo cinza (não é cor chapada)
  await page.locator('.annot-overlay [data-tool="mark"]').click();
  await drag([400, 100], [600, 200]);
  const m = await px(500, 150);
  expect(m[0]).toBeGreaterThan(150); expect(m[1]).toBeLessThan(136); expect(m[1]).toBeGreaterThan(60);

  // alças: seleciona o marca-texto e estica o canto de baixo-direita
  await page.locator('.annot-overlay [data-tool="select"]').click();
  const sel = await at(500, 150);
  await page.mouse.click(sel.x, sel.y);
  expect((await px(650, 225))[1]).toBe(136); // ainda fora
  await drag([600, 200], [700, 250]);
  const stretched = await px(650, 225);
  expect(stretched[0]).toBeGreaterThan(150); // agora dentro
  expect(stretched[1]).toBeLessThan(136);

  // duplicar o número 1 (Ctrl+D): a cópia sai deslocada e vira o 3
  const n1 = await at(200, 200);
  await page.mouse.click(n1.x, n1.y);
  await page.keyboard.press('Control+d');
  expect(isRed(await px(223, 214))).toBe(true);
  // ] aumenta o número selecionado (a cópia): ganha área em volta
  expect(await px(227, 214)).toEqual([136, 136, 136]);
  await page.keyboard.press(']');
  expect(await px(227, 214)).not.toEqual([136, 136, 136]);
  await expect(page.locator('.annot-overlay [data-size]')).toHaveText('125%');

  // zoom: + aumenta o canvas na tela; 0 volta
  const w0 = (await canvas.boundingBox()).width;
  await page.keyboard.press('+');
  await expect.poll(async () => (await canvas.boundingBox()).width).toBeGreaterThan(w0 * 1.1);
  await page.keyboard.press('0');
  await expect.poll(async () => Math.round((await canvas.boundingBox()).width)).toBe(Math.round(w0));

  // ⛶ recorte 100,50 → 700,350 e salvar
  await page.locator('.annot-overlay [data-tool="crop"]').click();
  await drag([100, 50], [700, 350]);
  await expect(page.locator('.annot-overlay [data-act="clearcrop"]')).toBeVisible();
  await page.locator('.annot-overlay [data-act="save"]').click();
  await expect(page.locator('.annot-overlay')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__ls('casos/evidencias/.anotacoes'))).toHaveLength(2);
  const files = await page.evaluate(async () => (await window.__ls('casos/evidencias')).filter((f) => /\.png$/.test(f)));
  const size = await page.evaluate(async (f) => {
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('ws-anotar-2')).getDirectoryHandle('casos');
    const file = await (await (await dir.getDirectoryHandle('evidencias')).getFileHandle(f)).getFile();
    const bmp = await createImageBitmap(file);
    return [bmp.width, bmp.height];
  }, files[0]);
  expect(size).toEqual([600, 300]); // arquivo recortado

  // reeditar: abre o ORIGINAL com as marcações e o recorte no lugar
  await page.waitForTimeout(400);
  await openAnnotator();
  await expect(page.locator('.annot-title')).toContainText('Reeditar');
  expect(await canvas.evaluate((c) => /** @type {HTMLCanvasElement} */ (c).width)).toBe(800); // original inteiro
  expect(isRed(await px(205, 205))).toBe(true); // o número 1 continua lá
  await expect(page.locator('.annot-overlay [data-act="clearcrop"]')).toBeVisible(); // e o recorte também
  // apaga o número 2 e salva sem recorte
  await page.locator('.annot-overlay [data-act="clearcrop"]').click();
  await page.locator('.annot-overlay [data-tool="select"]').click();
  const n2 = await at(300, 200);
  await page.mouse.click(n2.x, n2.y);
  await page.keyboard.press('Delete');
  expect(await px(305, 205)).toEqual([136, 136, 136]);
  await page.locator('.annot-overlay [data-act="save"]').click();
  await expect(page.locator('.annot-overlay')).toHaveCount(0);
  await page.waitForTimeout(300);
  await openAnnotator();
  expect(await px(305, 205)).toEqual([136, 136, 136]); // a mudança ficou guardada
  expect(isRed(await px(205, 205))).toBe(true);
  await page.locator('.annot-overlay [data-act="cancel"]').click();
});

test('anotação com borrão: não guarda o original (dado sensível)', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-anotar-3');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async (text) => { await window.__write('casos/TC-1.md', text); }, CASE);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  const big = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 500;
    const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 800, 500);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.evaluate((b) => window.__paste(b), big);
  await expect.poll(() => raw(page)).toMatch(/evidencias\//);
  const img = page.locator('#preview img[data-md-src]').first();
  await img.hover();
  await img.locator('xpath=ancestor::div[contains(@class,"md-block")]').locator('.block-tools button[data-act="annotate"]').click();
  const canvas = page.locator('.annot-overlay canvas');
  await expect(canvas).toBeVisible();
  await page.locator('.annot-overlay [data-tool="blur"]').click();
  const b = /** @type {NonNullable<Awaited<ReturnType<typeof canvas.boundingBox>>>} */ (await canvas.boundingBox());
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5, { steps: 5 });
  await page.mouse.up();
  await page.locator('.annot-overlay [data-act="save"]').click();
  await expect(page.locator('.annot-overlay')).toHaveCount(0);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__ls('casos/evidencias/.anotacoes'))).toBeNull();
});
