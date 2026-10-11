// @ts-check
/**
 * Replay instantâneo: enquanto a janela do sistema testado está compartilhada (📸), os últimos N segundos ficam
 * guardados na memória — sem ter apertado ⏺ Gravar. Nada sai do computador e nada vai para o disco até salvar.
 *
 * Um vídeo .webm não pode ser cortado em pedaços soltos (só o começo da gravação tem o cabeçalho). Por isso dois
 * gravadores rodam defasados de N s e cada um recomeça quando passa de 2N s: a qualquer momento um deles tem entre
 * N e 2N s. Salvar copia o que esse gravador já tem (ele continua gravando).
 *
 * As regras de quando recomeçar e qual salvar são funções puras (testadas em tests/unit/replay.test.mjs).
 */

/** Durações oferecidas (segundos). 0 = desligado. */
export const REPLAY_CHOICES = [30, 60, 120];
export const REPLAY_DEFAULT = 60;

/**
 * Qual gravador (re)começar agora, ou -1. Um gravador parado ou que passou do ciclo (2N) recomeça — desde que os
 * outros já cubram a janela (N): com o editor em segundo plano os timers atrasam e os dois podiam vencer juntos,
 * o que deixaria o replay sem nada guardado por um tempo.
 * @param {number[]} ages idade de cada gravador em ms (-1 = parado)
 * @param {number} windowMs N
 */
export function slotToRestart(ages, windowMs) {
  if (!ages.some((a) => a >= 0)) return ages.length ? 0 : -1;
  for (let i = 0; i < ages.length; i++) {
    const due = ages[i] < 0 || ages[i] >= windowMs * 2;
    if (due && ages.every((a, j) => j === i || a >= windowMs)) return i;
  }
  return -1;
}

/**
 * Qual gravador salvar: o que grava há mais tempo (cobre a janela inteira). -1 = nenhum gravando.
 * @param {number[]} ages
 */
export function slotToSave(ages) {
  let best = -1;
  ages.forEach((a, i) => { if (a >= 0 && (best < 0 || a > ages[best])) best = i; });
  return best;
}

/** Formato do replay: VP8 primeiro (mais leve para o processador que VP9 — são dois gravadores ao mesmo tempo). */
export function replayMime(MR = /** @type {typeof MediaRecorder | undefined} */ (globalThis.MediaRecorder)) {
  if (!MR) return '';
  return ['video/webm;codecs=vp8', 'video/webm', 'video/webm;codecs=vp9', 'video/mp4'].find((t) => MR.isTypeSupported?.(t)) || '';
}

/**
 * @typedef {{ rec: MediaRecorder, chunks: Blob[], started: number }} Slot
 * @typedef {{ file: File, ms: number }} ReplayClip
 */

/**
 * Buffer do replay sobre um MediaStream que já existe (o da captura de tela).
 * @param {{
 *   stream: MediaStream,
 *   windowMs: number,
 *   MR?: typeof MediaRecorder,
 *   now?: () => number,
 *   tickMs?: number,
 *   bitrate?: number,
 *   onError?: (err: unknown) => void,
 * }} o
 */
export function createReplayBuffer({ stream, windowMs, MR = globalThis.MediaRecorder, now = Date.now, tickMs = 1000, bitrate = 1_000_000, onError }) {
  const mime = replayMime(MR);
  /** @type {(Slot | null)[]} */
  const slots = [null, null];
  let running = false;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer;

  const ages = () => slots.map((s) => (s ? now() - s.started : -1));

  /** @param {Slot | null} s */
  function halt(s) {
    if (s && s.rec.state !== 'inactive') { try { s.rec.stop(); } catch { /* já parou */ } }
  }

  /** @param {number} i */
  function begin(i) {
    halt(slots[i]);
    slots[i] = null;
    const rec = new MR(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    /** @type {Slot} */
    const slot = { rec, chunks: [], started: now() };
    rec.addEventListener('dataavailable', (e) => { if (/** @type {BlobEvent} */ (e).data?.size) slot.chunks.push(/** @type {BlobEvent} */ (e).data); });
    rec.start(1000);
    slots[i] = slot;
  }

  function tick() {
    if (!running) return;
    try {
      const i = slotToRestart(ages(), windowMs);
      if (i >= 0) begin(i);
    } catch (err) {
      stop();
      onError?.(err);
    }
  }

  function start() {
    if (running || !mime) return false;
    running = true;
    tick();
    if (!running) return false;
    timer = setInterval(tick, tickMs);
    return true;
  }

  function stop() {
    running = false;
    clearInterval(timer);
    slots.forEach(halt);
    slots[0] = null;
    slots[1] = null;
  }

  /**
   * Copia o que o gravador mais antigo já tem (ele continua gravando). null = nada gravado ainda.
   * @returns {Promise<ReplayClip | null>}
   */
  async function save() {
    const i = slotToSave(ages());
    const slot = i >= 0 ? slots[i] : null;
    if (!slot) return null;
    const ms = now() - slot.started;
    if (slot.rec.state === 'recording') {
      // pede o trecho ainda não entregue (o último segundo) e espera ele chegar
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 1500);
        slot.rec.addEventListener('dataavailable', () => { clearTimeout(t); resolve(undefined); }, { once: true });
        try { slot.rec.requestData(); } catch { clearTimeout(t); resolve(undefined); }
      });
    }
    if (!slot.chunks.length) return null;
    const type = mime.split(';')[0];
    return { file: new File(slot.chunks.slice(), `video.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type }), ms };
  }

  return {
    start,
    stop,
    save,
    tick,
    get running() { return running; },
    /** quanto já está guardado (ms): sobe até a janela e fica entre N e 2N */
    get coveredMs() { return Math.max(0, ...ages()); },
    get windowMs() { return windowMs; },
    get supported() { return !!mime; },
  };
}
