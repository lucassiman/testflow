// @ts-check
/**
 * 🎯 Teste de confirmação do bug: o bug vira executável (seção "Teste de confirmação" com os passos dele) e entra numa
 * execução — só dele (comando no bug), somado a uma rodada avulsa, a uma execução de um ciclo ou ao reteste das falhas.
 * PASS no ✓ Concluir pergunta se fecha o bug; FAIL anota no Andamento (e reabre o bug que estava fechado).
 */
import { app } from './context.js';
import { docIndex } from './shared.js';
import { currentWorkspacePath, openDocOverrides } from './links.js';
import { viewDocs } from './views.js';
import { bugsFor, bugOpen } from '../markdown/views.ts';
import { isBugText, hasConfirmSteps, ensureConfirmSteps, jiraDone, logConfirmation } from '../markdown/confirm.ts';
import { stepTable, cellToText } from '../markdown/runs.ts';
import { cellStatus } from '../markdown/status.ts';
import { showDialog } from '../ui/dialog.js';

/** @typedef {import('../types').DocEntry} DocEntry */
/** @typedef {import('../markdown/cycle.ts').CycleCase} CycleCase */

const keyOf = (/** @type {{ id: string, name: string }} */ e) => e.id || e.name.replace(/\.(md|markdown)$/i, '');
/** @param {string} path */
const textOf = (path) => openDocOverrides().get(path) ?? docIndex.get(path)?.text ?? '';
/** Campo do cabeçalho pelo texto (sem montar o YAML inteiro). @param {string} text @param {string} field */
const field = (text, field) => String(new RegExp(`^${field}:[ \\t]*(.*)$`, 'm').exec(text.split(/\n---/)[0] || '')?.[1] || '').replace(/^["']|["']$/g, '').trim();
/** O primeiro caso citado pelo bug ("Encontrado em [[TC-008]]"). @param {string} text */
function foundIn(text) {
  for (const m of text.matchAll(/\[\[([^\]|#]+)/g)) {
    const e = docIndex.resolve(m[1].trim());
    if (e && ['caso-de-teste', 'cenario-bdd', 'checklist'].includes(e.tipo)) return keyOf(e);
  }
  return '';
}

/**
 * Bugs abertos que podem entrar como teste de confirmação, os sugeridos primeiro: ligados aos casos escolhidos ou já
 * concluídos no Jira (`jira_status`). Sem casos: todos os abertos (da aplicação, se houver).
 * @param {DocEntry[]} cases @param {string} [appName]
 * @returns {Array<CycleCase & { suggested: boolean, why: string }>}
 */
export function confirmCandidates(cases, appName = '') {
  const docs = viewDocs();
  /** @type {Map<string, string>} bug (path) → caso de origem */
  const linked = new Map();
  for (const c of cases) {
    const row = docs.find((d) => d.path === c.path);
    if (row) for (const b of bugsFor(row, docs)) if (!linked.has(b.path)) linked.set(b.path, keyOf(c));
  }
  const apps = new Set([appName, ...cases.map((c) => c.app)].filter(Boolean).map((a) => a.toLowerCase()));
  const out = docs.filter((d) => d.tipo === 'bug' && bugOpen(d) && (!apps.size || !d.app || apps.has(d.app.toLowerCase()) || linked.has(d.path))).map((d) => {
    const text = textOf(d.path);
    const done = jiraDone(field(text, 'jira_status'));
    const origem = linked.get(d.path) || foundIn(text);
    return { key: keyOf(d), titulo: d.titulo || d.heading || d.name, ...(origem ? { origem } : {}), suggested: linked.has(d.path) || done, why: [linked.has(d.path) && `ligado ao ${linked.get(d.path)}`, done && `concluído no Jira (${field(text, 'jira_status')})`].filter(Boolean).join(' · ') };
  });
  const COLL = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  return out.sort((a, b) => Number(b.suggested) - Number(a.suggested) || COLL.compare(a.key, b.key));
}

/**
 * Pergunta quais bugs somar como teste de confirmação (os sugeridos já marcados). Sem nenhum sugerido: [] sem perguntar.
 * @param {DocEntry[]} cases @param {{ appName?: string, preselected?: CycleCase[], intro?: string }} [o]
 * @returns {Promise<CycleCase[] | null>} null = cancelou
 */
export async function askConfirmBugs(cases, { appName = '', preselected = [], intro = '' } = {}) {
  const all = confirmCandidates(cases, appName);
  // os que já vieram (reteste: os bugs das falhas) entram primeiro, marcados
  const pre = preselected.map((b) => ({ ...b, titulo: b.titulo || docIndex.resolve(b.key)?.titulo || b.key, suggested: true, why: b.origem ? `ligado ao ${b.origem}` : '' }));
  const list = [...pre, ...all.filter((c) => !pre.some((p) => p.key.toLowerCase() === c.key.toLowerCase()))].slice(0, 25);
  // só pergunta quando há o que sugerir (bug ligado aos casos ou concluído no Jira); o resto entra pelo 🎯 no bug
  if (!list.some((c) => c.suggested)) return [];
  const res = await showDialog({
    title: '🎯 Teste de confirmação de bugs', icon: '🎯',
    message: `${intro ? `${intro}\n\n` : ''}Somar a confirmação de algum bug? Cada um refaz os passos do bug na versão corrigida (PASS = corrigido), conta à parte dos casos e vem antes deles.${all.length + pre.length > 25 ? '\n\nSó os 25 primeiros (os sugeridos antes).' : ''}`,
    checks: list.map((c) => ({ id: c.key, label: `${c.key} — ${c.titulo}`, hint: c.why || undefined, checked: c.suggested })),
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'none', label: 'Sem confirmações' }, { id: 'go', label: 'Continuar', kind: 'primary' }],
    defaultId: 'go', cancelId: 'cancel',
  });
  if (!res || res.id === 'cancel') return null;
  if (res.id === 'none') return [];
  return list.filter((c) => res.checks[c.key]).map(({ key, titulo, origem }) => ({ key, titulo, ...(origem ? { origem } : {}) }));
}

/** O documento aberto é um bug? */
export const openIsBug = () => isBugText(app.store.source);

/** Bug aberto sem a tabela do teste de confirmação: monta pelos passos do bug (Ctrl+Z desfaz). @returns {boolean} true = criou */
export function ensureOpenBugSteps() {
  if (!isBugText(app.store.source) || hasConfirmSteps(app.store.source)) return false;
  const { text, added } = ensureConfirmSteps(app.store.source);
  if (!added) return false;
  app.store.history.breakGroup();
  app.store.setSource(text, { origin: 'command' });
  app.toast('🎯 Seção "Teste de confirmação" criada com os passos do bug (o último leva o resultado esperado). Ajuste se precisar — Ctrl+Z desfaz.', 'info', { duration: 7000 });
  return true;
}

/** Comando 🎯 Teste de confirmação (no bug aberto): uma execução só dele, já começando. */
export async function confirmOpenBug() {
  const rel = currentWorkspacePath();
  if (!isBugText(app.store.source)) { app.toast('Abra o bug (tipo: bug) para criar o teste de confirmação dele.', 'error'); return; }
  if (!rel) { app.toast('Salve o bug na pasta de trabalho primeiro (a execução aponta para ele).', 'error'); return; }
  ensureOpenBugSteps();
  if (app.store.dirty) { await app.doSave(false); if (app.store.dirty) return; }
  const e = docIndex.get(rel);
  if (!e) { app.toast('O bug ainda não foi lido na pasta — tente de novo em instantes.', 'error'); return; }
  const status = field(app.store.source, 'status');
  if (status && !bugOpen(/** @type {any} */ ({ status, overall: '' }))) {
    const go = await showDialog({
      title: 'Este bug está fechado', icon: '🎯', message: `${keyOf(e)} está com status ${status}. Confirmar de novo mesmo assim? (FAIL reabre o bug.)`,
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'go', label: 'Confirmar de novo', kind: 'primary' }], defaultId: 'go', cancelId: 'cancel',
    });
    if (go?.id !== 'go') return;
  }
  const origem = foundIn(app.store.source);
  await (await import('./cycle.js')).newConfirmRun({ key: keyOf(e), titulo: e.titulo || e.heading || e.name, ...(origem ? { origem } : {}) }, e);
}

/** Primeiro passo que não passou: "5 — obtido: dois lançamentos". @param {string} text */
function failedStep(text) {
  const t = stepTable(text);
  if (!t || t.status < 0) return '';
  const i = t.rows.findIndex((r) => { const k = cellStatus(r.cells[t.status]); return k === 'fail' || k === 'blocked'; });
  if (i < 0) return '';
  const r = t.rows[i];
  const n = (t.id >= 0 && cellToText(r.cells[t.id] || '').trim()) || String(i + 1);
  const got = t.actual >= 0 ? cellToText(r.cells[t.actual] || '').replace(/\s+/g, ' ').trim() : '';
  return `${n}${got ? ` — obtido: ${got.length > 120 ? `${got.slice(0, 119)}…` : got}` : ''}`;
}

/**
 * ✓ Concluir num bug (teste de confirmação): grava no Andamento e, se passou, pergunta se fecha o bug. Depois segue a
 * rodada (próximo caso) como num caso.
 * @param {{ overall: string, revised?: boolean }} res
 */
export async function afterConfirmRun(res) {
  const cycle = await import('./cycle.js');
  const round = cycle.roundOfOpenCase();
  const word = String(res.overall).toUpperCase();
  const status = field(app.store.source, 'status');
  const open = !status || bugOpen(/** @type {any} */ ({ status, overall: '' }));
  let close = false;
  if (word === 'PASS' && open) {
    const ask = await showDialog({
      title: '✅ Confirmação passou', icon: '🎯',
      message: `O teste de confirmação passou — o defeito não aconteceu${round?.execucao ? ` em ${round.execucao}` : ''}. Fechar o bug agora (status PASS)?`,
      buttons: [{ id: 'keep', label: 'Deixar aberto' }, { id: 'close', label: 'Fechar o bug', kind: 'primary' }],
      defaultId: 'close', cancelId: 'keep',
    });
    close = ask?.id === 'close';
  }
  const before = app.store.source;
  // a versão em que rodou é a da execução (a corrigida), não a do bug (onde foi achado)
  const execText = round ? cycle.currentCycle()?.text || '' : '';
  const r = logConfirmation(before, {
    overall: word, when: new Date(), exec: round?.execucao || '', versao: field(execText, 'versao'),
    ambiente: round?.ambiente || field(execText, 'ambiente'), failed: word === 'PASS' ? '' : failedStep(before), close,
  });
  if (r.text !== before) {
    app.store.history.breakGroup();
    app.store.setSource(r.text, { origin: 'command' });
  }
  if (r.closed) app.toast('✅ Bug fechado (status PASS) — anotado no Andamento.', 'info', { duration: 5000 });
  else if (r.reopened) app.toast(`❌ A correção não resolveu: bug reaberto (estava ${r.previous}) — anotado no Andamento.`, 'error', { duration: 7000 });
  else if (word === 'FAIL') app.toast('❌ A correção não resolveu — anotado no Andamento do bug.', 'info', { duration: 6000 });
  if (cycle.onCaseFinished(res, { auto: true })) return;
  (await import('./nextCase.js')).offerNextCase(res);
}
