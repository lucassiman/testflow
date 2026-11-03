// R2 (8.2): execuções — E2: com várias abertas, sempre dá para saber qual é e cada ação vai para a da aba.
import { test, expect } from '@playwright/test';
import { openEditor, wsInit } from './helpers.mjs';

const tc = (id) => `---\ntipo: caso-de-teste\nid: ${id}\ntitulo: Caso ${id}\napp: Portal\ntags: [regressao]\n---\n\n# ${id}\n\n| # | Ação | Resultado esperado | Resultado obtido | Status |\n| --- | --- | --- | --- | --- |\n| 1 | Abrir | Abre | | |\n`;

async function workspace(page, name, docs) {
  await page.addInitScript(wsInit, name);
  await openEditor(page, { mode: 'preview', prefs: { sidebar: true, publisherName: 'Lucas' } });
  await page.evaluate(async (list) => { for (const [p, t] of list) await window.__write(p, t); }, docs);
  await page.locator('.sidebar button', { hasText: 'Abrir…' }).first().click();
  await expect(page.locator('[data-side="wsList"] .side-file').first()).toBeVisible();
}

/** Nova rodada com os casos visíveis; devolve o ID da execução (pelo painel). */
async function newRun(page, name, prev = '') {
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="startRun"]');
  await page.click('.app-dialog button:has-text("Continuar")');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('[data-cpk="name"]').fill(name);
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  await expect(page.locator('#toast')).toContainText(/Rodada EXEC-\d{8}-\d{6} criada/);
  const ident = page.locator('#cyclePanel .cp-ident');
  await expect(ident).toHaveText(/^EXEC-\d{8}-\d{6}/);
  if (prev) await expect(ident).not.toHaveText(prev);
  return /** @type {string} */ ((await ident.textContent()) || '').trim();
}

test('E2: duas execuções abertas — o painel e a barra dizem qual é; a aba do caso segue a execução de onde ele veio', async ({ page }) => {
  await workspace(page, 'ws-e2', [['aplicacoes/Portal/casos/TC-1.md', tc('TC-1')]]);
  const a = await newRun(page, 'Rodada A');
  await page.waitForTimeout(1100); // IDs por segundo
  // caso aberto pela A: aba com ▶ e a barra ▶ Execução com o ID da A
  await page.locator('#cyclePanel .cp-item[data-key="TC-1"]').click();
  await expect(page.locator('.runner .run-exec')).toHaveText(a);
  const caseTab = page.locator('.tab', { hasText: 'TC-1' });
  await expect(caseTab.locator('.tab-mark-run')).toHaveAttribute('title', new RegExp(a));
  // a B vira a ativa
  await page.locator('.runner [data-act="close"]').click();
  const b = await newRun(page, 'Rodada B', a);
  expect(b).not.toBe(a);
  // de volta à aba do caso: vale a A (de onde ele veio), não a última criada
  await caseTab.click();
  await expect(page.locator('#cyclePanel .cp-ident')).toHaveText(a);
  // abrindo a B, o painel é o da B; e voltar ao caso (aba) traz a A de novo
  await page.locator('[data-side="wsList"] .side-file', { hasText: 'rodada-b' }).first().click();
  await expect(page.locator('#cyclePanel .cp-ident')).toHaveText(b);
  await caseTab.click();
  await expect(page.locator('#cyclePanel .cp-ident')).toHaveText(a);
});

test('E3: execução nova nasce em execucoes/; as antigas (relatorios/) e os relatórios delas vão pelo 🗂 Mover', async ({ page }) => {
  const old = `---\ntipo: execucao\nid: EXEC-20261001-083000\ntitulo: Rodada antiga\napp: Portal\ninicio: 2026-10-01T08:30\nstatus: PASS\ntags: []\n---\n\n# Rodada antiga\n\n## Casos do ciclo\n\n| # | Caso | Título | Status | Quando | Bugs |\n| --- | --- | --- | --- | --- | --- |\n| 1 | [[TC-1]] | Caso TC-1 | PASS | 01/10 | |\n\n## Relatórios\n\n- 🏁 [[EXEC-20261001-083000-ENC]] — Encerramento\n`;
  const enc = '---\ntipo: relatorio-encerramento\nid: EXEC-20261001-083000-ENC\nexecucao: EXEC-20261001-083000\napp: Portal\n---\n\n# Encerramento\n\nDa [[EXEC-20261001-083000]].\n';
  await workspace(page, 'ws-e3', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1')],
    ['aplicacoes/Portal/relatorios/rodada-antiga.md', old],
    ['aplicacoes/Portal/relatorios/relatorios/EXEC-20261001-083000/01-encerramento.md', enc],
  ]);
  // rodada nova: em execucoes/ (a antiga em relatorios/ não puxa) e o aviso oferece mover as antigas
  await newRun(page, 'Rodada nova');
  await expect.poll(() => page.evaluate(() => window.__ls('aplicacoes/Portal/execucoes'))).toEqual(['rodada-nova.md']);
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Mover execuções para execucoes');
  await page.keyboard.press('Enter');
  const dlg = page.locator('.app-dialog', { hasText: 'Mover execuções para execucoes/' });
  await expect(dlg).toContainText('aplicacoes/Portal/execucoes/ — 1 documento(s)');
  await expect(dlg).toContainText('aplicacoes/Portal/relatorios/EXEC-20261001-083000/ — 1 documento(s)');
  await dlg.locator('button', { hasText: 'Mover' }).click();
  await expect.poll(() => page.evaluate(() => window.__ls('aplicacoes/Portal/execucoes'))).toEqual(['rodada-antiga.md', 'rodada-nova.md']);
  await expect.poll(() => page.evaluate(() => window.__ls('aplicacoes/Portal/relatorios/EXEC-20261001-083000'))).toEqual(['01-encerramento.md']);
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/relatorios/rodada-antiga.md'))).toBeNull();
});

const execDoc = (id, { ciclo = '', numero = 0, fim = '', status = 'PENDING', rows } = {}) => [
  '---', 'tipo: execucao', `id: ${id}`, `titulo: Rodada ${id}`, 'app: Portal', ...(ciclo ? [`ciclo: ${ciclo}`, `numero: ${numero}`] : []),
  `inicio: 2026-10-0${numero || 1}T09:00`, ...(fim ? [`fim: ${fim}`] : []), `status: ${status}`, 'tags: []', '---', '', `# Rodada ${id}`, '',
  '## Casos do ciclo', '', '| # | Caso | Título | Status | Executado em | Bugs |', '| --- | --- | --- | --- | --- | --- |', ...rows, '',
].join('\n');

test('E4: central de execuções — retomar, finalizar com pendentes e descartar (lixeira, com confirmação)', async ({ page }) => {
  const def = '---\ntipo: ciclo-regressao\nid: CICLO-1\ntitulo: Regressão Portal\napp: Portal\ntags: []\n---\n\n# Regressão Portal\n\n## Casos do ciclo\n\n| # | Caso | Título |\n| --- | --- | --- |\n| 1 | [[TC-1]] | Caso TC-1 |\n| 2 | [[TC-2]] | Caso TC-2 |\n';
  await workspace(page, 'ws-e4', [
    ['aplicacoes/Portal/casos/TC-1.md', tc('TC-1')],
    ['aplicacoes/Portal/casos/TC-2.md', tc('TC-2')],
    ['aplicacoes/Portal/execucoes/regressao-portal.md', def],
    ['aplicacoes/Portal/execucoes/exec-1.md', execDoc('EXEC-1', { ciclo: 'CICLO-1', numero: 1, fim: '2026-10-01T18:00', status: 'FAIL', rows: ['| 1 | [[TC-1]] | Caso TC-1 | `PASS` | 01/10 | |', '| 2 | [[TC-2]] | Caso TC-2 | `FAIL` | 01/10 | |'] })],
    ['aplicacoes/Portal/execucoes/exec-2.md', execDoc('EXEC-2', { ciclo: 'CICLO-1', numero: 2, rows: ['| 1 | [[TC-1]] | Caso TC-1 | | | |', '| 2 | [[TC-2]] | Caso TC-2 | | | |'] })],
  ]);
  const openHub = async () => {
    await page.keyboard.press('Control+Shift+P');
    await page.keyboard.type('Central de execuções');
    await page.keyboard.press('Enter');
    await expect(page.locator('.rh-dialog')).toBeVisible();
  };
  await openHub();
  const hub = page.locator('.rh-dialog');
  await expect(hub.locator('[data-rh-tab="andamento"]')).toContainText('1');
  await expect(hub.locator('.rh-item')).toHaveCount(1);
  await expect(hub.locator('.rh-item')).toContainText('EXEC-2');
  await expect(hub.locator('.rh-item')).toContainText('CICLO-1 #2');
  // ciclo salvo: a #2 em andamento e a última finalizada
  await hub.locator('[data-rh-tab="planejados"]').click();
  await expect(hub.locator('.rh-item')).toContainText('#2 em andamento');
  await expect(hub.locator('.rh-item')).toContainText('última: FAIL 50%');
  // finalizadas: descartar a EXEC-1 pede confirmação e vai para a _lixeira
  await hub.locator('[data-rh-tab="finalizadas"]').click();
  await expect(hub.locator('.rh-item [data-rh="retest"]')).toBeVisible();
  await hub.locator('.rh-item [data-rh="discard"]').click();
  const confirm = page.locator('.app-dialog', { hasText: 'Descartar esta execução?' });
  await expect(confirm).toContainText('vai para a _lixeira');
  await confirm.locator('button', { hasText: 'Descartar' }).click();
  await expect(hub.locator('[data-rh-tab="finalizadas"]')).toContainText('0');
  expect(await page.evaluate(() => window.__read('aplicacoes/Portal/execucoes/exec-1.md'))).toBeNull();
  expect((await page.evaluate(() => window.__ls('_lixeira'))) || []).not.toHaveLength(0);
  // em andamento: ▶ Retomar torna a EXEC-2 a da vez e abre
  await hub.locator('[data-rh-tab="andamento"]').click();
  await hub.locator('.rh-item [data-rh="resume"]').click();
  await expect(page.locator('#cyclePanel .cp-ident')).toContainText('EXEC-2');
  // 🏁 Finalizar com pendentes: confirma o SKIP
  await openHub();
  await hub.locator('.rh-item [data-rh="finish"]').click();
  const fin = page.locator('.app-dialog', { hasText: 'Finalizar a execução da rodada?' });
  await expect(fin).toContainText('2 de 2 caso(s) não foram executados');
  await fin.locator('button', { hasText: 'Finalizar e marcar SKIP' }).click();
  await expect.poll(() => page.evaluate(() => window.__read('aplicacoes/Portal/execucoes/exec-2.md'))).toMatch(/^fim: /m);
});

/** Faz o papel da extensão: anuncia-se ao carregar (como o conteudo.js) e responde ao "ola" (pausada com window.__extPausado). */
const fakeExt = () => {
  window.__extPedidos = [];
  window.addEventListener('load', () => setTimeout(() => window.postMessage({ testflow: 'ext', dir: 'presente', versao: '1.56.0' }, location.origin), 50));
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.testflow !== 'ext' || d.dir !== 'pedido') return;
    window.__extPedidos.push(d.tipo);
    if (d.tipo !== 'ola') return;
    setTimeout(() => window.postMessage({ testflow: 'ext', dir: 'resposta', id: d.id, ok: true, dados: { versao: '1.56.0', protocolo: 1, pausado: !!window.__extPausado } }, location.origin), 20);
  });
};

test('E5: com a extensão instalada, a rodada nova diz quando ligar e a barra Execução mostra o estado da captura', async ({ page }) => {
  await page.addInitScript(fakeExt);
  await workspace(page, 'ws-e5', [['aplicacoes/Portal/casos/TC-1.md', tc('TC-1')]]);
  await page.click('button[data-menu="mod-execucao"]');
  await page.click('#mod-execucao [data-cmd="startRun"]');
  await page.click('.app-dialog button:has-text("Continuar")');
  const picker = page.locator('.cpk-dialog');
  await picker.locator('button', { hasText: 'Selecionar visíveis' }).click();
  await picker.locator('button', { hasText: 'Criar e começar' }).click();
  // captura desligada no TestFlow, extensão instalada: o aviso da rodada sugere ligar
  await expect(page.locator('#toast')).toContainText('Quer console e rede nos bugs?');
  await page.locator('#cyclePanel .cp-item[data-key="TC-1"]').click();
  const chip = page.locator('.exec-bar .exec-ext');
  await expect(chip).toHaveAttribute('data-ext', 'off');
  await expect(chip).toContainText('captura desligada');
  expect(await page.evaluate(() => window.__extPedidos)).toEqual([]); // desligada: nada é pedido à extensão
  // clique liga; ligada, mostra "console e rede" e o clique explica quando ligar
  await chip.click();
  await expect(chip).toHaveAttribute('data-ext', 'on');
  await chip.click();
  const help = page.locator('.app-dialog', { hasText: 'Console e rede no bug (extensão)' });
  await expect(help).toContainText('antes do 1º caso da execução');
  await expect(help).toContainText('recarregue');
  await help.locator('button', { hasText: 'Entendi' }).click();
});
