// @ts-check
/**
 * Jira Cloud em lote: bugs do Painel → CSV para o importador do Jira; depois, as chaves criadas voltam
 * para o campo `jira` de cada bug (lendo o CSV exportado do Jira).
 */
import { app } from './context.js';
import { jiraCsv, keysFromJiraCsv, matchKeys, addJiraKey } from '../markdown/jiraCsv.ts';
import { jiraValues } from '../markdown/jiraLink.ts';
import { writeText } from '../io/fsOps.js';
import { downloadBlob } from './evidence.js';
import { openDocOverrides, currentWorkspacePath } from './links.js';
import { showDialog } from '../ui/dialog.js';
import { docIndex, errMsg, todayIso } from './shared.js';

/** @typedef {import('../types').DocEntry} DocEntry */

/** Texto atual do documento (o da aba aberta, se houver). @param {DocEntry} e @param {Map<string, string>} open */
const textOf = (e, open) => open.get(e.path) ?? e.text ?? '';

/**
 * ⬇ CSV para o Jira (Painel): os bugs mostrados com os filtros atuais.
 * @param {DocEntry[]} entries
 */
export async function exportJiraCsv(entries) {
  const bugs = entries.filter((e) => e.tipo === 'bug');
  if (!bugs.length) { app.toast('Nenhum bug com esses filtros — no Painel, filtre o tipo Bug (e o que mais quiser) e clique de novo.', 'error'); return; }
  const open = openDocOverrides();
  const withoutKey = bugs.filter((e) => !jiraValues(e.jira).length);
  const res = await showDialog({
    title: 'CSV para o Jira', icon: '⬇',
    message: `${bugs.length} bug(s) no filtro do Painel${withoutKey.length !== bugs.length ? ` — ${withoutKey.length} ainda sem chave do Jira` : ''}.`,
    detail: 'Cada bug vira uma linha: Resumo "[BUG-12] título", Tipo Bug, Prioridade, Descrição (o documento em formato do Jira) e Rótulos (qa-md, aplicação, tags). Os prints não vão no CSV: anexe no ticket depois (Copiar ▾ → Jira lista os arquivos).',
    checks: withoutKey.length !== bugs.length ? [{ id: 'onlyNew', label: 'Só os bugs sem chave do Jira', hint: 'o campo jira do cabeçalho está vazio', checked: true }] : [],
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'go', label: 'Baixar CSV', kind: 'primary' }],
    defaultId: 'go', cancelId: 'cancel',
  });
  if (res?.id !== 'go') return;
  const list = res.checks?.onlyNew === false || withoutKey.length === bugs.length ? bugs : withoutKey;
  if (!list.length) { app.toast('Todos os bugs do filtro já têm chave do Jira.', 'error'); return; }
  const { csv, count, skipped } = jiraCsv(list.map((e) => ({ path: e.path, text: textOf(e, open) })));
  // BOM: o Excel e o importador do Jira leem os acentos certo
  downloadBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), `jira-bugs-${todayIso()}.csv`);
  await showDialog({
    title: `${count} bug(s) no CSV`, icon: '✅',
    message: 'No Jira Cloud: importe o arquivo pelo importador de CSV (busca de itens → ⋯ → Importar itens de CSV, ou Configurações → Sistema → Importação externa → CSV), escolha o projeto e confira o mapeamento: Summary, Issue Type, Priority, Description e Labels.',
    detail: `Depois: filtre no Jira por labels = qa-md, exporte o resultado em CSV e use Ctrl+Shift+P → "Trazer chaves do Jira (CSV)" — cada bug ganha a chave no campo jira.${skipped.length ? `\n\n⚠ ${skipped.length} documento(s) sem id nem título ficaram de fora.` : ''}`,
    buttons: [{ id: 'ok', label: 'Entendi', kind: 'primary' }],
  });
}

/** Escolhe um arquivo .csv. @returns {Promise<File | null>} */
function pickCsv() {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.csv,text/csv', hidden: true });
    const done = (/** @type {File | null} */ f) => { input.remove(); resolve(f); };
    input.addEventListener('change', () => done(input.files?.[0] || null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/** Trazer chaves do Jira: lê o CSV exportado do Jira e grava a chave no campo jira de cada documento. */
export async function importJiraKeys() {
  const ws = app.workspaceDir;
  if (!ws || !docIndex.ready) { app.toast('Abra a pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return; }
  const file = await pickCsv();
  if (!file) return;
  let keys;
  try { keys = keysFromJiraCsv(await file.text()); } catch (err) { app.toast(`Não foi possível ler o CSV: ${errMsg(err)}`, 'error'); return; }
  if (!keys.length) { app.toast('O CSV não tem as colunas "Issue key" (ou "Chave") e "Summary" (ou "Resumo") — exporte do Jira com todos os campos.', 'error'); return; }
  const open = openDocOverrides();
  const docs = docIndex.all().filter((e) => e.tipo !== 'visao').map((e) => ({ path: e.path, text: textOf(e, open) }));
  const matches = matchKeys(keys, docs).filter((m) => { const d = docs.find((x) => x.path === m.path); return d && addJiraKey(d.text, m.key) !== d.text; });
  if (!matches.length) { app.toast(`Nenhum documento para atualizar: ${keys.length} item(ns) no CSV — os resumos precisam começar com o ID ("[BUG-12] …") ou ser iguais ao título, e a chave não pode já estar no documento.`, 'error', { duration: 8000 }); return; }
  const active = currentWorkspacePath();
  const busyTabs = new Set([...open.keys()].filter((p) => p !== active));
  const res = await showDialog({
    title: 'Trazer chaves do Jira', icon: '🔗',
    message: `${matches.length} documento(s) vão receber a chave no campo jira:`,
    detail: matches.slice(0, 12).map((m) => `${m.path.split('/').pop()} → ${m.key}${busyTabs.has(m.path) ? ' (aberto em outra aba: fica de fora — feche a aba e rode de novo)' : ''}`).join('\n') + (matches.length > 12 ? `\n… e mais ${matches.length - 12}` : ''),
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'go', label: 'Gravar as chaves', kind: 'primary' }],
    defaultId: 'go', cancelId: 'cancel',
  });
  if (res?.id !== 'go') return;
  let done = 0;
  const failed = [];
  for (const m of matches) {
    if (busyTabs.has(m.path)) continue;
    const d = /** @type {{ path: string, text: string }} */ (docs.find((x) => x.path === m.path));
    const next = addJiraKey(d.text, m.key);
    try {
      if (m.path === active) { app.store.history.breakGroup(); app.store.setSource(addJiraKey(app.store.source, m.key), { origin: 'command' }); }
      else { await writeText(ws, m.path, next); docIndex.update(m.path, next); }
      done++;
    } catch (err) { failed.push(`${m.path}: ${errMsg(err)}`); }
  }
  app.toast(`🔗 ${done} documento(s) com a chave do Jira${failed.length ? ` · ${failed.length} com erro` : ''}${matches.some((m) => m.path === active) ? ' — salve o documento aberto (Ctrl+S)' : ''}`, failed.length ? 'error' : 'info', { duration: 7000 });
}
