// 11.4 (1.49.0): replay instantâneo — os últimos segundos da janela capturada, sem ter apertado gravar.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

/** getDisplayMedia simulado: um canvas mudando de cor (o vídeo tem o que gravar). */
const fakeScreen = () => {
  window.__captures = 0;
  navigator.mediaDevices.getDisplayMedia = async () => {
    window.__captures++;
    const c = Object.assign(document.createElement('canvas'), { width: 160, height: 100 });
    const g = c.getContext('2d');
    setInterval(() => { g.fillStyle = `hsl(${Math.random() * 360}, 70%, 50%)`; g.fillRect(0, 0, 160, 100); }, 40);
    return c.captureStream(15);
  };
};

const CASE = '---\ntipo: caso-de-teste\nid: TC-7\ntitulo: Pagamento\napp: Loja\n---\n\n# TC-7 — Pagamento\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Pagar com cartão | Pedido confirmado | Tela travou | `FAIL` |\n\n## Evidências\n\n## Observações\n';

/** @param {import('@playwright/test').Page} page */
async function openCase(page) {
  await page.evaluate((t) => window.__write('aplicacoes/Loja/casos/TC-7.md', t), CASE);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-7' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-7');
}

/** @param {import('@playwright/test').Page} page @param {string} text */
async function palette(page, text) {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('replay: Ctrl+Alt+R liga (escolhe a janela uma vez), o rodapé conta, e salvar põe o vídeo no documento', async ({ page }) => {
  await page.addInitScript(fakeScreen);
  await page.addInitScript(wsInit, 'ws-replay');
  await openEditor(page, { mode: 'split' });
  await openCase(page);
  await page.locator('#previewPane .md-block', { hasText: 'Observações' }).click();
  await page.keyboard.press('Escape');

  // primeira vez: só liga (não tira print nem grava nada no documento)
  await page.keyboard.press('Control+Alt+R');
  await expect(page.locator('#toast')).toContainText('Replay ligado');
  await expect(page.locator('#replayStatus')).toBeVisible();
  await expect(page.locator('#replayStatus')).toContainText(/⏪ \d+\/60 s/);
  await expect(page.locator('#captureStatus')).toBeVisible();
  expect(await raw(page)).not.toContain('evidencias/');

  // depois: salva o que já está guardado (sem escolher a janela de novo)
  await page.waitForTimeout(1500);
  await page.locator('#replayStatus').click();
  await expect.poll(() => raw(page)).toMatch(/\[🎬 [^\]]*TC-7-replay\]\(evidencias\/[^)]+TC-7-replay\.webm\)/);
  expect(await page.evaluate(() => window.__captures)).toBe(1);
  const files = await page.evaluate(() => window.__ls('aplicacoes/Loja/casos/evidencias'));
  expect(files.filter((n) => n.endsWith('-replay.webm'))).toHaveLength(1);
  // o arquivo é um vídeo que abre (cabeçalho do .webm no começo: o pedaço copiado começa no início da gravação)
  const playable = await page.evaluate(async (name) => {
    const d = await (await (await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('ws-replay')).getDirectoryHandle('aplicacoes')).getDirectoryHandle('Loja')).getDirectoryHandle('casos')).getDirectoryHandle('evidencias');
    const file = await (await d.getFileHandle(name)).getFile();
    const v = document.createElement('video');
    v.muted = true;
    v.src = URL.createObjectURL(file);
    return new Promise((resolve) => { v.onloadeddata = () => resolve(v.videoWidth); v.onerror = () => resolve(-1); setTimeout(() => resolve(0), 5000); });
  }, files.find((n) => n.endsWith('-replay.webm')));
  expect(playable).toBe(160);
  await page.locator('#preview a', { hasText: '🎬' }).click();
  await expect(page.locator('.lightbox-video video')).toBeVisible();
  await page.keyboard.press('Escape');
  // o replay continua guardando depois de salvar
  await expect(page.locator('#replayStatus')).toBeVisible();

  // parar a captura desliga o replay
  await page.locator('#captureStatus').click();
  await expect(page.locator('#replayStatus')).toBeHidden();
});

test('replay no bug: criar bug com a captura ligada leva o vídeo para evidencias/ do bug (pode desmarcar)', async ({ page }) => {
  await page.addInitScript(fakeScreen);
  await page.addInitScript(wsInit, 'ws-replay-bug');
  await openEditor(page, { mode: 'split' });
  await openCase(page);
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  await page.locator('#toolbar [data-cmd="capture"]').click();
  await expect(page.locator('#replayStatus')).toBeVisible();
  await page.waitForTimeout(1200);

  await palette(page, 'Novo bug a partir deste documento');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Novo bug BUG-001');
  await expect(dlg.locator('input[data-check="replay"]')).toBeChecked();
  await expect(dlg).toContainText('Levar o replay (os últimos 60 s da janela capturada)');
  await dlg.locator('button', { hasText: 'Criar e abrir' }).click();
  await expect(page.locator('#fileName')).toContainText('BUG-001');
  const bugs = await page.evaluate(() => window.__ls('aplicacoes/Loja/bugs'));
  const name = bugs.find((n) => n.startsWith('BUG-001'));
  const bug = await page.evaluate((p) => window.__read(p), `aplicacoes/Loja/bugs/${name}`);
  expect(bug).toMatch(/## Evidências\n\n\[🎬 [^\]]*TC-7-replay\]\(evidencias\/[^)]+TC-7-replay\.webm\)/);
  const ev = await page.evaluate(() => window.__ls('aplicacoes/Loja/bugs/evidencias'));
  expect(ev.filter((n) => n.endsWith('-replay.webm'))).toHaveLength(1);

  // de novo, agora desmarcando: registra a reincidência sem o vídeo
  await page.keyboard.press('Alt+PageUp');
  await expect(page.locator('#fileName')).toContainText('TC-7');
  await palette(page, 'Novo bug a partir deste documento');
  await expect(dlg).toContainText('já tem bug ligado');
  await dlg.locator('input[data-check="replay"]').uncheck();
  await dlg.locator('button', { hasText: 'Registrar no bug escolhido' }).click();
  await expect(page.locator('#toast')).toContainText('Reincidência registrada em BUG-001');
  const after = await page.evaluate((p) => window.__read(p), `aplicacoes/Loja/bugs/${name}`);
  expect(after).toContain('## Reincidências');
  expect((after.match(/-replay\.webm/g) || []).length).toBe(1);
});

test('replay desligado nas preferências: nada de ⏪ no rodapé nem no diálogo do bug (fluxo como antes)', async ({ page }) => {
  await page.addInitScript(fakeScreen);
  await page.addInitScript(wsInit, 'ws-replay-off');
  await openEditor(page, { mode: 'split' });
  await openCase(page);
  await palette(page, 'Replay instantâneo: duração');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Replay instantâneo');
  await dlg.locator('select').selectOption('0');
  await dlg.locator('button', { hasText: 'Salvar' }).click();
  await expect(page.locator('#toast')).toContainText('Replay instantâneo desligado');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mdqa:prefs')).replaySeconds)).toBe(0);

  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  await page.locator('#toolbar [data-cmd="capture"]').click();
  await expect(page.locator('#captureStatus')).toBeVisible();
  await expect(page.locator('#replayStatus')).toBeHidden();
  await page.keyboard.press('Control+Alt+R');
  await expect(page.locator('#toast')).toContainText('replay instantâneo está desligado');

  await palette(page, 'Novo bug a partir deste documento');
  await expect(dlg).toContainText('Novo bug BUG-001');
  await expect(dlg.locator('input[data-check="replay"]')).toHaveCount(0);
  await dlg.locator('button', { hasText: 'Cancelar' }).click();

  // painel de execução: sem o botão ⏪
  await page.locator('.exec-action[data-act="run"]').click();
  await expect(page.locator('.runner')).toBeVisible();
  await expect(page.locator('.runner [data-act="replay"]')).toHaveCount(0);
});

test('painel de execução: ⏪ Replay salva o vídeo nas evidências do passo', async ({ page }) => {
  await page.addInitScript(fakeScreen);
  await page.addInitScript(wsInit, 'ws-replay-run');
  await openEditor(page, { mode: 'split' });
  await openCase(page);
  await page.locator('.exec-action[data-act="run"]').click();
  const btn = page.locator('.runner [data-act="replay"]');
  await expect(btn).toBeVisible();
  await btn.click(); // liga
  await expect(page.locator('#replayStatus')).toBeVisible();
  await page.waitForTimeout(1200);
  await btn.click(); // salva
  await expect.poll(() => raw(page)).toMatch(/## Evidências[\s\S]*\[🎬 [^\]]*\]\(evidencias\/[^)]+-replay\.webm\)/);
});
