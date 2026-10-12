// 12.2 (1.59.0): a pasta exemplos/ aberta como pasta de trabalho mostra os recursos de Casos e Execução — a Loja Demo
// na Sprint 43 (épico QA-400 Pagamento com Pix, release 2.15.0).
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { openEditor, wsInit } from './helpers.mjs';

const walk = (d, b = '') => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p, `${b}${n}/`) : n.endsWith('.md') ? [[`${b}${n}`, readFileSync(p, 'utf8')]] : []; });

/** @param {import('@playwright/test').Page} page @param {string} ws */
async function openExamples(page, ws) {
  await page.addInitScript(wsInit, ws);
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true, publisherName: 'Lucas' } });
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(p, t); }, walk('exemplos'));
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file').first()).toBeVisible();
}

/** Abre pela árvore (o nome do arquivo, sem .md). @param {import('@playwright/test').Page} page @param {string} name */
async function open(page, name) {
  await page.locator('[data-side="wsList"]').getByRole('button', { name, exact: true }).first().click();
  await expect(page.locator('#fileName')).toContainText(name);
}

test('Casos: dois logins compartilhados, massa por ambiente, iterações e os estados da aprovação', async ({ page }) => {
  await openExamples(page, 'ws-exemplos-casos');
  await open(page, 'TC-008-atendente-estorna-um-pix');
  const prev = page.locator('#preview');
  await expect(prev.locator('table:has(.sh-inc)').first().locator('.sh-inc')).toHaveCount(2); // ↪ Fazer login (cliente) e (atendente)
  await expect(page.locator('#docState [data-state="approval"]')).toContainText('alterado');

  // 🔑: os logins do HML (o ambiente do caso); o gestor ainda sem conta em produção
  await page.keyboard.press('Alt+k');
  const sh = page.locator('#sharedPanel');
  await expect(sh).toContainText('cliente.ativo@lojademo.test');
  await expect(sh.locator('.sh-env-miss')).toHaveText(['falta PROD']);
  await page.keyboard.press('Alt+k');
  await expect(prev.locator('.sh-var').first()).toHaveText('cliente.ativo@lojademo.test');
  // 🌐 PROD: a massa de produção, sem mudar o caso
  const chip = page.locator('#envChip');
  await chip.click();
  await page.locator('.cmd-menu .cmd-item', { hasText: 'PROD' }).click();
  await expect(prev.locator('.sh-var').first()).toHaveText('qa.cliente@lojademo.test');
  await chip.click();
  await page.locator('.cmd-menu .cmd-item', { hasText: 'Usar o do cabeçalho' }).click();
  await expect(chip).toContainText('HML');

  // caso com dados: uma execução por linha da tabela Iterações
  await open(page, 'TC-007-limites-de-valor-do-pix');
  await page.locator('.exec-bar [data-act="run"]').click();
  await expect(page.locator('.runner .run-iter')).toContainText('/3');

  // aprovação: rascunho · em revisão · aprovado
  for (const [name, state] of [['TC-009-menu-da-conta-por-perfil', 'elaboração'], ['TC-006-qr-code-do-pix-expirado', 'revisão'], ['TC-005-pagar-com-pix-pelo-qr-code', 'aprovado']]) {
    await open(page, name);
    await expect(page.locator('#docState [data-state="approval"]')).toContainText(state);
  }
  await expect(page.locator('#docState [data-state="approval"]')).not.toContainText('alterado');
});

test('Execução: rodada em andamento com testadores, previsão e status personalizados; ciclo, relatórios, release e tendência', async ({ page }) => {
  await openExamples(page, 'ws-exemplos-execucao');
  await open(page, 'regressao-do-pix-execucao-3');
  const panel = page.locator('#cyclePanel');
  await expect(panel.locator('.cp-item')).toHaveCount(4);
  await expect(panel.locator('.cp-item', { hasText: 'TC-006' }).locator('.cp-who')).toHaveText('B');
  await expect(panel.locator('.cp-item', { hasText: 'TC-007' }).locator('.cp-who')).toHaveClass(/mine/); // Lucas = você
  await expect(panel.locator('.cp-load')).toContainText('Ana');
  await expect(panel.locator('.cp-forecast')).toContainText('faltam');
  await expect(panel.locator('.cp-before')).toContainText('Antes da rodada');
  await expect(panel.locator('.cp-item', { hasText: 'TC-008' })).toContainText(/em andamento/i);

  // status personalizado (configuracao/status.md) no passo do caso
  await open(page, 'TC-006-qr-code-do-pix-expirado');
  await expect(page.locator('#preview td .badge-custom', { hasText: 'FALHA CONHECIDA' })).toHaveCount(1);

  // ciclo salvo: a tabela Execuções com a #3 em andamento; o smoke com matriz ainda sem execução
  await open(page, 'regressao-do-pix');
  await expect(page.locator('#preview td', { hasText: 'em andamento' })).toHaveCount(1);
  await open(page, 'smoke-do-pix-multiplataforma');
  await expect(page.locator('#preview')).toContainText('3 configuração(ões)');

  // os relatórios da execução #2, a release e a tendência (visões ao vivo)
  await open(page, '01-encerramento');
  await expect(page.locator('#preview')).toContainText('NÃO LIBERAR');
  await open(page, 'REL-001-loja-demo-2-15-0');
  await expect(page.locator('#preview .qa-view')).toContainText('Ainda não');
  await open(page, 'tendencia');
  await expect(page.locator('#preview .qa-view')).toContainText('EXEC-20260924-140000');
});
