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

/** Escolhe o ticket na lista (os mais recentes primeiro). @param {TicketFolder[]} list @returns {Promise<TicketFolder | null>} */
function pickTicket(list) {
  return new Promise((resolve) => {
    const recent = (/** @type {TicketFolder} */ t) => Math.max(...t.cases.map((c) => c.lastModified || 0));
    menu.open({
      x: window.innerWidth / 2 - 200, y: 120, searchable: true, wide: true,
      title: '🤝 Teste em dupla — de qual ticket?',
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

  const all = docIndex.all();
  const existing = all.find((e) => e.tipo === PAIR_TYPE && (dirOf(e.path) === target.dir || ticketKey(e.jira) === target.ticket));
  if (existing) {
    const res = await showDialog({
      title: `Teste em dupla — ${target.ticket}`, icon: '🤝',
      message: `Este ticket já tem um teste em dupla (${existing.path}).`,
      detail: 'Para uma nova chamada com o dev (depois dos ajustes), abra o existente e use 🔁 Nova rodada: a anterior fica no histórico do documento.',
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'new', label: 'Criar outro' }, { id: 'open', label: 'Abrir o existente', kind: 'primary' }],
      defaultId: 'open', cancelId: 'cancel',
    });
    if (res?.id === 'open') { await openWikiTarget(existing.id || existing.path, { entry: existing }); return; }
    if (res?.id !== 'new') return;
  }

  const story = all.find((e) => e.tipo === 'historia' && [ticketKey(e.jira), (e.id || '').toUpperCase()].includes(target.ticket));
  const template = [...customTemplates, ...BUILTIN_TEMPLATES].find((t) => new RegExp(`^tipo[ \\t]*:[ \\t]*${PAIR_TYPE}\\b`, 'm').test(t.text));
  if (!template) { app.toast('Modelo do teste em dupla não encontrado.', 'error'); return; }
  const folderTitle = (target.dir.split('/').pop() || '').slice(target.ticket.length).replace(/^[\s_.—–-]+/, '');
  const cases = [...target.cases].sort((a, b) => fileKey(a).localeCompare(fileKey(b), 'pt-BR', { numeric: true }));
  const pairCases = cases.map((c) => ({ id: fileKey(c), titulo: c.titulo || c.heading || fileKey(c), prioridade: c.prioridade, tags: c.tags, text: c.text || '' }));
  const criterios = story ? acceptanceCriteria(story.text || '') : [];
  let text = buildPairTest({
    template: fillTemplate(template.text),
    ticket: target.ticket,
    titulo: story?.titulo || folderTitle,
    app: target.dir.split('/')[1] || '',
    epico: target.epic,
    criterios,
    cases: pairCases,
  });
  if (existing) text = text.replace(/^id:[ \t]*.*$/m, `id: ${pairTestId(target.ticket)}-2`);
  const path = await createDocIn(target.dir, text, suggestedFileName(text, `teste-em-dupla-${target.ticket}`));
  if (!path) return;
  const { main, edge, rest } = pickPairCases(pairCases);
  const parts = [`${main.length} principa${main.length === 1 ? 'l' : 'is'}`, `${edge.length} menos trivia${edge.length === 1 ? 'l' : 'is'}`];
  if (rest.length) parts.push(`${rest.length} para DEV/HML`);
  if (criterios.length) parts.push(`${criterios.length} critério${criterios.length === 1 ? '' : 's'} da história`);
  app.toast(`🤝 Roteiro do ${target.ticket}: ${parts.join(' · ')} — enxugue à vontade; na chamada, ▶ Executar e ⏱ Sessão.`);
}
