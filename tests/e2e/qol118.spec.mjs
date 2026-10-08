// QoL de 07/10 (tarde): reabrir bug (reincidência) em vez de criar outro, e lembrete + backup da pasta de trabalho.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8Dwn4GBgYGJgYEBAB0EAgGYBWbnAAAAAElFTkSuQmCC';
const CASE = '---\ntipo: caso-de-teste\nid: TC-042\ntitulo: Login bloqueado\napp: Portal\nambiente: HML\nversao: 2.15.0\n---\n\n# TC-042 — Login bloqueado\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir /login | Tela exibida | ok | `PASS` |\n| 2 | Senha errada 3x | Mensagem de bloqueio | Erro 500 de novo | `FAIL` |\n\n## Evidências\n\n![Passo 2 — erro](evidencias/erro2.png)\n';
const BUG = '---\ntipo: bug\nid: BUG-004\ntitulo: Erro 500 ao bloquear\nstatus: PASS\n---\n\n# BUG-004 — Erro 500 ao bloquear\n\n## Resumo\n\nEncontrado em [[TC-042]] (passo 2).\n\n## Evidências\n';

async function openCase(page, name) {
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async ([c, b, png]) => {
    await window.__write('aplicacoes/Portal/casos/TC-042.md', c);
    await window.__write('aplicacoes/Portal/casos/evidencias/erro2.png', window.__bytes(png));
    await window.__write('aplicacoes/Portal/bugs/BUG-004.md', b);
  }, [CASE, BUG, PNG]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-042' }).click();
  await expect(page.locator('#fileName')).toContainText('TC-042');
  await page.locator('#preview h1').click();
  await page.keyboard.press('Escape');
  await page.locator('#previewPane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('/');
  await page.keyboard.type('bug');
  await expect(page.locator('.cmd-item.active')).toContainText('Bug novo, ligado a este documento');
  await page.keyboard.press('Enter');
}

test('bug já ligado ao caso: registrar a reincidência reabre o bug, leva o print e liga o caso', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error(`diálogo nativo inesperado: ${d.message()}`); });
  await openCase(page, 'ws-reincidencia');
  const dlg = page.locator('.app-dialog');
  await expect(dlg).toContainText('Este documento já tem bug ligado: BUG-004');
  await expect(dlg.locator('select')).toContainText('BUG-004 — Erro 500 ao bloquear · fechado (PASS)');
  await expect(dlg.locator('input[data-check="prints"]')).toBeChecked();
  await dlg.locator('button', { hasText: 'Registrar no bug escolhido' }).click();
  await expect(page.locator('#toast')).toContainText('Reincidência registrada em BUG-004 (1ª) — reaberto: status PASS → FAIL');
  await expect(page.locator('#fileName')).toContainText('BUG-004');
  const bug = await page.evaluate(() => window.__read('aplicacoes/Portal/bugs/BUG-004.md'));
  expect(bug).toMatch(/^status: FAIL$/m);
  expect(bug).toContain('## Reincidências');
  expect(bug).toMatch(/### \d\d\/\d\d\/\d{4} \d\d:\d\d — \[\[TC-042\]\] passo 2/);
  expect(bug).toContain('- Obtido: Erro 500 de novo');
  expect(bug).toContain('- Versão 2.15.0 · Ambiente HML');
  expect(bug).toMatch(/!\[Reincidência [^\]]+\]\(evidencias\/erro2\.png\)/);
  expect(await page.evaluate(() => window.__ls('aplicacoes/Portal/bugs/evidencias'))).toEqual(['erro2.png']);
  await page.keyboard.press('Alt+PageUp');
  await expect(page.locator('#fileName')).toContainText('TC-042');
  expect(await raw(page)).toContain('🐞 Bug: [[BUG-004]] — Erro 500 ao bloquear');
});

test('bug já ligado: "Criar bug novo" segue para o bug novo de sempre', async ({ page }) => {
  await openCase(page, 'ws-reincidencia-novo');
  const dlg = page.locator('.app-dialog');
  await dlg.locator('button', { hasText: 'Criar bug novo' }).click();
  await expect(dlg).toContainText('Novo bug BUG-005');
});

test('lembrete de backup: pasta sem cópia há dias → avisa; "Fazer backup" grava o .zip com tudo', async ({ page }) => {
  await page.addInitScript(() => {
    // a pasta foi vista há 10 dias e nunca teve backup
    localStorage.setItem('mdqa:backup:seen:ws-backup', String(Date.now() - 10 * 86400000));
    window.showSaveFilePicker = async ({ suggestedName }) => {
      window.__savedName = suggestedName;
      const root = await navigator.storage.getDirectory();
      return root.getFileHandle('backup-test.zip', { create: true });
    };
  });
  await page.addInitScript(wsInit, 'ws-backup');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async (png) => {
    await window.__write('aplicacoes/Portal/casos/TC-1.md', '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Login\n---\n\n# TC-1\n');
    await window.__write('aplicacoes/Portal/casos/evidencias/p.png', window.__bytes(png));
    await window.__write('aplicacoes/Portal/casos/evidencias/.anotacoes/p.png.json', '{}');
    await window.__write('node_modules/x/index.js', 'ignorar');
  }, PNG);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  const toast = page.locator('#toast');
  await expect(toast).toContainText('está sem backup (nenhum feito pelo editor)');
  await toast.locator('.toast-action', { hasText: 'Fazer backup' }).click();
  await expect(toast).toContainText('💾 Backup salvo: backup-test.zip — 1 documento(s), 3 arquivo(s)');
  expect(await page.evaluate(() => window.__savedName)).toMatch(/^ws-backup-backup-\d{4}-\d\d-\d\d_\d{4}\.zip$/);
  const zip = await page.evaluate(async () => {
    const f = await (await (await navigator.storage.getDirectory()).getFileHandle('backup-test.zip')).getFile();
    return new TextDecoder('latin1').decode(await f.arrayBuffer());
  });
  expect(zip.startsWith('PK')).toBe(true);
  expect(zip).toContain('ws-backup/aplicacoes/Portal/casos/TC-1.md');
  expect(zip).toContain('ws-backup/aplicacoes/Portal/casos/evidencias/p.png');
  expect(zip).toContain('ws-backup/aplicacoes/Portal/casos/evidencias/.anotacoes/p.png.json');
  expect(zip).not.toContain('node_modules');
  expect(Number(await page.evaluate(() => localStorage.getItem('mdqa:backup:at:ws-backup')))).toBeGreaterThan(0);

  // recarregar: com backup feito agora, não lembra de novo
  await page.reload();
  await page.waitForSelector('#preview .md-block');
  await page.waitForTimeout(1500);
  await expect(toast).not.toContainText('sem backup');
});
