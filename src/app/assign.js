// @ts-check
/**
 * Atribuir casos na rodada (11.3) no app: 👥 Atribuir… no painel da rodada (distribuir os pendentes entre pessoas,
 * pelo tempo previsto ou pela quantidade; pegar os livres para mim), trocar o testador de um caso pelo chip dele e o
 * "eu" (o nome das preferências) para o filtro Minhas e para o ▶ Próximo caso. Regras em src/markdown/assign.ts.
 */
import { app } from './context.js';
import { menu, docIndex } from './shared.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { showDialog } from '../ui/dialog.js';
import { currentWorkspacePath, openDocOverrides } from './links.js';
import { assign, distribute, testers, assignees } from '../markdown/assign.ts';
import { cycleTable, cycleClosed } from '../markdown/cycle.ts';
import { caseAvgMs } from '../markdown/forecast.ts';
import { approxDuration } from '../markdown/forecast.ts';

/** Meu nome (o das preferências: o mesmo do "Publicado por"). */
export const me = () => String(loadPrefs().publisherName || '').trim();

/** Garante o documento da execução aberto (as atribuições ficam nele) e devolve o caminho. */
async function onCycle() {
  const { currentCycle, openCycle } = await import('./cycle.js');
  const c = currentCycle();
  if (!c) { app.toast('Nenhuma rodada em andamento.', 'error'); return null; }
  if (cycleClosed(c.text)) { app.toast('Esta execução já foi finalizada — não muda mais.', 'error'); return null; }
  if (c.path !== currentWorkspacePath()) await openCycle();
  return currentWorkspacePath() === c.path ? c.path : null;
}

/** Duração média de um caso da rodada (para distribuir pelo tempo). @param {string} key */
function avgMs(key) {
  const e = docIndex.resolve(key);
  if (!e) return null;
  return caseAvgMs(openDocOverrides().get(e.path) ?? e.text ?? '');
}

/** @param {string} next @param {string} msg */
function write(next, msg) {
  if (next === app.store.source) { app.toast('Nada mudou.'); return; }
  app.store.history.breakGroup();
  app.store.setSource(next, { origin: 'command' });
  app.toast(`${msg} — Ctrl+Z desfaz; salve (Ctrl+S).`, 'info', { duration: 9000 });
}

/** 👥 Atribuir…: distribuir os pendentes entre as pessoas (ou pegar os livres para mim). */
export async function assignRound() {
  if (!(await onCycle())) return;
  const text = app.store.source;
  const known = testers(text);
  const mine = me();
  const res = await showDialog({
    title: 'Atribuir os casos da rodada', icon: '👥',
    message: 'Quem vai executar? Os casos pendentes são divididos entre essas pessoas — os maiores primeiro, sempre para quem está com menos.',
    input: { label: 'Pessoas (separadas por vírgula)', value: [...new Set([...known, ...(mine ? [mine] : [])])].join(', '), placeholder: 'Ana, Bruno, Carla' },
    select: { label: 'Quais casos', value: 'livres', options: [{ value: 'livres', label: 'Só os pendentes sem testador' }, { value: 'todos', label: 'Todos os pendentes (redistribuir)' }, { value: 'eu', label: `Pegar para mim os sem testador${mine ? ` (${mine})` : ''}` }] },
    checks: [{ id: 'tempo', label: 'Equilibrar pelo tempo previsto (duração média de cada caso)', checked: true }],
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Atribuir', kind: 'primary' }], cancelId: 'cancel',
  });
  if (!res || res.id !== 'ok') return;
  if (res.choice === 'eu') {
    if (!mine) { app.toast('Informe o seu nome nas preferências (o mesmo do "Publicado por") — ou escreva-o na lista de pessoas.', 'error'); return; }
    const t = cycleTable(text);
    const who = assignees(text);
    const free = (t?.rows || []).filter((r) => (!r.status || r.status === 'PENDING') && !who.get(r.key.toLowerCase())).map((r) => r.key);
    const r = assign(text, free, mine);
    write(r.text, `👥 ${r.changed.length} caso(s) com você (${mine})`);
    return;
  }
  const people = res.value.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
  if (!people.length) { app.toast('Informe pelo menos uma pessoa.', 'error'); return; }
  if (mine) savePrefs({ assignPeople: people });
  const d = distribute(text, people, { avgMs: res.checks.tempo ? avgMs : undefined, todos: res.choice === 'todos' });
  const summary = [...d.plan].map(([p, keys]) => {
    const ms = keys.reduce((a, k) => a + (avgMs(k) || 0), 0);
    return `${p}: ${keys.length}${res.checks.tempo && ms ? ` (${approxDuration(ms)})` : ''}`;
  }).join(' · ');
  write(d.text, `👥 Distribuídos — ${summary}`);
}

/**
 * Chip do testador num caso do painel: trocar (pessoas da rodada, eu, ninguém).
 * @param {string} key @param {HTMLElement} anchor
 */
export async function reassignCase(key, anchor) {
  const c = (await import('./cycle.js')).currentCycle();
  if (!c) return;
  const r = anchor.getBoundingClientRect();
  const people = [...new Set([...testers(c.text), ...(me() ? [me()] : []), ...((loadPrefs().assignPeople || []))])];
  const cur = assignees(c.text).get(key.toLowerCase()) || '';
  menu.open({
    x: r.left, y: r.bottom + 4,
    title: `Testador de ${key}`,
    items: [
      ...people.map((p) => ({ id: `p-${p}`, icon: p === cur ? '✓' : '👤', label: p === me() ? `${p} (eu)` : p, act: p })),
      { id: 'p-none', icon: '∅', label: 'Ninguém', act: '' },
      { id: 'p-other', icon: '＋', label: 'Outra pessoa…', act: '#other' },
    ],
    onPick: async (it) => {
      let who = it.act;
      if (who === '#other') {
        const res = await showDialog({ title: `Testador de ${key}`, input: { label: 'Nome', placeholder: 'Nome de quem executa' }, buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Atribuir', kind: 'primary' }], cancelId: 'cancel' });
        if (!res || res.id !== 'ok' || !res.value.trim()) return;
        who = res.value.trim();
      }
      if (!(await onCycle())) return;
      const out = assign(app.store.source, [key], who);
      write(out.text, who ? `👤 ${key} com ${who}` : `👤 ${key} sem testador`);
    },
  });
}

/** Iniciais para o chip ("Ana Souza" → AS). @param {string} name */
export const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
