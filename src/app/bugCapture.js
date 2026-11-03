// @ts-check
/**
 * Captura de bug pela extensão do navegador (11.4): com a preferência ligada e a extensão instalada, o bug criado
 * leva o contexto da aba testada (URL, navegador, sistema, tela), o console dela (resumo + `.log` em evidencias/)
 * e as requisições com falha (resumo + `.har`, sem cookies nem tokens).
 * Desligada — ou sem a extensão — nada muda: nenhum pedido é feito e os diálogos ficam como eram.
 */
import { app } from './context.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { extension, extensionPresent } from './extension.js';
import { applyCaptureToBug, captureSummary, consoleLog, harText, tabLabel } from '../markdown/bugCapture.ts';
import { evidenceBaseName, evidenceStamp } from '../markdown/evidenceName.ts';
import { showDialog } from '../ui/dialog.js';
import { captureInsertion, docLabel, downloadBlob, placeEvidence, saveEvidenceFiles } from './evidence.js';
import { errMsg } from './shared.js';

/** @typedef {import('../markdown/bugCapture.ts').Capture} Capture */
/** @typedef {import('../markdown/bugCapture.ts').CaptureTab} CaptureTab */
/** @typedef {{ abas: CaptureTab[], padrao: string }} CaptureOffer */
/** @typedef {import('../markdown/bugCapture.ts').CapturePaths} CapturePaths */
/** @typedef {{ cap: Capture, log: File, har: File | null }} TakenCapture */

/** Preferência "Captura de bug pela extensão" (desligada por padrão). */
export const captureEnabled = () => loadPrefs().bugCapture === true;

/** a ponte só é criada quando a preferência está ligada (desligada: nem escuta mensagens) */
const getBridge = extension;
let warnedMissing = false;

/**
 * Abas para escolher no diálogo do bug. null = preferência desligada, extensão ausente/pausada ou nenhuma aba.
 * @returns {Promise<CaptureOffer | null>}
 */
export async function captureOffer() {
  if (!captureEnabled()) return null;
  try {
    const { abas, pausado } = await getBridge().tabs();
    if (pausado) { onceToast('A extensão do TestFlow está pausada — o bug vai sem console e contexto (retome no ícone da extensão).'); return null; }
    if (!abas?.length) return null;
    return { abas, padrao: String(abas[0].id) };
  } catch {
    onceToast('Captura pela extensão ligada, mas a extensão não respondeu — o bug vai sem console e contexto. Instalação: Manual, seção 8.3.');
    return null;
  }
}

/** Avisa uma vez por sessão (não a cada bug). @param {string} text */
function onceToast(text) {
  if (warnedMissing) return;
  warnedMissing = true;
  setTimeout(() => app.toast(text, 'error', { duration: 7000 }), 50);
}

/** Opções do seletor: as abas (a última em foco primeiro) + "não anexar". @param {CaptureOffer} offer */
export function captureSelect(offer) {
  return {
    label: 'Console e contexto da aba testada (extensão)',
    value: offer.padrao,
    options: [...offer.abas.map((t) => ({ value: String(t.id), label: tabLabel(t) })), { value: '', label: 'Não anexar' }],
    hint: 'URL, navegador, sistema e tela vão para Ambiente; os erros do console e as requisições com falha (HAR) para Evidências — sem cookies nem tokens, dados sensíveis mascarados.',
  };
}

/**
 * Pede a captura da aba e monta o `.log` e, se houve falha de rede, o `.har` (já limpos e mascarados).
 * @param {string | number} tabId @param {string} docId vai no nome dos arquivos
 * @returns {Promise<TakenCapture>}
 */
export async function takeCapture(tabId, docId) {
  const cap = await getBridge().capture(Number(tabId));
  const stamp = evidenceStamp();
  const log = new File([consoleLog(cap)], `${evidenceBaseName(stamp, { docId, step: 'console' })}.log`, { type: 'text/plain' });
  const har = cap.rede?.length ? new File([harText(cap)], `${evidenceBaseName(stamp, { docId, step: 'rede' })}.har`, { type: 'application/json' }) : null;
  return { cap, log, har };
}

/**
 * Grava o `.log` e o `.har` com `write` (devolve os caminhos na mesma ordem); sem onde gravar, baixa os dois.
 * @param {TakenCapture} taken @param {(files: File[]) => Promise<string[] | null>} write
 * @returns {Promise<CapturePaths>}
 */
export async function storeCapture(taken, write) {
  const files = [taken.log, ...(taken.har ? [taken.har] : [])];
  const paths = (await write(files)) || [];
  if (!paths.length) files.forEach((f) => downloadBlob(f, f.name)); // não se perde
  return { log: paths[0] || '', har: taken.har ? paths[1] || '' : '' };
}

/** Ctrl+Shift+P → ligar/desligar. Ao ligar, confere se a extensão responde. */
export async function toggleCapture() {
  const on = !captureEnabled();
  savePrefs({ bugCapture: on });
  if (!on) { app.toast('Captura de bug pela extensão desligada — o bug volta a ser só o que você escreve e cola.'); return; }
  warnedMissing = false;
  const hi = await getBridge().hello();
  if (hi) app.toast(`🧩 Captura de bug pela extensão ligada (extensão ${hi.versao}${hi.pausado ? ', pausada' : ''}): ao criar um bug, escolha a aba testada — console e contexto vão junto.`, 'info', { duration: 7000 });
  else app.toast('Captura de bug pela extensão ligada, mas a extensão não respondeu. Instale-a (Manual, seção 8.3) e recarregue esta página.', 'error', { duration: 9000 });
}

/**
 * Ctrl+Shift+P → anexar console e contexto aqui: num bug, preenche Ambiente e "Console e rede";
 * em outro documento, o resumo entra onde você está (ou no passo da execução).
 */
export async function attachCaptureHere() {
  if (!captureEnabled()) { app.toast('Ligue antes: Ctrl+Shift+P → "Captura de bug pela extensão: ligar/desligar".', 'error'); return; }
  const ctx = captureInsertion(app.target());
  const offer = await captureOffer();
  if (!offer) { app.toast('A extensão não mandou nenhuma aba — abra o sistema testado numa aba do Chrome/Edge com a extensão instalada.', 'error'); return; }
  const res = await showDialog({
    title: 'Console e contexto da aba testada', icon: '🧩',
    message: 'O que a extensão guardou da aba (erros do console dos últimos 30 min, URL, navegador, sistema e tela) vem para este documento; o log completo vai para evidencias/.',
    select: { ...captureSelect(offer), options: captureSelect(offer).options.filter((o) => o.value) },
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Anexar', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  if (res?.id !== 'ok' || !res.choice) return;
  /** @type {TakenCapture} */
  let taken;
  try { taken = await takeCapture(res.choice, docLabel()); } catch (err) { app.toast(`A extensão não mandou a captura: ${errMsg(err)}`, 'error'); return; }
  const paths = await storeCapture(taken, (files) => saveEvidenceFiles(files, {}));
  if (/^tipo[ \t]*:[ \t]*bug\b/m.test(app.store.source)) {
    app.store.history.breakGroup();
    app.store.setSource(applyCaptureToBug(app.store.source, taken.cap, paths), { origin: 'command' });
  } else {
    placeEvidence(captureSummary(taken.cap, paths).join('\n'), ctx);
  }
  app.toast(`🧩 Console${taken.har ? ', rede' : ''} e contexto de "${taken.cap.contexto.titulo || taken.cap.aba.titulo}" anexados${paths.log ? ` — arquivos em ${paths.log.replace(/\/[^/]*$/, '/')}` : ' (os arquivos foram baixados)'}.`);
}

// ---------------------------------------------------------------- E5: quando ligar (estado na barra e dica ao começar)
/** @typedef {'on' | 'paused' | 'missing' | 'off' | 'absent'} CaptureState */
/** @type {{ state: CaptureState, at: number, versao: string }} */
let ext = { state: 'absent', at: 0, versao: '' };
/** @type {Promise<CaptureState> | null} */
let checking = null;

/**
 * Pergunta à extensão como ela está (no máximo a cada 20 s). Desligada no TestFlow: não pergunta nada — só sabe se
 * ela se anunciou ao carregar a página.
 * @param {(state: CaptureState) => void} [onChange] @returns {Promise<CaptureState>}
 */
export function checkCapture(onChange) {
  if (!captureEnabled()) return Promise.resolve(knownState());
  if (checking) return checking;
  if (Date.now() - ext.at < 20_000) return Promise.resolve(ext.state);
  checking = (async () => {
    const before = ext.state;
    const hi = await getBridge().hello();
    /** @type {CaptureState} */
    const state = hi ? (hi.pausado ? 'paused' : 'on') : 'missing';
    ext = { state, at: Date.now(), versao: hi?.versao || '' };
    checking = null;
    if (state !== before) onChange?.(state);
    return state;
  })();
  return checking;
}

/** O estado guardado (sem perguntar), já com a preferência de agora. @returns {CaptureState} */
function knownState() {
  if (!captureEnabled()) return extensionPresent() || (ext.at && ext.state !== 'missing') ? 'off' : 'absent';
  return ext.at ? ext.state : extensionPresent() ? 'on' : 'missing';
}

const CHIP = {
  on: { icon: '🧩', label: 'console e rede', tone: 'ok', title: 'A extensão está guardando o console e as requisições com falha das abas (últimos 30 min). Ao criar um bug, escolha a aba testada. Se a aba do sistema já estava aberta antes da extensão, recarregue-a.' },
  paused: { icon: '⏸', label: 'extensão pausada', tone: 'warn', title: 'A extensão está pausada: nada é guardado e o bug sai sem console e rede. Retome no ícone dela na barra do navegador.' },
  missing: { icon: '🧩', label: 'sem extensão', tone: 'warn', title: 'A captura está ligada no TestFlow, mas a extensão não respondeu: instale-a (Manual 8.3) e recarregue esta página.' },
  off: { icon: '🧩', label: 'captura desligada', tone: 'off', title: 'A extensão está instalada, mas a captura está desligada no TestFlow: o bug não leva console e rede. Clique para ligar.' },
};

/**
 * Chip da barra Execução (num caso ou numa execução). null = sem extensão e sem a preferência (não incomoda quem não usa).
 * @param {() => void} [onChange] re-desenhar a barra quando o estado mudar
 * @returns {{ key: string, icon: string, label: string, tone: string, title: string } | null}
 */
export function captureChip(onChange) {
  checkCapture(() => onChange?.());
  const s = knownState();
  return s === 'absent' ? null : { key: s, ...CHIP[s] };
}

/** Clique no chip: desligada → liga; senão, a orientação de quando ligar. */
export async function captureChipClick() {
  const s = knownState();
  if (s === 'off') { await toggleCapture(); ext.at = 0; return; }
  const res = await showDialog({
    title: 'Console e rede no bug (extensão)', icon: '🧩',
    message: s === 'on'
      ? `Está ligada${ext.versao ? ` (extensão ${ext.versao})` : ''}. A extensão guarda sozinha o console e as requisições com falha das abas abertas — não precisa ligar nada a cada caso.`
      : CHIP[s === 'absent' ? 'missing' : s].title,
    detail: [
      'Quando ligar: antes do 1º caso da execução.',
      '1. Captura ligada no TestFlow (este chip) e a extensão sem pausa.',
      '2. Abra (ou recarregue) a aba do sistema testado depois disso — a extensão só vê as páginas abertas depois dela.',
      '3. Achou um defeito: crie o bug em até 30 min (é o que ela guarda) e escolha a aba testada — vão URL, navegador, tela, erros do console e requisições com falha (.log e .har em evidencias/), com tokens e dados pessoais mascarados.',
    ].join('\n'),
    buttons: [...(captureEnabled() ? [{ id: 'off', label: 'Desligar a captura' }] : []), { id: 'ok', label: 'Entendi', kind: /** @type {const} */ ('primary') }],
    defaultId: 'ok', cancelId: 'ok',
  });
  if (res?.id === 'off') { await toggleCapture(); ext.at = 0; }
}

/** Dica para o aviso de "rodada criada" ('' quando não há o que dizer). @returns {Promise<string>} */
export async function captureStartTip() {
  // desligada: não pergunta nada à extensão (só o anúncio dela conta)
  const s = await checkCapture();
  if (s === 'on') return ' 🧩 Console e rede: recarregue a aba do sistema testado antes do 1º caso (a extensão guarda os últimos 30 min).';
  if (s === 'paused') return ' ⏸ A extensão está pausada — retome no ícone dela para o bug levar console e rede.';
  if (s === 'missing') return ' 🧩 A captura está ligada, mas a extensão não respondeu.';
  if (s === 'off') return ' 🧩 Quer console e rede nos bugs? Ligue em Evidências ▾ → Captura pela extensão (ou no 🧩 da barra Execução).';
  return '';
}
