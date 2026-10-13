// 📅 Dia: começar o dia (tarefas que passam), Alt+T sem sair do documento, reunião, fechar o dia e a semana.
import { test, expect } from '@playwright/test';
import { openEditor, raw, wsInit } from './helpers.mjs';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const path = (s) => `diario/${s.slice(0, 4)}/${s.slice(5, 7)}/${s}.md`;
const now = new Date();
const today = iso(now);
const before = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 12));
const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

test('diário: começar o dia traz as abertas; Alt+T de um caso; reunião; fechar o dia; semana', async ({ page }) => {
  await page.addInitScript(wsInit, 'ws-diario');
  await openEditor(page, { mode: 'preview' });
  await page.evaluate(async ([p, d]) => {
    await window.__write(p, `---\ntipo: dia\ntitulo: Antes\ndata: ${d}\n---\n\n# Antes\n\n## Tarefas\n\n- [ ] Pedir logs ao dev\n- [x] Já feita\n- [ ] Revisar o plano\n\n## Fechamento\n`);
    await window.__write('aplicacoes/Portal/casos/TC-1.md', '---\ntipo: caso-de-teste\nid: TC-1\ntitulo: Pagar\napp: Portal\n---\n\n# TC-1 — Pagar\n');
  }, [path(before), before]);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file')).toHaveCount(2);

  // ☀ Começar o dia
  await page.click('button[data-menu="mod-dia"]');
  await page.click('#mod-dia [data-cmd="startDay"]');
  await expect(page.locator('#fileName')).toContainText(today);
  let doc = await raw(page);
  expect(doc).toMatch(/^tipo: dia$/m);
  expect(doc).toContain(`- [ ] Pedir logs ao dev ↪ desde ${dm(before)}`);
  expect(doc).toContain(`- [ ] Revisar o plano ↪ desde ${dm(before)}`);
  expect(doc).not.toContain('Já feita');
  const old = await page.evaluate((p) => window.__read(p), path(before));
  expect(old).toContain(`- ↪ Pedir logs ao dev _(passou para ${dm(today)})_`);
  expect(old).toContain('- [x] Já feita');

  // Alt+T de dentro de um caso: a tarefa vai para o dia, ligada ao caso, e o caso continua aberto
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).first().click();
  await expect(page.locator('#fileName')).toContainText('TC-1');
  await page.keyboard.press('Alt+t');
  await page.locator('.app-dialog input[type="text"]').fill('Conferir o QR expirado @hoje');
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toContainText('Tarefa anotada');
  await expect(page.locator('#fileName')).toContainText('TC-1');
  const disk = await page.evaluate((p) => window.__read(p), path(today));
  expect(disk).toContain(`- [ ] Conferir o QR expirado [[TC-1]] 📅 ${today}`);

  // 👥 Reunião hoje
  await page.click('button[data-menu="mod-dia"]');
  await page.click('#mod-dia [data-cmd="newMeeting"]');
  await page.locator('.app-dialog input[type="text"]').fill('14:30 Alinhamento do Pix');
  await page.keyboard.press('Enter');
  await expect(page.locator('#fileName')).toContainText(today);
  doc = await raw(page);
  expect(doc).toMatch(/### 14:30 — Alinhamento do Pix\n\n\*\*Com:\*\*\n\n\*\*Decisões:\*\*/);

  // 🌙 Fechar o dia: a primeira feita, o resto fica
  await page.click('button[data-menu="mod-dia"]');
  await page.click('#mod-dia [data-cmd="finishDay"]');
  const dlg = page.locator('.app-dialog');
  await expect(dlg.locator('.app-dialog-row')).toHaveCount(3);
  await dlg.locator('.app-dialog-row').first().locator('select').selectOption('feita');
  await dlg.locator('.app-dialog-row').nth(1).locator('select').selectOption('data');
  await expect(dlg.locator('.app-dialog-row').nth(1).locator('input[type="date"]')).toBeVisible();
  await dlg.locator('button', { hasText: 'Fechar o dia' }).click();
  await expect(page.locator('#toast')).toContainText('Dia fechado');
  doc = await raw(page);
  expect(doc).toMatch(/^- \[x\] Pedir logs ao dev/m);
  expect(doc).toMatch(/^- \[ \] Revisar o plano 📅 \d{4}-\d\d-\d\d ↪ desde/m);
  expect(doc).toMatch(/\*\*Fechado às \d\d:\d\d\*\* — feitas: 1 ·/);

  // 📅 Semana
  await page.click('button[data-menu="mod-dia"]');
  await page.click('#mod-dia [data-cmd="week"]');
  await expect(page.locator('#fileName')).toContainText('semana');
  await expect(page.locator('#preview .qa-view-group', { hasText: 'Em aberto' })).toBeVisible();
  await expect(page.locator('#preview .qa-view-table').filter({ hasText: 'Conferir o QR expirado' })).toBeVisible();
});
