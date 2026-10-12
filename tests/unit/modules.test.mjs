// 12.1 (1.57.0): registro de módulos — menus do topo e paleta saem da mesma lista; nada fica sem módulo nem repetido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODULES, paletteActions, menuHtml, topModulesHtml, moduleOf } from '../../src/ui/modules.js';

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
  assert.ok(acts.length >= 120, `só ${acts.length} ações na paleta`);
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
  assert.match(novo, /data-cmd="newCase"/);
  assert.doesNotMatch(novo, /data-cmd="newRun"|data-cmd="newCycle"|data-cmd="newAutoRun"/);
  // Salvar ▾ só tem o que é do arquivo (publicar → Publicar ▾; backup → pasta de trabalho)
  const salvar = menuHtml('saveMenu');
  assert.match(salvar, /id="autoSaveItem"/);
  assert.match(salvar, /data-autosave-label/);
  assert.doesNotMatch(salvar, /data-cmd="publish"|data-cmd="history"|data-cmd="backup"/);
  assert.match(html, /id="mod-execucao"[^]*data-cmd="newRun"/);
  assert.match(html, /id="mod-publicar"[^]*data-cmd="publish"/);
  // o pacote do Notion aparece uma vez só nos menus do topo
  assert.equal((html.match(/data-cmd="notionZip"/g) || []).length, 1);
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
