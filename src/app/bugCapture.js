// @ts-check
/**
 * Captura de bug pela extensão do navegador (11.4): com a preferência ligada e a extensão instalada, o bug criado
 * leva o contexto da aba testada (URL, navegador, sistema, tela), o console dela (resumo + `.log` em evidencias/)
 * e as requisições com falha (resumo + `.har`, sem cookies nem tokens).
 * Desligada — ou sem a extensão — nada muda: nenhum pedido é feito e os diálogos ficam como eram.
 */
import { app } from './context.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { createExtBridge } from '../io/extBridge.js';
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

/** @type {ReturnType<typeof createExtBridge> | null} */
let bridge = null;
/** criada só quando a preferência está ligada (desligada: nem escuta mensagens) */
const getBridge = () => bridge || (bridge = createExtBridge());
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
