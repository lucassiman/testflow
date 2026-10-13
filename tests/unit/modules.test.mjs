// 12.1 (1.57.0): registro de módulos — menus do topo e paleta saem da mesma lista; nada fica sem módulo nem repetido.
// 1.58.0: ⋯ do painel da rodada e da barra Execução, atalhos da tela inicial e o "Onde fica…?" do manual conferidos contra o registro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODULES, paletteActions, menuHtml, topModulesHtml, moduleOf, findItem, groupByModule, moreItemsHtml, moreMenuHtml, EXEC_BAR_MORE, HOME_SHORTCUTS, homeShortcuts } from '../../src/ui/modules.js';

const main = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
/** Comandos tratados fora do `run()` (a paleta chama direto). */
const OUTSIDE_RUN = new Set(['toggleTheme', 'pickWorkspace', 'pickFolder']);

test('toda ação do registro existe no run() do main.js', () => {
  const cmds = new Set(MODULES.flatMap((m) => m.sections.flatMap((s) => s.items.map((it) => it.cmd))));
  const missing = [...cmds].filter((c) => !OUTSIDE_RUN.has(c) && !main.includes(`case '${c}'`));
  assert.deepEqual(missing, []);
});

test('paleta: cada ação uma vez só, com categoria = módulo', () => {
  const acts = paletteActions();
  const ids = acts.map((a) => `${a.cmd}-${a.value}`);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  assert.ok(acts.length >= 110, `só ${acts.length} ações na paleta`);
  for (const a of acts) assert.equal(a.group, moduleOf(a.cmd, a.value)?.label);
  // as que antes só existiam na paleta continuam lá
  for (const c of ['trend', 'customStatus', 'teamsPref', 'roundPage', 'reporterSetup', 'featureAll', 'jiraCreate', 'approval', 'envMenu', 'bulkEdit', 'focusMode']) {
    assert.ok(acts.some((a) => a.cmd === c), c);
  }
  // atalho no lugar certo (antes o do modo foco estava no campo do valor)
  assert.equal(acts.find((a) => a.cmd === 'focusMode')?.keys, 'Ctrl+Shift+.');
});

test('menus do topo: um por módulo, ações agrupadas, sem as misturas de antes', () => {
  const top = MODULES.filter((m) => m.top).map((m) => m.label);
  assert.deepEqual(top, ['Casos', 'Execução', 'Evidências e bugs', 'Automação', 'Publicar', 'Compartilhar']);
  const html = topModulesHtml();
  for (const m of MODULES.filter((x) => x.top)) assert.match(html, new RegExp(`data-menu="mod-${m.id}"`));
  // Novo ▾ só cria documentos (rodada e ciclo foram para Execução ▾)
  const novo = menuHtml('newMenu');
  assert.doesNotMatch(novo, /data-cmd="newCase"/); // o caso de teste mora em Casos ▾ (V1/K)
  assert.doesNotMatch(novo, /data-cmd="startRun"|data-cmd="newRun"|data-cmd="newCycle"|data-cmd="newAutoRun"/);
  // Salvar ▾ só tem o que é do arquivo (publicar → Publicar ▾; backup → pasta de trabalho)
  const salvar = menuHtml('saveMenu');
  assert.match(salvar, /id="autoSaveItem"/);
  assert.match(salvar, /data-autosave-label/);
  assert.doesNotMatch(salvar, /data-cmd="publish"|data-cmd="history"|data-cmd="backup"/);
  assert.match(html, /id="mod-execucao"[^]*data-cmd="startRun"/);
  // uma porta só para começar uma execução
  assert.doesNotMatch(html, /data-cmd="(newRun|runCycle|newAutoRun)"/);
  assert.match(html, /id="mod-publicar"[^]*data-cmd="publish"/);
  // exportar é uma porta só: o diálogo Exportar…
  assert.equal((html.match(/data-cmd="exportDialog"/g) || []).length, 1);
  assert.doesNotMatch(html, /data-cmd="(notionZip|hubZip|exportHtml)"/);
});

test('index.html: os menus vazios que o registro preenche', () => {
  assert.match(index, /id="newMenu"[^>]*hidden><\/div>/);
  assert.match(index, /id="saveMenu"[^>]*hidden><\/div>/);
  assert.match(index, /id="moduleMenus"/);
  assert.doesNotMatch(index, /id="copyMenu"|id="exportMenu"/);
  assert.match(main, /^import '\.\/ui\/topMenus\.js';/m);
});

test('HTML escapado (sem quebrar o menu com < ou ")', () => {
  const html = topModulesHtml();
  assert.doesNotMatch(html, /casos\/<ÉPICO>/);
  assert.match(html, /casos\/&lt;ÉPICO&gt;/);
});

// ---------------------------------------------------------------- 1.58.0: ⋯ do painel e da barra, tela inicial, Onde fica…?
const panel = readFileSync(new URL('../../src/app/cyclePanel.js', import.meta.url), 'utf8');
const manual = readFileSync(new URL('../../MANUAL.md', import.meta.url), 'utf8');

test('⋯ e atalhos: todo comando usado existe no registro e no run()', () => {
  const panelRefs = [...panel.slice(panel.indexOf('function moreRefs')).matchAll(/cmd: '(\w+)'|^\s+'(\w+)', '(\w+)',$/gm)].flatMap((m) => m.slice(1).filter(Boolean));
  assert.ok(panelRefs.length >= 9, `só ${panelRefs.length} ações no ⋯ do painel`);
  const all = [...EXEC_BAR_MORE.caso, ...EXEC_BAR_MORE.rodada, ...HOME_SHORTCUTS.map((s) => s.cmd), ...panelRefs];
  for (const r of all) {
    const [cmd, value] = r.split(':');
    assert.ok(findItem(cmd, value ?? null), `${r} não está no registro`);
    assert.ok(main.includes(`case '${cmd}'`), `${cmd} não está no run()`);
  }
  // as ações que só existiam no painel agora também estão na paleta
  const acts = paletteActions();
  for (const c of ['assignRound', 'openCycleDef']) assert.ok(acts.some((a) => a.cmd === c), c);
});

test('findItem prefere o item do menu do módulo (texto do topo)', () => {
  assert.equal(findItem('newCase')?.module.label, 'Casos');
  assert.equal(findItem('copyClaude', 'failures'), null); // as falhas vão pelo MCP (qa_resumo_execucao) ou pelo 🐞 Novo bug
  assert.equal(findItem('copyClaude', 'summary'), null); // o resumo da rodada é copiado do 📊 Como está (Jira, Teams, e-mail, Markdown)
  assert.equal(findItem('nada'), null);
});

test('⋯: agrupado por módulo, na ordem em que os módulos aparecem; data-cp para o painel', () => {
  assert.deepEqual(groupByModule(EXEC_BAR_MORE.caso).map((g) => g.module.label), ['Evidências e bugs', 'Casos', 'Compartilhar']);
  assert.deepEqual(groupByModule(EXEC_BAR_MORE.rodada).map((g) => g.module.label), ['Execução', 'Casos', 'Automação']);
  const html = moreItemsHtml(['capture', { cmd: 'assignRound', cp: 'assign' }, 'copyJira', { cmd: 'rerunFailed', cp: 'retest', label: '🔂 Reteste das falhas (3)' }]);
  assert.match(html, /<div class="menu-title">📸 Evidências e bugs<\/div><button[^>]*data-cmd="capture"[^>]*><span class="mi-row">📸 Capturar a tela<kbd>Ctrl\+Alt\+P<\/kbd>/);
  assert.match(html, /▶ Execução<\/div><button[^>]*data-cp="assign"/);
  assert.match(html, /data-cp="retest">🔂 Reteste das falhas \(3\)/);
  assert.match(html, /data-cmd="copyJira"/);
  assert.doesNotMatch(html, /data-cmd="assignRound"/);
  // menu do painel: botão + menu escondido; sem ações, nada
  assert.match(moreMenuHtml('cpMore', ['trend']), /data-menu="cpMore"[^]*id="cpMore" role="menu" hidden/);
  assert.equal(moreMenuHtml('cpMore', []), '');
});

test('tela inicial: atalhos por módulo; sem pasta, só os que não precisam dela', () => {
  assert.deepEqual(homeShortcuts(true).map((g) => g.module.label), ['Casos', 'Execução', 'Automação', 'Publicar', 'Arquivo', 'Pasta de trabalho']);
  const semPasta = homeShortcuts(false).flatMap((g) => g.items.map((i) => i.item.cmd));
  assert.deepEqual(semPasta, ['newCase', 'startRun', 'newFromTemplate', 'quickNote']);
  // os atalhos de antes continuam (testes de tela clicam neles)
  const comPasta = homeShortcuts(true).flatMap((g) => g.items.map((i) => i.item.cmd));
  for (const c of ['newCase', 'startRun', 'quickNote', 'newFromTemplate', 'dashboard', 'trend']) assert.ok(comPasta.includes(c), c);
});

/** Para comparar textos do manual com os do registro: sem emoji, sem "…", minúsculas. @param {string} s */
const norm = (s) => s.normalize('NFC').toLowerCase().replace(/…|\.\.\./g, '').replace(/[^\p{L}\p{N}\s.:/-]/gu, ' ').replace(/\s+/g, ' ').trim();

test('MANUAL: "Onde fica…?" organizado pelos módulos do registro', () => {
  const sec = manual.slice(manual.indexOf('### Onde fica…?'), manual.indexOf('## 5. Escrever e editar'));
  const blocks = [...sec.matchAll(/^\*\*(\S+) ([^*]+)\*\*/gm)].map((m) => ({ icon: m[1], label: m[2] }));
  assert.deepEqual(blocks.map((b) => b.label), MODULES.map((m) => m.label));
  for (const b of blocks) assert.equal(b.icon, MODULES.find((m) => m.label === b.label)?.icon, b.label);
});

/**
 * Referências "**Menu ▾ → item**" e "Ctrl+Shift+P → *texto*" de um texto que não existem no registro.
 * @param {string} text @returns {{ bad: string[], checked: number }}
 */
function badRefs(text) {
  /** @type {Record<string, import('../../src/ui/modules.js').ModuleSection[]>} */
  const menus = {
    Novo: MODULES.flatMap((m) => m.sections.filter((s) => s.menu === 'newMenu')),
    Salvar: MODULES.flatMap((m) => m.sections.filter((s) => s.menu === 'saveMenu')),
  };
  for (const m of MODULES.filter((x) => x.top)) menus[m.short || m.label] = m.sections.filter((s) => s.menu === undefined);
  const bad = [];
  let checked = 0;
  for (const [, menu, path] of text.matchAll(/\*\*([^*▾]{1,30}?) ▾ → ([^*]+?)\*\*/g)) {
    const secs = menus[menu.trim()];
    if (!secs) continue; // Tabela ▾, Código ▾… (menus da toolbar, fora do registro)
    checked++;
    // seção (opcional) → item; o que vem depois do item é dentro da janela dele
    let pool = secs;
    let ok = false;
    for (const seg of path.split(' → ').map(norm).filter(Boolean)) {
      if (pool.flatMap((s) => s.items).some((i) => norm(i.label).startsWith(seg))) { ok = true; break; }
      const s = pool.find((x) => x.title && norm(x.title).startsWith(seg));
      if (!s) { ok = false; break; }
      pool = [s];
      ok = true;
    }
    if (!ok) bad.push(`${menu.trim()} ▾ → ${path}`);
  }
  const pal = paletteActions().map((a) => norm(a.label));
  for (const [, ref] of text.matchAll(/Ctrl\+Shift\+P`? → \*{1,2}([^*]+)\*{1,2}/g)) {
    checked++;
    if (!pal.some((p) => p.startsWith(norm(ref)))) bad.push(`Ctrl+Shift+P → ${ref}`);
  }
  return { bad, checked };
}

test('MANUAL: todo "Menu ▾ → item" e "Ctrl+Shift+P → texto" existe no registro', () => {
  const { bad, checked } = badRefs(manual);
  assert.ok(checked > 100, `só ${checked} referências conferidas`);
  assert.deepEqual(bad, []);
});

// ---------------------------------------------------------------- 1.60.0: o roteiro dos exemplos por módulo
test('exemplos/LEIA-ME-por-modulo.md: os módulos do topo na ordem do app, cada um com roteiro; as referências existem no registro', () => {
  const leia = readFileSync(new URL('../../exemplos/LEIA-ME-por-modulo.md', import.meta.url), 'utf8');
  const heads = [...leia.matchAll(/^## (\S+) (.+)$/gm)].map((m) => ({ icon: m[1], title: m[2], at: m.index ?? 0 }));
  const top = MODULES.filter((m) => m.top);
  const found = top.map((m) => heads.find((h) => h.title === m.label || h.title.startsWith(`${m.label} —`)));
  assert.deepEqual(found.map((h, i) => h ? h.icon : `falta ${top[i].label}`), top.map((m) => m.icon));
  assert.deepEqual(found.map((h) => h?.at), [...found.map((h) => h?.at)].sort((a, b) => (a ?? 0) - (b ?? 0)), 'na ordem do topo');
  // cada módulo com um roteiro (checklist) para marcar
  for (const [i, h] of found.entries()) {
    const next = heads.find((x) => x.at > (h?.at ?? 0));
    assert.match(leia.slice(h?.at, next?.at), /^- \[ \] /m, top[i].label);
  }
  const { bad, checked } = badRefs(leia);
  assert.ok(checked >= 8, `só ${checked} referências conferidas`);
  assert.deepEqual(bad, []);
});
