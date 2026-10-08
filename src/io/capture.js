// @ts-check
/**
 * Capturar a tela (print sem PrtSc + Ctrl+V): o navegador pede para escolher uma janela/tela uma vez
 * e o compartilhamento fica ativo; cada captura seguinte é instantânea (um quadro do vídeo vira PNG).
 * Tudo local (getDisplayMedia): nada sai do computador. Chrome/Edge, Windows e Mac.
 *
 * O navegador mostra a barra "compartilhando…" enquanto a captura está ligada; "Parar" nela (ou aqui) desliga.
 */

export const supportsCapture = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

/**
 * @param {{ onChange?: (state: { active: boolean, label: string }) => void }} [opts]
 */
export function createCapturer({ onChange } = {}) {
  /** @type {MediaStream | null} */
  let stream = null;
  /** @type {HTMLVideoElement | null} */
  let video = null;
  let label = '';

  const active = () => !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
  const notify = () => onChange?.({ active: active(), label });

  function stop() {
    if (recording && recording.rec.state !== 'inactive') recording.rec.stop();
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) { video.srcObject = null; video.remove(); }
    video = null;
    label = '';
    notify();
  }

  /**
   * Escolher a janela/tela (precisa de um clique do usuário). O compartilhamento continua ligado.
   * @param {Window} [win] janela onde o clique aconteceu (o painel flutuante tem a sua)
   */
  async function start(win = window) {
    const md = win.navigator.mediaDevices || navigator.mediaDevices;
    /** @type {any} opções do Chrome/Edge fora do lib.dom (preferir janela, não oferecer a própria aba) */
    const options = { video: { displaySurface: 'window', frameRate: 5 }, audio: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'include' };
    // a janela nova primeiro: se a pessoa cancelar o seletor, a captura que já estava ligada continua
    const s = await md.getDisplayMedia(options);
    stop();
    stream = s;
    const track = s.getVideoTracks()[0];
    label = track?.label || 'tela';
    track?.addEventListener('ended', () => { if (stream === s) stop(); });
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.srcObject = s;
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(v);
    video = v;
    await v.play().catch(() => {});
    await firstFrame(v);
    notify();
  }

  /** @param {HTMLVideoElement} v */
  function firstFrame(v) {
    return new Promise((resolve) => {
      if (v.videoWidth && v.readyState >= 2) { resolve(undefined); return; }
      const done = () => { clearTimeout(timer); resolve(undefined); };
      const timer = setTimeout(done, 1500);
      v.addEventListener('loadeddata', done, { once: true });
    });
  }

  /**
   * Quadro atual direto da trilha (ImageCapture, Chrome/Edge): não depende do <video> — que pode ficar parado
   * quando a janela do editor está escondida atrás do sistema testado (painel flutuante).
   * @returns {Promise<ImageBitmap | null>}
   */
  async function grabBitmap() {
    const track = stream?.getVideoTracks()[0];
    const IC = /** @type {any} */ (window).ImageCapture;
    if (!track || !IC) return null;
    try { return await new IC(track).grabFrame(); } catch { return null; }
  }

  /** Um quadro da janela compartilhada como PNG. @returns {Promise<File>} */
  async function frame() {
    if (!active()) throw new Error('o compartilhamento da janela terminou — clique em 📸 de novo para escolher a janela');
    const bitmap = await grabBitmap();
    const v = video;
    if (!bitmap) {
      if (!v) throw new Error('o compartilhamento da janela terminou — clique em 📸 de novo');
      // um quadro novo (a janela pode ter mudado desde o último)
      await new Promise((r) => setTimeout(r, 120));
    }
    const w = bitmap ? bitmap.width : /** @type {HTMLVideoElement} */ (v).videoWidth;
    const h = bitmap ? bitmap.height : /** @type {HTMLVideoElement} */ (v).videoHeight;
    if (!w || !h) throw new Error('a janela compartilhada ainda não mandou imagem — tente de novo');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.drawImage(bitmap || /** @type {HTMLVideoElement} */ (v), 0, 0, w, h);
    bitmap?.close();
    const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('não foi possível gerar a imagem'))), 'image/png'));
    return new File([/** @type {Blob} */ (blob)], 'image.png', { type: 'image/png' });
  }

  /** @type {Promise<boolean> | null} escolha de janela em andamento (dois cliques / atalho repetido não abrem dois seletores) */
  let starting = null;

  /**
   * Captura agora. Sem compartilhamento ativo, pede a janela primeiro (precisa de um clique).
   * @param {{ win?: Window, choose?: boolean }} [opts] choose: escolher outra janela
   * @returns {Promise<File | null>} null = usuário cancelou a escolha
   */
  async function grab({ win = window, choose = false } = {}) {
    if (starting) { if (!(await starting)) return null; }
    else if (choose || !active()) {
      starting = (async () => {
        try { await start(win); return true; } catch (err) {
          const e = /** @type {Error} */ (err);
          // Mac sem a permissão "Gravação de Tela" para o navegador: o sistema recusa (não foi a pessoa que cancelou)
          if (e?.name === 'NotAllowedError' && /system/i.test(e.message || '')) {
            throw new Error('o sistema não deu permissão de gravação de tela ao navegador (Mac: Ajustes do Sistema → Privacidade e Segurança → Gravação de Tela)');
          }
          if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') return false;
          throw err;
        }
      })();
      try { if (!(await starting)) return null; } finally { starting = null; }
    }
    return frame();
  }

  // ---------------------------------------------------------------- gravar um trecho (vídeo .webm)
  /** @type {{ rec: MediaRecorder, chunks: Blob[], started: number, done: Promise<File | null>, timer: ReturnType<typeof setTimeout> } | null} */
  let recording = null;

  /** Formato que o navegador grava (Chrome/Edge: webm). */
  function recMime() {
    const MR = /** @type {typeof MediaRecorder | undefined} */ (globalThis.MediaRecorder);
    if (!MR) return '';
    return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MR.isTypeSupported?.(t)) || '';
  }

  /**
   * Começa a gravar a janela compartilhada (pede a janela se preciso). Para sozinho em `maxMs`.
   * @param {{ win?: Window, choose?: boolean, maxMs?: number, onStop?: (file: File | null) => void }} [opts]
   * @returns {Promise<boolean>} false = cancelou a escolha da janela
   */
  async function startRecording({ win = window, choose = false, maxMs = 5 * 60_000, onStop } = {}) {
    // já gravando, ou esperando a escolha da janela (segundo clique / atalho repetido): não abre outro gravador
    if (recording || recStarting) return true;
    recStarting = true;
    try { return await begin({ win, choose, maxMs, onStop }); } finally { recStarting = false; }
  }
  let recStarting = false;

  /** @param {{ win: Window, choose: boolean, maxMs: number, onStop?: (file: File | null) => void }} o */
  async function begin({ win, choose, maxMs, onStop }) {
    const mime = recMime();
    if (!mime) throw new Error('este navegador não grava vídeo da tela (use Chrome ou Edge)');
    if (choose || !active()) {
      if (starting) { if (!(await starting)) return false; }
      else {
        starting = start(win).then(() => true, (err) => { if (/** @type {Error} */ (err)?.name === 'NotAllowedError' || /** @type {Error} */ (err)?.name === 'AbortError') return false; throw err; });
        try { if (!(await starting)) return false; } finally { starting = null; }
      }
    }
    const s = /** @type {MediaStream} */ (stream);
    const track = s.getVideoTracks()[0];
    // prints usam 5 quadros/s; o vídeo precisa de mais
    await track?.applyConstraints?.({ frameRate: 15 }).catch(() => {});
    const rec = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    /** @type {Blob[]} */
    const chunks = [];
    rec.addEventListener('dataavailable', (e) => { if (e.data?.size) chunks.push(e.data); });
    const done = new Promise((resolve) => {
      rec.addEventListener('stop', () => {
        // só limpa a PRÓPRIA gravação
        if (recording?.rec === rec) { clearTimeout(recording.timer); recording = null; }
        track?.applyConstraints?.({ frameRate: 5 }).catch(() => {});
        const type = mime.split(';')[0];
        const file = chunks.length ? new File(chunks, `video.${type === 'video/mp4' ? 'mp4' : 'webm'}`, { type }) : null;
        notify();
        onStop?.(file);
        resolve(file);
      }, { once: true });
    });
    rec.start(1000);
    recording = { rec, chunks, started: Date.now(), done: /** @type {Promise<File | null>} */ (done), timer: setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, maxMs) };
    notify();
    return true;
  }

  /** Para a gravação e devolve o vídeo (null se nada foi gravado). @returns {Promise<File | null>} */
  async function stopRecording() {
    const r = recording;
    if (!r) return null;
    if (r.rec.state !== 'inactive') r.rec.stop();
    return r.done;
  }

  return {
    grab,
    stop,
    startRecording,
    stopRecording,
    get recording() { return !!recording; },
    get recordingMs() { return recording ? Date.now() - recording.started : 0; },
    get canRecord() { return !!recMime(); },
    get active() { return active(); },
    get label() { return label; },
  };
}
