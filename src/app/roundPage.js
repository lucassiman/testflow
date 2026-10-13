// @ts-check
/**
 * Página da rodada para o time (11.5): com a opção ligada, o TestFlow grava na pasta oficial (OneDrive)
 * `acompanhamento/<EXEC>.html` — um HTML único que o PO/gerente abre no navegador, sem instalar nada — e o índice
 * `acompanhamento/index.html`. A página é regravada a cada caso concluído e no encerramento (com a recomendação), e se
 * recarrega sozinha enquanto a rodada está aberta. Desligada por padrão.
 */
import { app } from './context.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { writeText } from '../io/fsOps.js';
import { ensurePermission, hasPermission } from '../io/recents.js';
import { cellToText } from '../markdown/runs.ts';
import { cycleClosed, cycleTable } from '../markdown/cycle.ts';
import { caseAvgMs, forecast, forecastText } from '../markdown/forecast.ts';
import { detectFrontMatter, parseFrontMatter } from '../markdown/frontmatter.ts';
import { readRoundPageMeta, roundIndexHtml, roundPageFile, roundPageHtml } from '../markdown/roundPage.ts';
import { showDialog } from '../ui/dialog.js';
import { configureOfficial, officialDir } from './publishing.js';
import { openDocOverrides } from './links.js';
import { JIRA_BASE, docIndex, errMsg } from './shared.js';

export const PAGE_DIR = 'acompanhamento';
export const pageOn = () => loadPrefs().roundPage?.on === true;

/** @param {string} text */
const metaOf = (text) => { const fm = detectFrontMatter(text); return fm ? parseFrontMatter(text.split('\n').slice(0, fm.end).join('\n')).data : {}; };
const str = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.join(', ') : v === undefined || v === null ? '' : String(v).trim());
/** Célula da tabela da rodada → texto ([[TC-1]] → TC-1, sem crases). @param {string | undefined} c */
const plain = (c) => cellToText(c || '').replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g, (_m, k, l) => l || k).replace(/[`*]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Monta a página de uma rodada (texto do documento da execução) — também usada no "Ver a página".
 * @param {{ path: string, text: string }} c
 */
export async function buildRoundPage(c) {
  const { roundData } = await import('./cycle.js');
  const data = roundData(c);
  if (!data) return null;
  const m = metaOf(data.text);
  const id = str(m.id) || c.path.split('/').pop()?.replace(/\.(md|markdown)$/i, '') || 'rodada';
  const t = cycleTable(data.text);
  const open = openDocOverrides();
  const cases = (t?.rows || []).map((r) => {
    const status = r.status || '';
    const det = data.details[r.key];
    const step = (status === 'FAIL' || status === 'BLOCKED') ? det?.steps?.[0] : null;
    return {
      key: r.key,
      titulo: (t && t.cols.titulo >= 0 ? plain(r.cells[t.cols.titulo]) : '') || det?.titulo || '',
      status,
      quando: t && t.cols.when >= 0 ? plain(r.cells[t.cols.when]) : '',
      testador: t && t.cols.tester >= 0 ? plain(r.cells[t.cols.tester]) : '',
      bugs: t && t.cols.bugs >= 0 ? [...(r.cells[t.cols.bugs] || '').matchAll(/\[\[([^\]|#]+)/g)].map((x) => x[1].trim()) : [],
      // o passo como texto, sem a marcação do Markdown (**Pago**, [[BUG-2]])
      passo: step ? { n: step.n, acao: plain(step.acao), obtido: plain(step.obtido) } : null,
    };
  });
  // previsão (rodada aberta) pela duração média de cada caso; recomendação do Encerramento (rodada encerrada)
  const closed = cycleClosed(data.text);
  const textOf = (/** @type {string} */ key) => { const e = docIndex.resolve(key); return e ? open.get(e.path) ?? e.text ?? '' : ''; };
  const previsao = closed ? '' : forecastText(forecast(cases.map((x) => ({ done: !!x.status && x.status !== 'PENDING', avgMs: caseAvgMs(textOf(x.key)) }))));
  const enc = docIndex.resolve(`${id}-ENC`);
  const recomendacao = closed && enc?.text ? str(metaOf(enc.text).recomendacao) : '';
  return {
    id,
    html: roundPageHtml({
      id, summary: data.summary, cases, bugs: data.bugs, app: str(m.app), versao: str(m.versao), responsavel: str(m.responsavel),
      links: data.linksText, recomendacao, previsao, jiraBase: JIRA_BASE,
    }),
  };
}

let warned = false;
/** Avisa uma vez por sessão (não a cada caso). @param {string} msg @param {{ action?: { label: string, run: () => void } }} [opts] */
function warnOnce(msg, opts) {
  if (warned) return;
  warned = true;
  app.toast(msg, 'error', { duration: 9000, ...(opts || {}) });
}

/**
 * Grava a página da rodada e o índice na pasta oficial. `interactive`: veio de um clique (pode pedir permissão).
 * @param {{ path: string, text: string }} c @param {{ interactive?: boolean }} [o]
 * @returns {Promise<string | null>} o caminho gravado
 */
export async function publishRoundPage(c, { interactive = false } = {}) {
  const off = officialDir;
  if (!off) {
    if (interactive) app.toast('Configure a pasta oficial primeiro (☰ → 🏛 Oficial): a página fica lá para o time.', 'error');
    else warnOnce('Página da rodada ligada, mas sem pasta oficial configurada — ☰ → 🏛 Oficial.');
    return null;
  }
  const granted = interactive ? await ensurePermission(off) : await hasPermission(off);
  if (!granted) {
    warnOnce(`A página da rodada não foi atualizada: o navegador precisa liberar a pasta oficial (${off.name}).`, { action: { label: 'Liberar', run: () => { ensurePermission(off).then((ok) => { if (ok) publishRoundPage(c, { interactive: true }); }); } } });
    return null;
  }
  const page = await buildRoundPage(c);
  if (!page) return null;
  const rel = `${PAGE_DIR}/${roundPageFile(page.id)}`;
  try {
    await writeText(off, rel, page.html);
    await writeIndex(off);
    return rel;
  } catch (err) {
    app.toast(`A página da rodada não foi gravada na pasta oficial: ${errMsg(err)}`, 'error');
    return null;
  }
}

/** O índice: lê os metadados de cada página publicada. @param {FileSystemDirectoryHandle} off */
async function writeIndex(off) {
  const dir = await off.getDirectoryHandle(PAGE_DIR, { create: true });
  /** @type {Array<{ file: string, meta: import('../markdown/roundPage.ts').RoundPageMeta }>} */
  const pages = [];
  for await (const [name, handle] of /** @type {any} */ (dir).entries()) {
    if (handle.kind !== 'file' || !/\.html$/i.test(name) || name === 'index.html') continue;
    const meta = readRoundPageMeta(await (await handle.getFile()).slice(0, 20000).text());
    if (meta) pages.push({ file: name, meta });
  }
  await writeText(off, `${PAGE_DIR}/index.html`, roundIndexHtml(pages));
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer;
/** Depois de um caso concluído/marcado: atualiza a página da rodada ativa (espera o app salvar e trocar de caso). */
export function scheduleRoundPage() {
  if (!pageOn()) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const { currentCycle } = await import('./cycle.js');
    const c = currentCycle();
    if (c) await publishRoundPage(c);
  }, 1500);
}

/** No encerramento (depois dos relatórios, para levar a recomendação). @param {string} execPath @param {string} text */
export async function publishClosedRound(execPath, text) {
  if (!pageOn()) return;
  clearTimeout(timer);
  const rel = await publishRoundPage({ path: execPath, text });
  if (rel) app.toast(`🌐 Página da rodada atualizada na pasta oficial: ${rel}`);
}

/** Ctrl+Shift+P → Página da rodada para o time. */
export async function roundPageSetting() {
  const { currentCycle } = await import('./cycle.js');
  const c = currentCycle();
  const on = pageOn();
  const off = officialDir;
  const res = await showDialog({
    title: 'Página da rodada para o time', icon: '🌐',
    message: `${on ? '✅ Ligada.' : 'Desligada.'} Com ela ligada, o TestFlow grava na pasta oficial ${off ? `(${off.name}) ` : ''}a página ${PAGE_DIR}/<EXEC>.html de cada rodada — números, casos, falhas, bugs abertos e, no fim, a recomendação — e o índice ${PAGE_DIR}/index.html. É regravada a cada caso concluído e se recarrega sozinha enquanto a rodada está aberta.\n\nO PO/gerente abre o arquivo no navegador, sem instalar nada (com a pasta do OneDrive sincronizada, ou baixando o arquivo). Dados sensíveis saem mascarados.${off ? '' : '\n\n⚠ A pasta oficial ainda não está configurada.'}`,
    buttons: [
      { id: 'cancel', label: 'Fechar' },
      ...(c ? [{ id: 'preview', label: 'Ver a página' }] : []),
      ...(off ? [] : [{ id: 'official', label: 'Configurar a pasta oficial…' }]),
      on ? { id: 'off', label: 'Desligar' } : { id: 'on', label: c ? 'Ligar e publicar agora' : 'Ligar', kind: /** @type {const} */ ('primary') },
      ...(on && c ? [{ id: 'now', label: 'Atualizar agora', kind: /** @type {const} */ ('primary') }] : []),
    ],
    defaultId: on ? (c ? 'now' : 'cancel') : 'on', cancelId: 'cancel',
  });
  if (!res || res.id === 'cancel') return;
  if (res.id === 'official') { await configureOfficial(); return; }
  if (res.id === 'off') { savePrefs({ roundPage: { on: false } }); app.toast('Página da rodada desligada — as páginas já publicadas ficam na pasta oficial.'); return; }
  if (res.id === 'preview' && c) {
    const page = await buildRoundPage(c);
    if (page) window.open(URL.createObjectURL(new Blob([page.html], { type: 'text/html' })), '_blank', 'noopener');
    return;
  }
  if (res.id === 'on') savePrefs({ roundPage: { on: true } });
  if (!c) { app.toast('🌐 Página da rodada ligada: ela é publicada quando você executar uma rodada.'); return; }
  const rel = await publishRoundPage(c, { interactive: true });
  if (rel) app.toast(`🌐 Página da rodada publicada na pasta oficial: ${rel} (e o índice ${PAGE_DIR}/index.html).`, 'info', { duration: 8000 });
}

