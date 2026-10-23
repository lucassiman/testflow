// @ts-check
/**
 * 🤝 Teste em dupla do ticket: o dev mostra o trabalho no ambiente local e o QA confere os pontos principais antes de o
 * ticket subir para DEV/HML. Monta um roteiro curto com os casos do ticket (pasta casos/<ÉPICO>/<TICKET>/) e os critérios
 * de aceite da história; o mesmo documento vira o relatório depois da chamada.
 */
import { app } from './context.js';
import { currentWorkspacePath, openWikiTarget } from './links.js';
import { createDocIn, customTemplates } from './templates.js';
import { docIndex, menu } from './shared.js';
import { isCaseDoc } from '../markdown/nextCase.ts';
import { PAIR_TYPE, segmentOfDir, ticketKey } from '../markdown/structure.ts';
import { jiraLabel, jiraValues } from '../markdown/jiraLink.ts';
import { acceptanceCriteria, buildPairTest, pairTestId, pickPairCases } from '../markdown/pairTest.ts';
import { BUILTIN_TEMPLATES, fillTemplate, suggestedFileName } from '../templates/index.js';
import { showDialog } from '../ui/dialog.js';

/** @typedef {import('../types').DocEntry} DocEntry */
/** @typedef {{ dir: string, ticket: string, epic: string, cases: DocEntry[] }} TicketFolder */

const dirOf = (/** @type {string} */ p) => p.split('/').slice(0, -1).join('/');
const fileKey = (/** @type {DocEntry} */ e) => e.id || e.name.replace(/\.(md|markdown)$/i, '');

/** Pastas de ticket que têm casos (casos/<TICKET>/ ou casos/<ÉPICO>/<TICKET>/). @returns {Map<string, TicketFolder>} */
function ticketFolders() {
  const all = docIndex.all();
  const epicDirs = all.filter((e) => e.tipo === 'epico').map((e) => dirOf(e.path));
  /** @type {Map<string, TicketFolder>} */
  const out = new Map();
  for (const e of all) {
    if (!isCaseDoc(e)) continue;
    const dir = dirOf(e.path);
    let t = out.get(dir);
    if (!t) {
      const seg = segmentOfDir(dir, app.workspaceDirs, epicDirs);
      if (!seg.ticket) continue;
      t = { dir, ticket: seg.ticket, epic: seg.epic, cases: [] };
      out.set(dir, t);
    }
    t.cases.push(e);
  }
  return out;
}

/** Escolhe o ticket na lista (os mais recentes primeiro). @param {TicketFolder[]} list @param {string} [title] @returns {Promise<TicketFolder | null>} */
function pickTicket(list, title = '🤝 Teste em dupla — de qual ticket?') {
  return new Promise((resolve) => {
    const recent = (/** @type {TicketFolder} */ t) => Math.max(...t.cases.map((c) => c.lastModified || 0));
    menu.open({
      x: window.innerWidth / 2 - 200, y: 120, searchable: true, wide: true,
      title,
      placeholder: 'Filtrar tickets…',
      items: [...list].sort((a, b) => recent(b) - recent(a)).map((t) => ({
        id: t.dir, group: t.epic ? `Épico ${t.epic}` : 'Tickets', label: t.dir.split('/').pop() || t.ticket, icon: '🤝',
        hint: `${t.cases.length} caso${t.cases.length === 1 ? '' : 's'} · ${t.dir.split('/')[1] || ''}`, keywords: `${t.ticket} ${t.epic}`, kind: 'pairTicket',
      })),
      onPick: (item) => resolve(list.find((t) => t.dir === item.id) || null),
      // ao escolher, o menu fecha antes (reason 'pick') e só depois chama o onPick
      onClose: (reason) => { if (reason !== 'pick') resolve(null); },
    });
  });
}

/** Comando: abre (ou cria) o teste em dupla do ticket do documento aberto — ou do ticket escolhido na lista. */
export async function newPairTest() {
  if (!app.workspaceDir) { app.toast('Teste em dupla: abra a pasta de trabalho primeiro (☰ → Arquivos → Abrir…).', 'error'); return; }
  if (!docIndex.ready) { app.toast('Ainda lendo os documentos da pasta… tente de novo em instantes.'); return; }
  const folders = ticketFolders();
  if (!folders.size) {
    app.toast('Nenhum ticket com casos na pasta (casos/<ÉPICO>/<TICKET>/). Crie os casos do ticket primeiro — ou use Novo ▾ → A partir de modelo → Teste em dupla.', 'error');
    return;
  }
  const here = currentWorkspacePath();
  const target = (here && folders.get(dirOf(here))) || await pickTicket([...folders.values()]);
  if (!target) return;
  // o dev pode mostrar mais de um ticket na mesma chamada: um documento só, com um bloco por ticket
  const targets = [target];
  for (;;) {
    const others = [...folders.values()].filter((t) => !targets.some((x) => x.ticket === t.ticket));
    if (!others.length) break;
    const res = await showDialog({
      title: `Teste em dupla — ${targets.map((t) => t.ticket).join(' + ')}`, icon: '🤝',
      message: targets.length === 1 ? 'A chamada com o dev é só deste ticket?' : `A chamada tem ${targets.length} tickets. Mais algum?`,
      detail: 'Se o dev for mostrar mais de um ticket na mesma sessão, adicione os outros: sai um documento só, com os critérios, o roteiro e o que fica para DEV/HML separados por ticket.',
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'more', label: 'Mais um ticket…' }, { id: 'ok', label: 'Criar o roteiro', kind: 'primary' }],
      defaultId: 'ok', cancelId: 'cancel',
    });
    if (res?.id === 'cancel' || !res) return;
    if (res.id !== 'more') break;
    const next = await pickTicket(others, `🤝 Teste em dupla — mais um ticket (com ${targets.map((t) => t.ticket).join(', ')})`);
    if (next) targets.push(next);
  }
  const keys = targets.map((t) => t.ticket);
  const label = keys.join(' + ');

  const all = docIndex.all();
  // já existe um teste em dupla de um destes tickets (sozinho ou junto com outros)?
  const existing = all.find((e) => e.tipo === PAIR_TYPE && (targets.length === 1 && dirOf(e.path) === target.dir
    || jiraValues(e.jira).map(jiraLabel).some((k) => keys.includes(k))));
  if (existing) {
    const res = await showDialog({
      title: `Teste em dupla — ${label}`, icon: '🤝',
      message: targets.length === 1 ? `Este ticket já tem um teste em dupla (${existing.path}).` : `Um destes tickets já tem um teste em dupla (${existing.path}).`,
      detail: 'Para uma nova chamada com o dev (depois dos ajustes), abra o existente e use 🔁 Nova rodada: a anterior fica no histórico do documento.',
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'new', label: 'Criar outro' }, { id: 'open', label: 'Abrir o existente', kind: 'primary' }],
      defaultId: 'open', cancelId: 'cancel',
    });
    if (res?.id === 'open') { await openWikiTarget(existing.id || existing.path, { entry: existing }); return; }
    if (res?.id !== 'new') return;
  }

  const template = [...customTemplates, ...BUILTIN_TEMPLATES].find((t) => new RegExp(`^tipo[ \\t]*:[ \\t]*${PAIR_TYPE}\\b`, 'm').test(t.text));
  if (!template) { app.toast('Modelo do teste em dupla não encontrado.', 'error'); return; }
  const tickets = targets.map((t) => {
    const story = all.find((e) => e.tipo === 'historia' && [ticketKey(e.jira), (e.id || '').toUpperCase()].includes(t.ticket));
    const folderTitle = (t.dir.split('/').pop() || '').slice(t.ticket.length).replace(/^[\s_.—–-]+/, '');
    const cases = [...t.cases].sort((a, b) => fileKey(a).localeCompare(fileKey(b), 'pt-BR', { numeric: true }));
    return {
      ticket: t.ticket, titulo: story?.titulo || folderTitle, epico: t.epic,
      criterios: story ? acceptanceCriteria(story.text || '') : [],
      cases: cases.map((c) => ({ id: fileKey(c), titulo: c.titulo || c.heading || fileKey(c), prioridade: c.prioridade, tags: c.tags, text: c.text || '' })),
    };
  });
  let text = buildPairTest({
    template: fillTemplate(template.text),
    ticket: target.ticket,
    app: target.dir.split('/')[1] || '',
    epico: target.epic,
    cases: [],
    tickets,
  });
  const id = pairTestId(target.ticket);
  if (all.some((e) => e.id === id)) text = text.replace(/^id:[ \t]*.*$/m, `id: ${id}-2`).replace(/^# .*$/m, (h) => h.replace(id, `${id}-2`));
  // mora na pasta do primeiro ticket (o jira: com todos faz os outros acharem)
  const path = await createDocIn(target.dir, text, suggestedFileName(text, `teste-em-dupla-${keys.join('-')}`));
  if (!path) return;
  const many = tickets.length > 1;
  const picks = tickets.map((t) => pickPairCases(t.cases, many ? { mainMax: 3, edgeMax: 1 } : {}));
  const n = (/** @type {'main' | 'edge' | 'rest'} */ k) => picks.reduce((a, p) => a + p[k].length, 0);
  const nCrit = tickets.reduce((a, t) => a + t.criterios.length, 0);
  const parts = [`${n('main')} principa${n('main') === 1 ? 'l' : 'is'}`, `${n('edge')} menos trivia${n('edge') === 1 ? 'l' : 'is'}`];
  if (n('rest')) parts.push(`${n('rest')} para DEV/HML`);
  if (nCrit) parts.push(`${nCrit} critério${nCrit === 1 ? '' : 's'} da${many ? 's' : ''} história${many ? 's' : ''}`);
  app.toast(`🤝 Roteiro ${many ? `dos tickets ${label}` : `do ${target.ticket}`}: ${parts.join(' · ')} — enxugue à vontade; na chamada, ▶ Executar e ⏱ Sessão.`);
}
