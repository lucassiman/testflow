// @ts-check
/** Capturar a tela: print da janela do sistema testado direto para o documento, o passo da execução ou a nota da sessão. */
import { app } from './context.js';
import { createCapturer, supportsCapture } from '../io/capture.js';
import { addEvidence, downloadBlob } from './evidence.js';
import { errMsg } from './shared.js';

const status = /** @type {HTMLButtonElement | null} */ (document.getElementById('captureStatus'));

export const capturer = createCapturer({
  onChange: ({ active, label }) => {
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
  const name = `video-${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}.${file.type === 'video/mp4' ? 'mp4' : 'webm'}`;
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
