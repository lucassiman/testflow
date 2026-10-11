// @ts-check
/**
 * Avisos no Microsoft Teams (11.5): quando a rodada é encerrada (🏁 Finalizar) e quando um caso crítico falha, um
 * cartão vai para o canal pelo webhook (Workflows do Teams). Desligado por padrão — sem URL configurada, nada sai.
 * O envio vai pela extensão do navegador (sem o bloqueio de CORS); sem ela, o app tenta direto. Dados sensíveis
 * saem mascarados (src/markdown/teams.ts).
 */
import { app } from './context.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { detectFrontMatter, parseFrontMatter } from '../markdown/frontmatter.ts';
import { failedStep } from '../markdown/linkedDoc.ts';
import { TEAMS_DEFAULT, criticalCard, isCritical, roundCard, testCard, validTeamsUrl } from '../markdown/teams.ts';
import { showDialog } from '../ui/dialog.js';
import { extension } from './extension.js';
import { docIndex, errMsg } from './shared.js';

/** @typedef {import('../markdown/teams.ts').TeamsConfig} TeamsConfig */

/** @returns {TeamsConfig} */
export const teamsConfig = () => ({ ...TEAMS_DEFAULT, ...(loadPrefs().teams || {}) });

/** @param {string} text */
const metaOf = (text) => { const fm = detectFrontMatter(text); return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {}; };
const str = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.join(', ') : v === undefined || v === null ? '' : String(v).trim());

/**
 * Manda o cartão: pela extensão (se ela sabe — 1.55.0 ou mais nova) ou direto do app.
 * @param {unknown} payload @param {string} [url]
 * @returns {Promise<'extensão' | 'direto'>}
 */
export async function postTeams(payload, url = teamsConfig().url) {
  if (!url) throw new Error('nenhum webhook configurado');
  if (!validTeamsUrl(url)) throw new Error('o endereço não é de um webhook do Teams/Power Automate (https)');
  const ext = extension();
  const hi = /** @type {any} */ (await ext.hello());
  if (hi?.teams) { await ext.teamsSend(url, payload); return 'extensão'; }
  /** @type {Response} */
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    throw new Error('o navegador bloqueou o envio direto ao Teams — instale (ou atualize) a extensão do TestFlow, que manda sem esse bloqueio (Manual, 8.3)');
  }
  if (!res.ok) throw new Error(`o Teams respondeu ${res.status}`);
  return 'direto';
}

/** Envia e avisa no app (sem travar o fluxo do QA). @param {unknown} payload @param {string} what */
async function send(payload, what) {
  try {
    await postTeams(payload);
    app.toast(`📣 Aviso enviado ao Teams: ${what}`);
  } catch (err) {
    app.toast(`O aviso ao Teams não foi enviado (${what}): ${errMsg(err)}`, 'error', { duration: 9000 });
  }
}

/**
 * 🏁 Rodada encerrada (chamado pelo Finalizar execução, depois dos relatórios).
 * @param {string} execPath @param {string} [closedText] o texto já encerrado (o do editor)
 */
export async function notifyRound(execPath, closedText = '') {
  const cfg = teamsConfig();
  if (!cfg.url || !cfg.rodada) return;
  const { roundData } = await import('./cycle.js');
  const text = closedText || docIndex.get(execPath)?.text || '';
  const data = text ? roundData({ path: execPath, text }) : null;
  if (!data) return;
  const m = metaOf(data.text);
  const id = str(m.id);
  // recomendação do relatório de Encerramento (Go/No-Go), se ele foi gerado
  const enc = id ? docIndex.resolve(`${id}-ENC`) : null;
  const recomendacao = enc?.text ? str(metaOf(enc.text).recomendacao) : '';
  await send(roundCard({
    summary: data.summary, details: data.details, bugs: data.bugs, links: data.linksText,
    app: str(m.app), versao: str(m.versao), recomendacao, quem: str(m.responsavel) || loadPrefs().publisherName || '',
  }), `rodada "${data.summary.titulo}" encerrada`);
}

/** casos críticos já avisados nesta sessão (a mesma falha na mesma rodada não repete) */
const sent = new Set();

/**
 * ❌ Caso crítico falhou: chamado quando a execução de um caso termina em FAIL (painel ▶) ou o caso inteiro é marcado
 * FAIL na rodada. O texto do caso é passado na hora (o app pode já ter aberto o próximo).
 * @param {{ text: string, path?: string, key?: string }} o
 */
export async function notifyCaseFailed({ text, path = '', key = '' }) {
  const cfg = teamsConfig();
  if (!cfg.url || !cfg.critico) return;
  const m = metaOf(text);
  if (!isCritical(m.prioridade, cfg.nivel)) return;
  const id = str(m.id) || key || path.split('/').pop()?.replace(/\.(md|markdown)$/i, '') || 'caso';
  const { currentCycle } = await import('./cycle.js');
  const c = currentCycle();
  const cm = c ? metaOf(c.text) : {};
  const round = c ? str(cm.titulo) : '';
  const dedup = `${str(cm.id) || '-'}:${id}`;
  if (sent.has(dedup)) return;
  sent.add(dedup);
  const step = failedStep(text);
  const bugs = [...text.matchAll(/\[\[(BUG-[^\]|#]+)/gi)].map((x) => x[1]);
  await send(criticalCard({
    caso: { id, titulo: str(m.titulo), prioridade: str(m.prioridade), app: str(m.app), ambiente: str(m.ambiente), versao: str(m.versao) },
    passo: step ? { label: step.label, acao: step.action, esperado: step.expected, obtido: step.actual } : null,
    rodada: round, quem: loadPrefs().publisherName || '', bugs: [...new Set(bugs)], quando: new Date(),
  }), `${id} falhou`);
}

/** Ctrl+Shift+P → Avisos no Teams: configurar. */
export async function teamsSetting() {
  const cur = teamsConfig();
  const res = await showDialog({
    title: 'Avisos no Microsoft Teams', icon: '📣',
    message: 'Um cartão vai para o canal quando a rodada é encerrada e quando um caso crítico falha. Sem URL, fica desligado.\n\nNo Teams: no canal, ⋯ → Fluxos de trabalho (Workflows) → "Postar em um canal quando uma solicitação de webhook for recebida" → copie a URL e cole aqui. O envio vai pela extensão do navegador do TestFlow (sem ela, o app tenta direto).',
    input: { label: 'URL do webhook', value: cur.url, placeholder: 'https://….logic.azure.com/workflows/… ou …powerplatform.com/…', validate: (v) => (!v.trim() || validTeamsUrl(v) ? null : 'Cole a URL do webhook do Teams/Power Automate (https).') },
    select: { label: 'Caso crítico é o de prioridade', value: cur.nivel, options: [{ value: 'critica', label: 'Crítica' }, { value: 'alta', label: 'Crítica ou Alta' }] },
    checks: [
      { id: 'rodada', label: 'Avisar quando a rodada for encerrada (🏁 Finalizar)', checked: cur.rodada, hint: 'números, recomendação, falhas e bugs abertos' },
      { id: 'critico', label: 'Avisar quando um caso crítico falhar', checked: cur.critico, hint: 'o caso, o passo (esperado × obtido) e a rodada' },
    ],
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'test', label: 'Salvar e enviar teste' }, { id: 'ok', label: 'Salvar', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  if (!res || res.id === 'cancel') return;
  /** @type {TeamsConfig} */
  const next = { url: res.value.trim(), rodada: res.checks.rodada !== false, critico: res.checks.critico !== false, nivel: res.choice === 'alta' ? 'alta' : 'critica' };
  savePrefs({ teams: next });
  if (!next.url) { app.toast('Avisos no Teams desligados (sem URL).'); return; }
  if (res.id === 'test') { await send(testCard(loadPrefs().publisherName || ''), 'mensagem de teste'); return; }
  app.toast(`📣 Avisos no Teams: ${[next.rodada && 'rodada encerrada', next.critico && `caso ${next.nivel === 'alta' ? 'Crítico ou Alto' : 'Crítico'} com falha`].filter(Boolean).join(' e ') || 'nenhum evento marcado'}.`);
}
