// 11.5 (1.56.0): página da rodada para o time — HTML na pasta oficial, regravado a cada caso e no encerramento.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

/** A pasta oficial (OneDrive) simulada: outra pasta do OPFS no seletor de pastas. */
const officialInit = () => {
  const ws = window.showDirectoryPicker;
  window.__off = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('ws-pagina-oficial', { create: true });
  window.showDirectoryPicker = async (o) => (o?.id === 'mdqa-official' ? window.__off() : ws(o));
  window.__offRead = async (path) => {
    try {
      let d = await window.__off();
      const parts = path.split('/');
      for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
      return await (await (await d.getFileHandle(parts.at(-1))).getFile()).text();
    } catch { return null; }
  };
  window.__offLs = async (dir) => { try { const out = []; for await (const k of (await (await window.__off()).getDirectoryHandle(dir)).keys()) out.push(k); return out.sort(); } catch { return null; } };
};

const tc = (id, title) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: ${title}\napp: Portal\nprioridade: Alta\n---\n\n# ${id} — ${title}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n| 2 | Entrar com joao@empresa.com | Dashboard | | |\n`;

/** @param {import('@playwright/test').Page} page @param {string} text */
async function palette(page, text) {
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('página da rodada: ligar, publicar a cada caso (em andamento, recarrega sozinha) e no encerramento; índice das rodadas', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-pagina');
  await page.addInitScript(officialInit);
  await openEditor(page, { mode: 'split', prefs: { publisherName: 'Ana' } });
  await page.evaluate(async ([a, b]) => {
    await window.__write('aplicacoes/Portal/casos/TC-1.md', a);
    await window.__write('aplicacoes/Portal/casos/TC-2.md', b);
  }, [tc('TC-1', 'Login'), tc('TC-2', 'Cadastro')]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(2);
  const dlg = page.locator('.app-dialog');

  // sem pasta oficial: o diálogo avisa
  await palette(page, 'Página da rodada para o time');
  await expect(dlg).toContainText('A pasta oficial ainda não está configurada');
  await dlg.locator('button', { hasText: 'Fechar' }).click();
  // configurar a pasta oficial e ligar
  await page.click('[data-side="official"]');
  await dlg.locator('button', { hasText: 'Escolher pasta' }).click();
  await expect(page.locator('[data-side="official"]')).toContainText('ws-pagina-oficial');
  await palette(page, 'Página da rodada para o time');
  await dlg.locator('button', { hasText: 'Ligar' }).click();
  await expect(page.locator('#toast')).toContainText('Página da rodada ligada');

  // rodada: TC-1 falha → a página aparece na pasta oficial
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill('Regressão 2.14');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  const panel = page.locator('#cyclePanel');
  await panel.locator('[data-cp="next"]').click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await expect(page.locator('.runner')).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await page.locator('.runner .run-actual').fill('Erro 500');
  await page.locator('.runner [data-act="finish"]').click();
  await expect(page.locator('#fileName')).toContainText('TC-2');
  await expect.poll(() => page.evaluate(() => window.__offLs('acompanhamento')), { timeout: 8000 }).toHaveLength(2);
  const files = await page.evaluate(() => window.__offLs('acompanhamento'));
  const pageFile = files.find((f) => f !== 'index.html');
  expect(pageFile).toMatch(/^EXEC-\d{8}-\d{6}\.html$/);
  const open = await page.evaluate((f) => window.__offRead(`acompanhamento/${f}`), pageFile);
  expect(open).toContain('<meta http-equiv="refresh" content="60">');
  expect(open).toContain('<h1>▶ Regressão 2.14</h1>');
  expect(open).toMatch(/<b>TC-1<\/b><\/td><td>Login<div class="step">Passo 2: Entrar com [^<]+→ Erro 500<\/div><\/td><td><span class="badge fail">FAIL<\/span>/);
  expect(open).not.toContain('joao@empresa.com');
  expect(open).toContain('<span class="badge pending">PENDENTE</span>');
  const index = await page.evaluate(() => window.__offRead('acompanhamento/index.html'));
  expect(index).toContain(`<a href="${pageFile}">Regressão 2.14</a>`);
  expect(index).toContain('▶ em andamento');

  // TC-2 passa; finalizar → 🏁 com a recomendação, sem recarregar
  await expect(page.locator('.runner')).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('1');
  await page.locator('.runner [data-act="finish"]').click();
  await expect(page.locator('#fileName')).toContainText('regressao-2-14');
  await panel.locator('[data-cp="finish"]').click();
  await dlg.locator('button', { hasText: 'Finalizar execução' }).click();
  await expect(page.locator('#toast')).toContainText('Página da rodada atualizada na pasta oficial', { timeout: 8000 });
  const closed = await page.evaluate((f) => window.__offRead(`acompanhamento/${f}`), pageFile);
  expect(closed).toContain('<h1>🏁 Regressão 2.14</h1>');
  expect(closed).not.toContain('http-equiv="refresh"');
  expect(closed).toMatch(/<b>Recomendação:<\/b> (NÃO LIBERAR|LIBERAR COM RESSALVAS|LIBERAR)/);
  expect(closed).toContain('<b>50%</b>');
  expect(await page.evaluate(() => window.__offRead('acompanhamento/index.html'))).toContain('🏁 encerrada');
  await page.locator('.rs-dialog button', { hasText: 'Fechar' }).click();

  // ver a página (prévia numa aba) e desligar
  await palette(page, 'Página da rodada para o time');
  const popup = page.waitForEvent('popup');
  await dlg.locator('button', { hasText: 'Ver a página' }).click();
  const preview = await popup;
  await expect(preview.locator('h1')).toContainText('Regressão 2.14');
  await preview.close();
  await palette(page, 'Página da rodada para o time');
  await dlg.locator('button', { hasText: 'Desligar' }).click();
  await expect(page.locator('#toast')).toContainText('Página da rodada desligada');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mdqa:prefs')).roundPage)).toEqual({ on: false });
});
