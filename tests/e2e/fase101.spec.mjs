// Fase 10.1 com a pasta exemplos/: a rodada nasce em execucoes/, casos com resultado antigo aparecem como pendentes
// (com o último resultado em cinza) e o cenário BDD executa pela tabela de cenários.
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { openEditor, wsInit } from './helpers.mjs';

const walk = (d, b = '') => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p, `${b}${n}/`) : n.endsWith('.md') ? [[`${b}${n}`, readFileSync(p, 'utf8')]] : [];
});

test('rodada com os exemplos: nasce em execucoes/, pendente × último resultado, BDD executa', async ({ page }) => {
  // relógio depois de todas as datas dos exemplos: rodando no mesmo dia de uma rodada deles (ex.: 12/10/2026), os
  // arquivos gravados agora no teste pareceriam mexidos nesta rodada ("em andamento")
  await page.clock.setFixedTime(new Date(2026, 11, 1, 9, 0));
  await page.addInitScript(wsInit, 'ws-fase101');
  await openEditor(page, { mode: 'preview', prefs: { publisherName: 'Lucas' } });
  const files = walk('exemplos');
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(p, t); }, files);
  await page.click('#sidebarBtn');
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file').first()).toBeVisible();
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill('Regressão');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();

  const panel = page.locator('#cyclePanel');
  // todos os casos, cenários e checklists da pasta (a .versoes/ não conta)
  const casos = files.filter(([p, t]) => !p.startsWith('.versoes/') && /^tipo: (caso-de-teste|cenario-bdd|checklist)$/m.test(t)).length;
  expect(casos).toBeGreaterThan(6);
  await expect(panel.locator('.cp-item')).toHaveCount(casos);
  // nada começou nesta rodada: nenhum "em andamento"
  await expect(panel.locator('.cp-andamento')).toHaveCount(0);
  const tc2 = panel.locator('.cp-item', { hasText: 'TC-002' });
  await expect(tc2.locator('.cp-tail')).toContainText('pendente');
  await expect(tc2.locator('.cp-last')).toHaveText('último: FAIL');
  await expect(panel.locator('.cp-item', { hasText: 'TC-003' }).locator('.cp-last')).toHaveCount(0);

  // a rodada foi para a pasta de execuções que já existia, não para a _entrada/
  expect(await page.evaluate(() => window.__ls('execucoes'))).toEqual([...new Set(files.filter(([p]) => p.startsWith('execucoes/')).map(([p]) => p.split('/')[1])), 'regressao.md'].sort());
  expect(await page.evaluate(() => window.__ls('_entrada'))).toBeNull();

  // cenário BDD: abre e executa pela tabela "Cenário | Status" (a rodada antiga vai para o histórico)
  await panel.locator('.cp-item', { hasText: 'CEN-001' }).click();
  await expect(page.locator('#fileName')).toContainText('CEN-001');
  await expect(page.locator('.runner .run-step')).toContainText('Passo 1 (1 de 3)');
  await expect(page.locator('.runner')).toContainText('Adicionar um produto');
  await expect(page.locator('#toast')).not.toContainText('Nenhuma tabela');
  await expect(panel.locator('.cp-item', { hasText: 'CEN-001' }).locator('.cp-tail')).toContainText('em execução');
  for (let i = 0; i < 3; i++) await page.keyboard.press('1');
  await page.locator('.runner button', { hasText: 'Concluir' }).first().click();
  await expect(panel.locator('.cp-item', { hasText: 'CEN-001' }).locator('.cp-tail')).toContainText('PASS', { timeout: 10_000 });
});
