// 11.3: planejar e executar — previsão de tempo da rodada (1.44.0)…
import { test, expect } from '@playwright/test';
import { openEditor, wsInit, roundMore } from './helpers.mjs';

const HIST = '\n## Histórico de execuções\n\n| Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n| 1 | 01/10/2026 | 10:00 | 10:20 | 20 min | | `PASS` | |\n\n### Rodada 1 — 01/10/2026 — `PASS`\n';
export const tc = (id, extra = '', hist = '') => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\ntags: [regressao]\n${extra}---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n${hist}`;

export async function workspace(page, name, docs) {
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true, publisherName: 'Lucas' } });
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(p, t); }, docs);
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file').first()).toBeVisible();
}

export async function newRun(page, filter = '') {
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  if (filter) await picker.locator('.cpk-search').fill(filter);
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  await expect(page.locator('.cp-item').first()).toBeVisible();
}

test('previsão: o painel da rodada mostra quanto falta pela duração média dos casos', async ({ page }) => {
  await workspace(page, 'ws-previsao', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1', '', HIST)],
    ['aplicacoes/Portal/casos/TC-2.md', tc('TC-2', '', HIST.replace('20 min', '40 min'))],
    ['aplicacoes/Portal/casos/TC-3.md', tc('TC-3')],
  ]);
  await newRun(page);
  const fc = page.locator('.cp-forecast');
  // 20 + 40 + (sem histórico: média 30) = 1 h 30 min
  await expect(fc).toContainText('faltam ~1 h 30 min (3 casos)');
  await expect(fc).toHaveAttribute('title', /1 sem histórico/);
});

test('atribuir: 👥 distribui os pendentes, chip do testador, filtro Minhas, carga e ▶ Próximo caso é o meu', async ({ page }) => {
  await workspace(page, 'ws-atribuir', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1', '', HIST.replace('20 min', '30 min'))],
    ['aplicacoes/Portal/casos/TC-2.md', tc('TC-2', '', HIST)],
    ['aplicacoes/Portal/casos/TC-3.md', tc('TC-3', '', HIST)],
  ]);
  await newRun(page);
  await roundMore(page, 'assign');
  await page.locator('.app-dialog-field input').first().fill('Lucas, Bruno');
  await page.locator('.app-dialog-foot button', { hasText: 'Atribuir' }).click();
  await expect(page.locator('#toast')).toContainText('Distribuídos — Lucas: 1 (~30 min) · Bruno: 2 (~40 min)');
  await expect(page.locator('.cp-item', { hasText: 'TC-1' }).locator('.cp-who')).toHaveText('L');
  await expect(page.locator('.cp-item', { hasText: 'TC-1' }).locator('.cp-who')).toHaveClass(/mine/);
  await expect(page.locator('.cp-load')).toContainText('Bruno 2');
  await page.locator('.cp-fchip[data-f="minhas"]').click();
  await expect(page.locator('.cp-item')).toHaveCount(1);
  // trocar o testador pelo chip
  await page.locator('.cp-fchip[data-f="todos"]').click();
  await page.locator('.cp-item', { hasText: 'TC-2' }).locator('.cp-who').click();
  await page.locator('.cmd-menu .cmd-item', { hasText: 'Lucas (eu)' }).click();
  await expect(page.locator('.cp-item', { hasText: 'TC-2' }).locator('.cp-who')).toHaveClass(/mine/);
  await page.keyboard.press('Control+s');
  // ▶ Próximo caso abre um dos meus (TC-1)
  await page.locator('.cp-btn[data-cp="next"]').click();
  await expect(page.locator('#preview h1')).toHaveText('TC-1');
});

test('matriz: nova rodada em HML e PROD cria uma execução por configuração; o caso feito em HML segue pendente em PROD', async ({ page }) => {
  await workspace(page, 'ws-matriz', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1')],
  ]);
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="matrix"] summary').click();
  await picker.locator('[data-mx="ambientes"]').fill('HML, PROD');
  await picker.locator('[data-mx="navegadores"]').fill('Chrome');
  await expect(picker.locator('[data-cpk="mxnote"]')).toContainText('2 execução(ões): HML · Chrome · PROD · Chrome');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  await expect(page.locator('#toast')).toContainText('2 execução(ões) — uma por configuração');
  const cfg = page.locator('.cp-cfg');
  await expect(cfg).toHaveCount(2);
  await expect(cfg.nth(0)).toHaveClass(/on/);
  await page.locator('.cp-btn[data-cp="next"]').click();
  await expect(page.locator('#envChip')).toContainText('HML'); // o ambiente vem da rodada
  await expect(page.locator('.runner .run-step')).toBeVisible();
  await page.keyboard.press('1');
  await page.locator('.runner [data-act="finish"]').click();
  await expect(page.locator('.cp-cfg', { hasText: 'HML' })).toContainText('1/1');
  await page.locator('.cp-cfg', { hasText: 'PROD' }).click();
  await expect(page.locator('.cp-cfg', { hasText: 'PROD' })).toHaveClass(/on/);
  await expect(page.locator('.cp-item', { hasText: 'TC-1' })).toHaveClass(/cp-pendente|cp-atual/);
  await page.locator('.cp-btn[data-cp="next"]').click();
  await expect(page.locator('#envChip')).toContainText('PROD');
  await expect(page.locator('#preview td', { hasText: /HML · Chrome/ })).toHaveCount(1); // histórico da rodada em HML
});

test('release: o documento da release mostra o progresso de tudo com a mesma versão; a rodada pode nascer com a versão', async ({ page }) => {
  const rel = `---\ntipo: release\nid: REL-001\ntitulo: Release 2.14\napp: Portal\nversao: 2.14\nprevista: 2099-01-01\nsituacao: em-teste\n---\n\n# REL-001\n\n\`\`\`qa-visao\ntitulo: Progresso\nformato: release\nversao: 2.14\n\`\`\`\n\n## Critérios de saída\n\n- [x] Regressão executada\n`;
  await workspace(page, 'ws-release', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1', 'versao: 2.14\n')],
    ['aplicacoes/Portal/casos/TC-2.md', tc('TC-2')],
    ['aplicacoes/Portal/releases/rel-2-14.md', rel],
  ]);
  // rodada com a versão (vínculos)
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="newRun"]');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('.cpk-search').fill('TC-2');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('.cpk-links summary').click();
  await picker.locator('input[data-link="versao"]').fill('2.14');
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  await expect(page.locator('.cp-chip', { hasText: '2.14' })).toBeVisible();
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'rel-2-14' }).first().click();
  const view = page.locator('#preview .qa-view');
  await expect(view.locator('.qa-view-sum')).toContainText('Versão 2.14: 0/2 casos executados');
  await expect(view.locator('.qa-view-group', { hasText: 'Execuções' })).toBeVisible();
  await expect(view).toContainText('1 caso(s) sem resultado'.replace('1', '2'));
});

test('status personalizados: a paleta cria configuracao/status.md; as palavras viram etiquetas, teclas 6–9 e contam como o tipo', async ({ page }) => {
  await workspace(page, 'ws-status', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1').replace('| 1 | Abrir | Abre | | |\n', '| 1 | Abrir | Abre | | |\n| 2 | Entrar | Painel | | |\n')],
  ]);
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Status personalizados');
  await page.keyboard.press('Enter');
  await expect(page.locator('#preview h1')).toHaveText('Status personalizados');
  await expect(page.locator('#preview .badge-custom', { hasText: 'FALHA CONHECIDA' })).toHaveCount(0); // a tabela usa a palavra sem crase
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'TC-1' }).first().click();
  await page.locator('#preview td.status-cell[data-row="0"]').click();
  const pop = page.locator('.status-pop');
  await expect(pop.locator('.badge-custom')).toHaveCount(3);
  await page.keyboard.press('7'); // FALHA CONHECIDA → próxima linha
  await page.keyboard.press('Escape');
  const badge = page.locator('#preview td .badge-custom', { hasText: 'FALHA CONHECIDA' });
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveClass(/badge-fail/);
  await expect(page.locator('.exec-bar')).toContainText('FAIL 1');
  // painel de execução: os botões dos personalizados
  await page.locator('.exec-bar [data-act="run"]').click();
  await expect(page.locator('.runner .run-status .badge-custom')).toHaveCount(3);
  await page.keyboard.press('6');
  await expect(page.locator('#preview td .badge-custom', { hasText: 'RETESTE' })).toHaveCount(1);
});
