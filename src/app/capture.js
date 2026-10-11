// @ts-check
/** Capturar a tela: print da janela do sistema testado direto para o documento, o passo da execução ou a nota da sessão. */
import { app } from './context.js';
import { createCapturer, supportsCapture } from '../io/capture.js';
import { REPLAY_CHOICES, REPLAY_DEFAULT } from '../io/replay.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { evidenceBaseName, evidenceStamp } from '../markdown/evidenceName.ts';
import { showDialog } from '../ui/dialog.js';
import { addEvidence, docLabel, downloadBlob } from './evidence.js';
import { errMsg } from './shared.js';

const status = /** @type {HTMLButtonElement | null} */ (document.getElementById('captureStatus'));

/** Duração do replay instantâneo em segundos (0 = desligado). */
export function replaySeconds() {
  const v = loadPrefs().replaySeconds;
  return typeof v === 'number' && (v === 0 || REPLAY_CHOICES.includes(v)) ? v : REPLAY_DEFAULT;
}

export const capturer = createCapturer({
  replaySeconds,
  onChange: ({ active, label }) => {
    paintReplay();
    if (!status) return;
    status.hidden = !active;
    status.textContent = `📸 ${shortLabel(label)} · parar`;
    status.title = `Capturando "${label}" — cada 📸 Capturar (Ctrl+Alt+P) tira um print desta janela. Clique para parar (ou "Parar de compartilhar" na barra do navegador).`;
  },
});
status?.addEventListener('click', () => { capturer.stop(); app.toast('Captura de tela desligada.'); });

/** @param {string} label */
const shortLabel = (label) => (label.length > 28 ? `${label.slice(0, 26)}…` : label);

/**
 * Tira o print (pede a janela na primeira vez). Devolve [] se não deu ou o usuário cancelou.
 * @param {{ win?: Window, choose?: boolean, floating?: boolean }} [opts]
 * @returns {Promise<File[]>}
 */
export async function captureFiles({ win = window, choose = false, floating = false } = {}) {
  if (!supportsCapture) { app.toast('Este navegador não captura a tela — use Chrome ou Edge (ou PrtSc + Ctrl+V).', 'error'); return []; }
  const first = !capturer.active || choose;
  if (first && floating) {
    // escolher a janela abre o seletor do navegador na janela do editor
    app.toast('Escolha a janela a capturar no seletor do navegador…');
  }
  try {
    const file = await capturer.grab({ win, choose });
    if (!file) { if (first) app.toast('Captura cancelada — nenhuma janela escolhida.'); return []; }
    if (first) setTimeout(() => app.toast(`📸 Capturando "${shortLabel(capturer.label)}" — os próximos prints são um clique (Ctrl+Alt+P). Rodapé → parar.`, 'info', { duration: 5000 }), 50);
    return [file];
  } catch (err) {
    app.toast(`Não foi possível capturar a tela: ${errMsg(err)}`, 'error');
    return [];
  }
}

/**
 * 📸 Capturar no documento: o print entra onde o cursor está (ou no passo da execução aberta).
 * @param {{ choose?: boolean }} [opts]
 */
export async function captureToDocument({ choose = false } = {}) {
  const where = app.target();
  const files = await captureFiles({ choose });
  if (!files.length) return;
  // sessão exploratória aberta: o print vai para a próxima nota (como o 📸 do painel)
  if (app.runner?.mode === 'session') { await app.runner.addPrints(files); return; }
  await addEvidence(files, where);
}

export { supportsCapture };

// ---------------------------------------------------------------- gravar vídeo (bug intermitente)
/** parar pelo botão: quem parou insere o vídeo (senão o onStop insere: 5 min ou "Parar de compartilhar") */
let stoppingByUser = false;
const recStatus = /** @type {HTMLButtonElement | null} */ (document.getElementById('recordStatus'));
/** @type {ReturnType<typeof setInterval> | undefined} */
let recTick;
/** @param {number} ms */
const mmss = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function paintRec() {
  if (!recStatus) return;
  recStatus.hidden = !capturer.recording;
  recStatus.textContent = `${mmss(capturer.recordingMs)} · parar gravação`;
  recStatus.title = 'Gravando a janela compartilhada — clique (ou Ctrl+Alt+G) para parar: o vídeo vai para evidencias/ e o link entra onde você está (passo da execução, nota da sessão ou documento). Para sozinho em 5 min.';
}
recStatus?.addEventListener('click', () => { toggleRecording(); });

/**
 * ⏺ Gravar / parar: grava um trecho da janela do sistema testado (para bug intermitente).
 * Ao parar, o vídeo (.webm) vai para evidencias/ e o link entra no passo da execução, na próxima nota da sessão ou no documento.
 * @param {{ win?: Window, floating?: boolean }} [opts]
 */
export async function toggleRecording({ win = window, floating = false } = {}) {
  if (!supportsCapture || !capturer.canRecord) { app.toast('Este navegador não grava a tela — use Chrome ou Edge.', 'error'); return; }
  if (capturer.recording) {
    stoppingByUser = true;
    const file = await capturer.stopRecording();
    if (!file) { app.toast('Nada foi gravado.', 'error'); return; }
    await placeVideo(file, floating);
    return;
  }
  try {
    const first = !capturer.active;
    if (first) app.toast('Escolha a janela a gravar no seletor do navegador…');
    const ok = await capturer.startRecording({
      win,
      // parou sozinho (5 min ou "Parar de compartilhar"): guarda o que foi gravado
      onStop: (file) => { clearInterval(recTick); paintRec(); if (file && !stoppingByUser) placeVideo(file, floating); stoppingByUser = false; },
    });
    if (!ok) { app.toast('Gravação cancelada — nenhuma janela escolhida.'); return; }
    if (!capturer.recording) return; // outro clique já está começando a gravação
    clearInterval(recTick);
    recTick = setInterval(paintRec, 500);
    paintRec();
    app.toast('⏺ Gravando — reproduza o problema; clique no contador do rodapé (ou Ctrl+Alt+G) para parar.', 'info', { duration: 4000 });
  } catch (err) {
    app.toast(`Não foi possível gravar a tela: ${errMsg(err)}`, 'error');
  }
}

/** Grava o vídeo e põe o link no lugar; se não der (sem pasta, cancelou), baixa o arquivo — o vídeo não se perde. @param {File} file @param {boolean} floating */
async function placeVideo(file, floating) {
  const name = !/^video\.[a-z0-9]+$/i.test(file.name) ? file.name : `video-${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.${file.type === 'video/mp4' ? 'mp4' : 'webm'}`;
  const before = app.store.source;
  if (app.runner?.mode === 'session') {
    const pending = app.runner.pendingPrints;
    await app.runner.addPrints([file]);
    if (app.runner.pendingPrints > pending) { app.toast('🎬 Vídeo salvo — vai junto com a próxima nota da sessão.'); return; }
  } else {
    await addEvidence([file], app.target(), { floating });
    if (app.store.source !== before) return;
  }
  downloadBlob(file, name);
  app.toast(`🎬 Não deu para gravar o vídeo em evidencias/ — ele foi baixado como ${name} (arraste para o documento depois).`, 'error', { duration: 9000 });
}

// ---------------------------------------------------------------- replay instantâneo (os últimos N s, sem ter apertado gravar)
const replayStatus = /** @type {HTMLButtonElement | null} */ (document.getElementById('replayStatus'));
/** @type {ReturnType<typeof setInterval> | undefined} */
let replayTick;
/** @param {number} seconds */
export const secondsLabel = (seconds) => (seconds >= 120 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`);

function paintReplay() {
  if (!replayStatus) return;
  const btn = replayStatus;
  clearInterval(replayTick);
  btn.hidden = !capturer.replaying;
  if (btn.hidden) return;
  const draw = () => {
    if (!capturer.replaying) { paintReplay(); return; }
    const win = capturer.replayWindowMs / 1000;
    const have = Math.min(win, Math.floor(capturer.replayCoveredMs / 1000));
    btn.textContent = have < win ? `⏪ ${have}/${win} s` : `⏪ ${secondsLabel(win)}`;
    btn.title = `Replay instantâneo: os últimos ${secondsLabel(win)} da janela capturada ficam guardados só na memória (nada vai para o disco). Clique (ou Ctrl+Alt+R) para salvar o vídeo onde você está — passo da execução, nota da sessão ou documento.`;
  };
  draw();
  replayTick = setInterval(draw, 1000);
}
replayStatus?.addEventListener('click', () => { saveReplay(); });

/** Nome do arquivo do replay: `2026-10-11_14-30-12_TC-042-replay.webm`. @param {File} file @param {string} docId */
function replayFile(file, docId) {
  const stamp = evidenceStamp();
  const ext = file.type === 'video/mp4' ? 'mp4' : 'webm';
  return new File([file], `${evidenceBaseName(stamp, { docId, step: 'replay' })}.${ext}`, { type: file.type });
}

/**
 * Copia o replay agora (o momento do bug), para anexar depois — no diálogo do bug, por exemplo.
 * null = replay desligado ou nada guardado ainda.
 * @param {string} [docId] documento dono do vídeo (vai no nome do arquivo)
 * @returns {Promise<{ file: File, ms: number } | null>}
 */
export async function takeReplay(docId = docLabel()) {
  if (!capturer.replaying) return null;
  try {
    const clip = await capturer.saveReplay();
    return clip ? { file: replayFile(clip.file, docId), ms: clip.ms } : null;
  } catch { return null; }
}

/** Duração do trecho para mostrar (1:05). @param {number} ms */
export const clipLabel = (ms) => mmss(ms);

/**
 * ⏪ Salvar replay (Ctrl+Alt+R): os últimos N s da janela capturada vão para evidencias/ e o link entra onde você está.
 * Sem a captura ligada, pede a janela e liga o replay (os próximos N s passam a ficar guardados).
 * @param {{ win?: Window, floating?: boolean }} [opts]
 */
export async function saveReplay({ win = window, floating = false } = {}) {
  if (!supportsCapture || !globalThis.MediaRecorder) { app.toast('Este navegador não grava a tela — use Chrome ou Edge.', 'error'); return; }
  const seconds = replaySeconds();
  if (!seconds) {
    app.toast('O replay instantâneo está desligado — Ctrl+Shift+P → "Replay instantâneo: duração" para ligar.', 'error', { duration: 6000 });
    return;
  }
  if (!capturer.active) {
    app.toast('Escolha a janela do sistema testado no seletor do navegador…');
    try {
      if (!(await capturer.share({ win }))) { app.toast('Replay não ligado — nenhuma janela escolhida.'); return; }
    } catch (err) { app.toast(`Não foi possível capturar a tela: ${errMsg(err)}`, 'error'); return; }
    app.toast(`⏪ Replay ligado: daqui em diante os últimos ${secondsLabel(seconds)} de "${shortLabel(capturer.label)}" ficam guardados (só na memória). Quando o problema acontecer, ⏪ no rodapé ou Ctrl+Alt+R salva o vídeo.`, 'info', { duration: 7000 });
    return;
  }
  if (!capturer.replaying) { capturer.restartReplay(); app.toast(`⏪ Replay ligado: os últimos ${secondsLabel(seconds)} passam a ficar guardados.`); return; }
  const clip = await takeReplay();
  if (!clip) { app.toast('O replay ainda não tem nada guardado — tente de novo em um segundo.', 'error'); return; }
  await placeVideo(clip.file, floating);
}

/** Ctrl+Shift+P → Replay instantâneo: 30 s / 60 s / 2 min / desligado. */
export async function replaySetting() {
  const cur = replaySeconds();
  const res = await showDialog({
    title: 'Replay instantâneo', icon: '⏪',
    message: 'Enquanto a janela do sistema testado está sendo capturada (📸), os últimos segundos ficam guardados só na memória — sem ter apertado ⏺ Gravar. Quando o problema acontecer, ⏪ no rodapé (ou Ctrl+Alt+R) salva o vídeo; o bug criado na hora também pode levá-lo.',
    select: { label: 'Guardar', value: String(cur), options: [...REPLAY_CHOICES.map((n) => ({ value: String(n), label: `Os últimos ${secondsLabel(n)}` })), { value: '0', label: 'Desligado' }] },
    buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'ok', label: 'Salvar', kind: 'primary' }],
    defaultId: 'ok', cancelId: 'cancel',
  });
  if (res?.id !== 'ok') return;
  const choice = Number(res.choice ?? cur);
  savePrefs({ replaySeconds: choice });
  capturer.restartReplay();
  app.toast(choice ? `Replay instantâneo: os últimos ${secondsLabel(choice)}${capturer.active ? '' : ' (começa quando a captura de tela for ligada)'}.` : 'Replay instantâneo desligado.');
}
