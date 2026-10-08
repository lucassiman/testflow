// @ts-check
/**
 * Anotar print antes de salvar a evidência: seta, retângulo, texto e borrar
 * (mosaico — irreversível no arquivo salvo, para esconder dados sensíveis / LGPD).
 *
 * openAnnotator(source, opts) → Promise<Blob | 'skip' | null>
 *   Blob   = imagem anotada (PNG)
 *   'skip' = salvar a imagem original, sem anotação
 *   null   = cancelado
 */
/**
 * Marcação no print (coordenadas em pixels da imagem). Texto e número usam só x1/y1 (o número é o centro do círculo).
 * `size`: multiplicador do tamanho do texto/número (1 = padrão).
 * @typedef {{ tool: string, color: string, x1: number, y1: number, x2: number, y2: number, text?: string, size?: number }} Shape
 * @typedef {{ x: number, y: number, w: number, h: number }} Crop
 * Resultado entregue a `onSave` (para guardar e poder reeditar): marcações, recorte e se há borrão (borrão = dado sensível).
 * @typedef {{ shapes: Shape[], crop: Crop | null, hasBlur: boolean }} AnnotationData
 */

/** @type {Array<[id: string, icon: string, label: string, key: string]>} */
const TOOLS = [
  ['select', '✥', 'Selecionar e mover (V) — Delete apaga · duplo clique no texto edita', 'v'],
  ['arrow', '➚', 'Seta (A)', 'a'],
  ['rect', '▭', 'Retângulo (R)', 'r'],
  ['text', 'T', 'Texto (T)', 't'],
  ['num', '①', 'Numeração de passos: clique onde marcar (N)', 'n'],
  ['mark', '▬', 'Marca-texto translúcido (H)', 'h'],
  ['blur', '▦', 'Borrar dados sensíveis (B)', 'b'],
  ['crop', '⛶', 'Recortar: arraste a área que fica (C)', 'c'],
];
const COLORS = ['#e5243b', '#f5a400', '#1f6feb', '#1a7f37', '#111111'];

/** @param {Blob | string} source @returns {Promise<{ img: HTMLImageElement, url: string, owned: boolean }>} */
function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    img.onload = () => resolve({ img, url, owned: typeof source !== 'string' });
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem'));
    img.src = url;
  });
}

/**
 * Editor de anotação de print. Resolve o Blob anotado, 'skip' (sem anotação) ou null (descartado).
 * @param {Blob | string} source
 * @param {{ title?: string, allowSkip?: boolean, autoOpen?: boolean, onAutoOpenChange?: (on: boolean) => void, type?: string, initialShapes?: Shape[], initialCrop?: Crop | null, onSave?: (data: AnnotationData) => void }} [opts]
 *   `initialShapes`/`initialCrop`: marcações guardadas, para reeditar (a fonte é então a imagem ORIGINAL); `onSave`: chamado ao salvar com os dados para guardar.
 * @returns {Promise<Blob | 'skip' | null>}
 */
export async function openAnnotator(source, { title = 'Anotar print', allowSkip = true, autoOpen = true, onAutoOpenChange, type = 'image/png', initialShapes = [], initialCrop = null, onSave } = {}) {
  const { img, url, owned } = await loadImage(source);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  /** @type {Shape[]} */
  const shapes = initialShapes.map((x) => ({ ...x }));
  /** Recorte: só esta área vai para o arquivo. @type {Crop | null} */
  let crop = initialCrop ? { ...initialCrop } : null;
  /** Tamanho do próximo texto/número (multiplicador) e zoom (1 = ajustado à janela). */
  let curSize = 1;
  let zoom = 1;
  let tool = 'rect';
  let color = COLORS[0];
  /** @type {Shape | null} */
  let drawing = null;
  /** Marcação selecionada (ferramenta Selecionar) e arraste em andamento. @type {Shape | null} */
  let sel = null;
  /** @type {{ px: number, py: number, orig: Shape, moved: boolean } | null} */
  let moving = null;
  /** Texto em edição (para o Esc devolver o original). @type {Shape | null} */
  let editingOrig = null;
  /** @type {HTMLTextAreaElement | null} */
  let textInput = null;
  /** Alça em arraste (redimensionar). @type {{ id: string } | null} */
  let resizing = null;
  /** Estados anteriores (marcações e recorte), para o Ctrl+Z (inclusive mover/apagar/redimensionar). @type {Array<{ shapes: Shape[], crop: Crop | null }>} */
  const history = [];
  function mark() { history.push(JSON.parse(JSON.stringify({ shapes, crop }))); }
  function undo() {
    const prev = history.pop();
    if (!prev) return;
    shapes.splice(0, shapes.length, ...prev.shapes);
    crop = prev.crop;
    sel = null;
    updateUi();
    render();
  }

  const overlay = document.createElement('div');
  overlay.className = 'annot-overlay';
  overlay.innerHTML = `
    <div class="annot-dialog" role="dialog" aria-label="${title}">
      <div class="annot-bar">
        <strong class="annot-title">${title}</strong>
        <span class="annot-tools">${TOOLS.map(([id, icon, label]) => `<button type="button" data-tool="${id}" title="${label}">${icon}</button>`).join('')}</span>
        <span class="annot-colors">${COLORS.map((c) => `<button type="button" data-color="${c}" style="background:${c}" title="Cor"></button>`).join('')}</span>
        <button type="button" data-act="undo" title="Desfazer (Ctrl+Z)">↶</button>
        <span class="annot-size" title="Tamanho do texto e dos números (atalhos [ e ])"><button type="button" data-act="fontdown" title="Texto menor ([)">A−</button><span data-size>100%</span><button type="button" data-act="fontup" title="Texto maior (])">A+</button></span>
        <span class="annot-zoom" title="Zoom (+ e − no teclado, Ctrl+roda do mouse)"><button type="button" data-act="zoomout" title="Reduzir (−)">🔍−</button><span data-zoom>100%</span><button type="button" data-act="zoomin" title="Ampliar (+)">🔍+</button><button type="button" data-act="zoomfit" title="Ajustar à janela (0)">⤢</button></span>
        <button type="button" data-act="dup" title="Duplicar a marcação selecionada (Ctrl+D)">⧉</button>
        <button type="button" data-act="clearcrop" title="Remover o recorte" hidden>✂ sem recorte</button>
        <span class="annot-spacer"></span>
        ${onAutoOpenChange ? `<label class="annot-auto" title="Abrir este editor sempre que colar um print"><input type="checkbox" ${autoOpen ? 'checked' : ''}> abrir ao colar</label>` : ''}
        <button type="button" data-act="cancel" title="Cancelar (Esc)">Cancelar</button>
        ${allowSkip ? '<button type="button" data-act="skip" title="Salvar sem anotação">Sem anotação</button>' : ''}
        <button type="button" data-act="save" class="primary" title="Salvar (Enter)">Salvar</button>
      </div>
      <div class="annot-stage"><canvas></canvas></div>
      <div class="annot-hint">Arraste para desenhar · Texto: clique onde escrever · <b>✥ Selecionar (V)</b>: arraste para mover, <b>alças</b> redimensionam, <b>Delete</b> apaga, <b>Ctrl+D</b> duplica, duplo clique no texto edita · <b>① Numeração</b>, <b>▬ marca-texto</b>, <b>⛶ recorte</b> · <b>A− A+</b> tamanho do texto · <b>🔍</b> zoom · <b>Borrar</b> não pode ser desfeito depois de salvo · Enter salva · Esc cancela</div>
    </div>`;
  document.body.appendChild(overlay);
  const canvas = /** @type {HTMLCanvasElement} */ (overlay.querySelector('canvas'));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  canvas.width = W;
  canvas.height = H;
  const stage = /** @type {HTMLElement} */ (overlay.querySelector('.annot-stage'));

  function fit() {
    const maxW = stage.clientWidth - 16;
    const maxH = stage.clientHeight - 16;
    const scale = Math.min(2, maxW / W, maxH / H) * zoom; // prints pequenos são ampliados para facilitar o desenho
    canvas.style.width = `${Math.round(W * scale)}px`;
    canvas.style.height = `${Math.round(H * scale)}px`;
  }
  requestAnimationFrame(fit);
  window.addEventListener('resize', fit);

  const lineW = Math.max(3, Math.round(Math.max(W, H) / 350));
  const fontPx = Math.max(16, Math.round(Math.max(W, H) / 50));

  /** @param {Shape} s */
  function drawArrow(s) {
    const { x1, y1, x2, y2 } = s;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const head = lineW * 5;
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = lineW; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(ang) * head * 0.8, y2 - Math.sin(ang) * head * 0.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 7), y2 - head * Math.sin(ang - Math.PI / 7));
    ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 7), y2 - head * Math.sin(ang + Math.PI / 7));
    ctx.closePath(); ctx.fill();
  }
  /** @param {Shape} s */
  function norm(s) {
    return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
  }
  /** @param {Shape} s */
  function pixelate(s) {
    const r = norm(s);
    if (r.w < 2 || r.h < 2) return;
    const x = Math.max(0, Math.floor(r.x)); const y = Math.max(0, Math.floor(r.y));
    const w = Math.min(W - x, Math.ceil(r.w)); const h = Math.min(H - y, Math.ceil(r.h));
    if (w <= 0 || h <= 0) return;
    const block = Math.max(8, Math.round(Math.min(w, h) / 6), Math.round(Math.max(W, H) / 120));
    const data = ctx.getImageData(x, y, w, h);
    const d = data.data;
    for (let by = 0; by < h; by += block) {
      for (let bx = 0; bx < w; bx += block) {
        let rr = 0; let gg = 0; let bb = 0; let n = 0;
        for (let yy = by; yy < Math.min(by + block, h); yy++) {
          for (let xx = bx; xx < Math.min(bx + block, w); xx++) {
            const i = (yy * w + xx) * 4; rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++;
          }
        }
        rr /= n; gg /= n; bb /= n;
        for (let yy = by; yy < Math.min(by + block, h); yy++) {
          for (let xx = bx; xx < Math.min(bx + block, w); xx++) {
            const i = (yy * w + xx) * 4; d[i] = rr; d[i + 1] = gg; d[i + 2] = bb;
          }
        }
      }
    }
    ctx.putImageData(data, x, y);
  }
  /** @param {Shape} s */
  function textBox(s) {
    const fs = fontPx * (s.size || 1);
    ctx.font = `600 ${fs}px system-ui, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'top';
    const lines = (s.text || '').split('\n');
    const pad = fs * 0.3;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
    const h = lines.length * fs * 1.25 + pad * 2;
    return { lines, pad, w, h, fs };
  }
  /** @param {Shape} s */
  function drawText(s) {
    const { lines, pad, w, h, fs } = textBox(s);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(s.x1, s.y1, w, h);
    ctx.fillStyle = s.color;
    lines.forEach((l, i) => ctx.fillText(l, s.x1 + pad, s.y1 + pad + i * fs * 1.25));
  }
  /** Raio do círculo numerado. @param {Shape} s */
  const numRadius = (s) => fontPx * 0.75 * (s.size || 1);
  /** @param {Shape} s */
  function drawNum(s) {
    const r = numRadius(s);
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(s.x1, s.y1, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(2, lineW / 1.5); ctx.strokeStyle = '#fff'; ctx.stroke();
    const fs = r * 1.15;
    ctx.font = `700 ${fs}px system-ui, "Segoe UI", sans-serif`;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s.text || '', s.x1, s.y1 + fs * 0.04);
    ctx.textAlign = 'start'; ctx.textBaseline = 'top';
  }
  /** Próximo número da sequência. */
  const nextNum = () => Math.max(0, ...shapes.filter((s) => s.tool === 'num').map((s) => Number(s.text) || 0)) + 1;
  /** Alças de uma marcação (redimensionar): cantos e lados do retângulo, pontas da seta. @param {Shape} s @returns {Array<{ id: string, x: number, y: number }>} */
  function handlesOf(s) {
    if (s.tool === 'arrow') return [{ id: 'p1', x: s.x1, y: s.y1 }, { id: 'p2', x: s.x2, y: s.y2 }];
    if (s.tool !== 'rect' && s.tool !== 'blur' && s.tool !== 'mark') return [];
    const b = norm(s);
    const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; const r = b.x + b.w; const bt = b.y + b.h;
    return [{ id: 'nw', x: b.x, y: b.y }, { id: 'n', x: cx, y: b.y }, { id: 'ne', x: r, y: b.y }, { id: 'e', x: r, y: cy }, { id: 'se', x: r, y: bt }, { id: 's', x: cx, y: bt }, { id: 'sw', x: b.x, y: bt }, { id: 'w', x: b.x, y: cy }];
  }
  /** Tamanho de uma alça em pixels da imagem (constante na tela). */
  const handleSize = () => (9 * W) / (canvas.getBoundingClientRect().width || W);
  /** @param {{ x: number, y: number }} p */
  function handleAt(p) {
    if (!sel || !shapes.includes(sel)) return null;
    const hs = handleSize();
    return handlesOf(sel).find((h) => Math.abs(p.x - h.x) <= hs && Math.abs(p.y - h.y) <= hs) || null;
  }
  /** Caixa que envolve a marcação (para selecionar e destacar). @param {Shape} s */
  function bounds(s) {
    if (s.tool === 'text') { const b = textBox(s); return { x: s.x1, y: s.y1, w: b.w, h: b.h }; }
    if (s.tool === 'num') { const r = numRadius(s); return { x: s.x1 - r, y: s.y1 - r, w: r * 2, h: r * 2 }; }
    return norm(s);
  }
  /** @param {number} px @param {number} py @param {Shape} s */
  function distToSegment(px, py, s) {
    const dx = s.x2 - s.x1; const dy = s.y2 - s.y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / len2)) : 0;
    return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
  }
  /** Marcação sob o ponto (a de cima primeiro). @param {{ x: number, y: number }} p @returns {Shape | null} */
  function hitTest(p) {
    const r = canvas.getBoundingClientRect();
    const tol = Math.max(lineW * 2, (10 * W) / (r.width || W));
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.tool === 'arrow') {
        if (distToSegment(p.x, p.y, s) <= tol) return s;
        continue;
      }
      const b = bounds(s);
      const inside = p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
      if (s.tool === 'num') { if (Math.hypot(p.x - s.x1, p.y - s.y1) <= numRadius(s) + tol / 2) return s; continue; }
      if (s.tool === 'text' || s.tool === 'blur' || s.tool === 'mark') { if (inside) return s; continue; }
      // retângulo: só a borda (o miolo deixa passar o clique para o que está embaixo)
      const near = p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol;
      const core = p.x > b.x + tol && p.x < b.x + b.w - tol && p.y > b.y + tol && p.y < b.y + b.h - tol;
      if (near && !core) return s;
    }
    return null;
  }

  /** Desenha tudo; showSelection=false ao gerar o arquivo final (sem o contorno de seleção). @param {boolean} [showSelection] */
  function render(showSelection = true) {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0);
    const all = drawing ? [...shapes, drawing] : shapes;
    // borrões primeiro (sobre a imagem), depois as marcações por cima
    all.filter((s) => s.tool === 'blur').forEach(pixelate);
    // marca-texto translúcido: sob as demais marcações
    for (const s of all) {
      if (s.tool !== 'mark') continue;
      const r = norm(s);
      ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = s.color; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore();
    }
    for (const s of all) {
      if (s.tool === 'rect') {
        const r = norm(s);
        ctx.strokeStyle = s.color; ctx.lineWidth = lineW; ctx.strokeRect(r.x, r.y, r.w, r.h);
      } else if (s.tool === 'arrow') {
        if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 4) drawArrow(s);
      } else if (s.tool === 'text') {
        drawText(s);
      } else if (s.tool === 'num') {
        drawNum(s);
      } else if ((s.tool === 'blur' || s.tool === 'crop') && s === drawing) {
        const r = norm(s);
        ctx.setLineDash([lineW * 2, lineW * 2]); ctx.strokeStyle = '#666'; ctx.lineWidth = Math.max(1, lineW / 2);
        ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
      }
    }
    if (showSelection && crop) {
      // escurece o que fica de fora do recorte
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, crop.y);
      ctx.fillRect(0, crop.y + crop.h, W, H - crop.y - crop.h);
      ctx.fillRect(0, crop.y, crop.x, crop.h);
      ctx.fillRect(crop.x + crop.w, crop.y, W - crop.x - crop.w, crop.h);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, lineW / 1.5); ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
      ctx.restore();
    }
    if (showSelection && sel && shapes.includes(sel)) {
      const b = bounds(sel);
      const m = lineW * 1.5;
      ctx.save();
      ctx.setLineDash([lineW * 2, lineW * 1.5]); ctx.strokeStyle = '#1f6feb'; ctx.lineWidth = Math.max(2, lineW / 1.5);
      ctx.strokeRect(b.x - m, b.y - m, b.w + m * 2, b.h + m * 2);
      ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.lineWidth = Math.max(2, lineW / 1.5);
      const hs = handleSize();
      for (const h of handlesOf(sel)) { ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs); ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs); }
      ctx.restore();
    }
  }
  render();

  /** Mostra/esconde o que depende do estado (recorte, tamanho, zoom). */
  function updateUi() {
    const q = (/** @type {string} */ k) => /** @type {HTMLElement | null} */ (overlay.querySelector(k));
    const clear = q('[data-act="clearcrop"]'); if (clear) clear.hidden = !crop;
    const size = q('[data-size]'); if (size) size.textContent = `${Math.round(((sel && (sel.tool === 'text' || sel.tool === 'num') ? sel.size : curSize) || 1) * 100)}%`;
    const z = q('[data-zoom]'); if (z) z.textContent = `${Math.round(zoom * 100)}%`;
  }
  /** @param {string} d */
  function changeSize(d) {
    const step = d === 'up' ? 0.25 : -0.25;
    if (sel && (sel.tool === 'text' || sel.tool === 'num')) { mark(); sel.size = Math.max(0.5, Math.min(4, (sel.size || 1) + step)); }
    else curSize = Math.max(0.5, Math.min(4, curSize + step));
    updateUi();
    render();
  }
  /** @param {number} f */
  function setZoom(f) { zoom = f ? Math.max(0.25, Math.min(6, zoom * f)) : 1; fit(); updateUi(); }
  /** @param {string} t */
  function setTool(t) {
    tool = t;
    if (t !== 'select') sel = null;
    finishText();
    overlay.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', /** @type {HTMLElement} */ (b).dataset.tool === t));
    canvas.style.cursor = t === 'text' ? 'text' : t === 'select' ? 'default' : 'crosshair';
    updateUi();
    render();
  }
  /** @param {string} c */
  function setColor(c) {
    color = c;
    overlay.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('active', /** @type {HTMLElement} */ (b).dataset.color === c));
  }
  setTool(tool);
  setColor(color);

  /** @param {MouseEvent} event */
  function point(event) {
    const r = canvas.getBoundingClientRect();
    return { x: ((event.clientX - r.left) / r.width) * W, y: ((event.clientY - r.top) / r.height) * H };
  }

  /**
   * Abre a caixa de texto. Com `existing`, edita um texto já confirmado (ele sai da lista enquanto se edita;
   * Esc devolve o original, apagar todo o texto remove a marcação).
   * @param {{ x: number, y: number }} p @param {MouseEvent} event @param {Shape} [existing]
   */
  function placeText(p, event, existing) {
    finishText();
    if (existing) {
      mark();
      editingOrig = existing;
      const i = shapes.indexOf(existing);
      if (i >= 0) shapes.splice(i, 1);
      sel = null;
      render();
    }
    const input = document.createElement('textarea');
    textInput = input;
    input.className = 'annot-text-input';
    input.rows = existing ? Math.max(1, (existing.text || '').split('\n').length) : 1;
    input.placeholder = 'Texto… (Enter confirma)';
    input.value = existing?.text || '';
    const r = stage.getBoundingClientRect();
    if (existing) {
      // posição na tela do canto da marcação (o canvas pode estar ampliado/reduzido)
      const cr = canvas.getBoundingClientRect();
      input.style.left = `${cr.left - r.left + stage.scrollLeft + (existing.x1 / W) * cr.width}px`;
      input.style.top = `${cr.top - r.top + stage.scrollTop + (existing.y1 / H) * cr.height}px`;
    } else {
      input.style.left = `${event.clientX - r.left + stage.scrollLeft}px`;
      input.style.top = `${event.clientY - r.top + stage.scrollTop}px`;
    }
    const c = existing?.color || color;
    input.style.color = c;
    input.dataset.x = String(existing ? existing.x1 : p.x);
    input.dataset.y = String(existing ? existing.y1 : p.y);
    input.dataset.color = c;
    stage.appendChild(input);
    // o campo cresce com o texto (altura e largura) em vez de mostrar barra de rolagem
    const autosize = () => {
      const longest = Math.max(...input.value.split('\n').map((l) => l.length), 12);
      input.style.width = `${Math.min(Math.max(210, longest * 9.5 + 24), Math.max(210, stage.clientWidth - parseFloat(input.style.left || '0') - 16))}px`;
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight + 2}px`;
    };
    input.addEventListener('input', autosize);
    autosize();
    setTimeout(() => { textInput?.focus(); textInput?.select(); autosize(); }, 0);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); finishText(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.value = editingOrig?.text ?? ''; finishText(); }
    });
    input.addEventListener('blur', () => setTimeout(finishText, 0));
  }
  function finishText() {
    if (!textInput) return;
    const t = textInput.value.trim();
    const x1 = Number(textInput.dataset.x);
    const y1 = Number(textInput.dataset.y);
    const wasEdit = !!editingOrig;
    if (t) {
      if (!wasEdit) mark();
      /** @type {Shape} */
      const s = { tool: 'text', text: t, x1, y1, x2: x1, y2: y1, color: textInput.dataset.color || color, size: editingOrig?.size ?? curSize };
      shapes.push(s);
      if (tool === 'select') sel = s;
    }
    // edição que não mudou nada não deve poluir o Ctrl+Z
    if (wasEdit && t && t === editingOrig?.text) history.pop();
    editingOrig = null;
    textInput.remove();
    textInput = null;
    render();
  }

  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const p = point(event);
    if (tool === 'select') {
      event.preventDefault();
      finishText();
      const handle = handleAt(p);
      if (handle && sel) {
        // retângulo: deixa x1/y1 como canto de cima-esquerda para as alças trabalharem em cima disso
        if (sel.tool !== 'arrow') { const b = norm(sel); sel.x1 = b.x; sel.y1 = b.y; sel.x2 = b.x + b.w; sel.y2 = b.y + b.h; }
        resizing = { id: handle.id };
        resizeMarked = false;
        return;
      }
      sel = hitTest(p);
      if (sel) moving = { px: p.x, py: p.y, orig: { ...sel }, moved: false };
      updateUi();
      render();
      return;
    }
    if (tool === 'num') {
      event.preventDefault();
      finishText();
      mark();
      shapes.push({ tool: 'num', color, x1: p.x, y1: p.y, x2: p.x, y2: p.y, text: String(nextNum()), size: curSize });
      render();
      return;
    }
    if (tool === 'text') {
      event.preventDefault();
      const hit = hitTest(p);
      placeText(p, event, hit && hit.tool === 'text' ? hit : undefined); // clicar num texto existente edita
      return;
    }
    finishText();
    drawing = { tool, color, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  });
  canvas.addEventListener('dblclick', (event) => {
    const p = point(event);
    const hit = hitTest(p);
    if (hit && hit.tool === 'text') { event.preventDefault(); placeText(p, event, hit); }
  });
  let resizeMarked = false;
  canvas.addEventListener('mousemove', (event) => {
    if (tool !== 'select' || moving || drawing || resizing) return;
    const p = point(event);
    canvas.style.cursor = handleAt(p) ? 'nwse-resize' : hitTest(p) ? 'move' : 'default';
  });
  // Ctrl+roda do mouse = zoom
  stage.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom(event.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  /** @param {MouseEvent} event */
  function onMove(event) {
    const p = point(event);
    if (resizing && sel) {
      if (!resizeMarked) { resizeMarked = true; mark(); }
      const x = Math.max(0, Math.min(W, p.x));
      const y = Math.max(0, Math.min(H, p.y));
      const id = resizing.id;
      if (id === 'p1') { sel.x1 = x; sel.y1 = y; }
      else if (id === 'p2') { sel.x2 = x; sel.y2 = y; }
      else {
        if (id.includes('w')) sel.x1 = x;
        if (id.includes('e')) sel.x2 = x;
        if (id.includes('n')) sel.y1 = y;
        if (id.includes('s')) sel.y2 = y;
      }
      render();
      return;
    }
    if (moving && sel) {
      const dx = p.x - moving.px;
      const dy = p.y - moving.py;
      if (!moving.moved && Math.hypot(dx, dy) < 3) return;
      if (!moving.moved) { moving.moved = true; mark(); } // estado de antes de mover, para o Ctrl+Z
      const o = moving.orig;
      sel.x1 = o.x1 + dx; sel.y1 = o.y1 + dy; sel.x2 = o.x2 + dx; sel.y2 = o.y2 + dy;
      render();
      return;
    }
    if (!drawing) return;
    drawing.x2 = Math.max(0, Math.min(W, p.x));
    drawing.y2 = Math.max(0, Math.min(H, p.y));
    render();
  }
  function onUp() {
    if (resizing) {
      resizing = null;
      // alça arrastada por cima do lado oposto: volta x1<x2 e y1<y2 (retângulos)
      if (sel && sel.tool !== 'arrow') { const b = norm(sel); sel.x1 = b.x; sel.y1 = b.y; sel.x2 = b.x + b.w; sel.y2 = b.y + b.h; }
      render();
      return;
    }
    if (moving) { moving = null; render(); return; }
    if (!drawing) return;
    const s = drawing;
    drawing = null;
    if (s.tool === 'crop') {
      const r = norm(s);
      if (r.w > 12 && r.h > 12) { mark(); crop = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }; updateUi(); }
      render();
      return;
    }
    if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 4) { mark(); shapes.push(s); }
    render();
  }
  function duplicateSelected() {
    if (!sel || !shapes.includes(sel)) return;
    const off = Math.max(14, Math.round(W / 60));
    mark();
    const copy = { ...sel, x1: sel.x1 + off, y1: sel.y1 + off, x2: sel.x2 + off, y2: sel.y2 + off };
    if (copy.tool === 'num') copy.text = String(nextNum()); // a cópia de um número segue a sequência
    shapes.push(copy);
    sel = copy;
    render();
  }
  function deleteSelected() {
    if (!sel) return;
    const i = shapes.indexOf(sel);
    if (i < 0) return;
    mark();
    shapes.splice(i, 1);
    sel = null;
    render();
  }

  return new Promise((resolve) => {
    /** @param {Blob | 'skip' | null} result */
    function close(result) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('resize', fit);
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (owned) URL.revokeObjectURL(url);
      resolve(result);
    }
    function save() {
      finishText();
      if (!shapes.length && !crop) { close(allowSkip ? 'skip' : null); return; }
      sel = null;
      render(false); // sem o contorno de seleção nem o escurecimento do recorte
      onSave?.({ shapes: JSON.parse(JSON.stringify(shapes)), crop: crop ? { ...crop } : null, hasBlur: shapes.some((x) => x.tool === 'blur') });
      if (crop) {
        const out = document.createElement('canvas');
        out.width = crop.w; out.height = crop.h;
        /** @type {CanvasRenderingContext2D} */ (out.getContext('2d')).drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
        out.toBlob((blob) => close(blob), type, 0.92);
        return;
      }
      canvas.toBlob((blob) => close(blob), type, 0.92);
    }
    /** @param {KeyboardEvent} event */
    function onKey(event) {
      if (textInput && document.activeElement === textInput) return;
      const k = event.key.toLowerCase();
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(null); return; }
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); save(); return; }
      if ((event.ctrlKey || event.metaKey) && k === 'z') { event.preventDefault(); event.stopPropagation(); undo(); return; }
      if ((event.ctrlKey || event.metaKey) && k === 'd') { event.preventDefault(); event.stopPropagation(); duplicateSelected(); return; }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === '[') { event.preventDefault(); event.stopPropagation(); changeSize('down'); return; }
        if (event.key === ']') { event.preventDefault(); event.stopPropagation(); changeSize('up'); return; }
        if (event.key === '+' || event.key === '=') { event.preventDefault(); event.stopPropagation(); setZoom(1.25); return; }
        if (event.key === '-') { event.preventDefault(); event.stopPropagation(); setZoom(0.8); return; }
        if (event.key === '0') { event.preventDefault(); event.stopPropagation(); setZoom(0); return; }
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && sel) { event.preventDefault(); event.stopPropagation(); deleteSelected(); return; }
      if (sel && event.key.startsWith('Arrow') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // setas movem a marcação selecionada (Shift = passo maior)
        event.preventDefault(); event.stopPropagation();
        const step = (event.shiftKey ? 10 : 1) * Math.max(1, Math.round(W / 800));
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        mark();
        sel.x1 += dx; sel.x2 += dx; sel.y1 += dy; sel.y2 += dy;
        render();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const t = TOOLS.find((x) => x[3] === k);
      if (t) { event.preventDefault(); event.stopPropagation(); setTool(t[0]); }
    }
    window.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (event) => {
      const b = /** @type {HTMLElement} */ (event.target).closest('button');
      if (!b) return;
      if (b.dataset.tool) setTool(b.dataset.tool);
      else if (b.dataset.color) {
        setColor(b.dataset.color);
        if (sel && sel.tool !== 'blur' && sel.color !== b.dataset.color) { mark(); sel.color = b.dataset.color; render(); } // recolore a marcação selecionada
      }
      else if (b.dataset.act === 'undo') undo();
      else if (b.dataset.act === 'fontup') changeSize('up');
      else if (b.dataset.act === 'fontdown') changeSize('down');
      else if (b.dataset.act === 'zoomin') setZoom(1.25);
      else if (b.dataset.act === 'zoomout') setZoom(0.8);
      else if (b.dataset.act === 'zoomfit') setZoom(0);
      else if (b.dataset.act === 'dup') duplicateSelected();
      else if (b.dataset.act === 'clearcrop') { mark(); crop = null; updateUi(); render(); }
      else if (b.dataset.act === 'cancel') close(null);
      else if (b.dataset.act === 'skip') close('skip');
      else if (b.dataset.act === 'save') save();
    });
    overlay.querySelector('.annot-auto input')?.addEventListener('change', (e) => onAutoOpenChange?.(/** @type {HTMLInputElement} */ (e.target).checked));
  });
}
