// @ts-check
/** Dicas de primeira vez: os textos e quando cada uma aparece (o balão em si é ui/tips.js). */
import { app } from './context.js';
import { els, tips } from './shared.js';

/** @type {Record<string, { title: string, html: string }>} */
export const TIPS = {
  session: {
    title: 'Sessão exploratória',
    html: 'Escreva a nota e aperte <kbd>Enter</kbd>. Prints colados (<kbd>Ctrl+V</kbd>, 📷 ou 📸) ficam <b>presos à próxima nota</b> — a faixa amarela mostra quantos estão esperando. Ao encerrar, o que estiver pendente é gravado.',
  },
  exec: {
    title: 'Execução passo a passo',
    html: '<kbd>1</kbd>–<kbd>5</kbd> marcam PASS · FAIL · BLOCKED · SKIP · PENDING e já vão para o próximo passo; <kbd>←</kbd> <kbd>→</kbd> trocam de passo. <kbd>Ctrl+V</kbd> ou 📸 põem o print no passo. <b>⧉ Flutuar</b> deixa o painel por cima do sistema testado.',
  },
  preview: {
    title: 'Editar no Preview',
    html: 'Clique num bloco para editar. <kbd>/</kbd> abre o menu: blocos, modelos, <b>bug ligado a este documento</b> e prints de outros documentos. <kbd>Alt</kbd>+clique vai para a linha no Markdown.',
  },
  status: {
    title: 'Status clicável',
    html: 'Clique no status de um passo para marcar PASS, FAIL… — no seletor, <kbd>1</kbd>–<kbd>5</kbd> marcam e já descem para o próximo. O resumo e o status geral se atualizam sozinhos.',
  },
  tree: {
    title: 'Organizar a pasta',
    html: 'Arraste documentos (e pastas) para mover — prints e links vão junto. <kbd>F2</kbd> renomeia, <kbd>Delete</kbd> move para a lixeira, clique direito (ou ⋯) mostra o resto. Tudo tem <b>Desfazer</b>.',
  },
  print: {
    title: 'Prints',
    html: 'Os prints vão para <b>evidencias/</b> ao lado do documento (a pasta aparece aqui no rodapé). Passe o mouse num print: ✎ anota. Em outro documento, <kbd>/</kbd> → <i>Reaproveitar print</i> usa o mesmo arquivo.',
  },
};

/** @param {string} id @param {Element | null | undefined} anchor @param {'auto' | 'left' | 'right'} [side] */
function show(id, anchor, side = 'auto') {
  const t = TIPS[id];
  return !!t && tips.show(id, /** @type {HTMLElement | null} */ (anchor), t.html, { title: t.title, side });
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let previewTimer;
/** Depois de desenhar o Preview: status clicável (se houver tabela de passos) ou a dica do "/". */
export function hintAfterRender() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    if (app.mode === 'raw' || app.runner?.mode || app.preview.editing || !app.store.source.trim()) return;
    if (document.querySelector('.app-dialog-overlay, .review-overlay:not([hidden]), .annot-overlay, .whatsnew')) return;
    const cell = els.preview.querySelector('td.status-cell');
    if (cell && !tips.wasSeen('status') && show('status', cell)) return;
    const block = els.preview.querySelector(':scope > .md-block:not(.type-frontmatter)');
    show('preview', block);
  }, 1500);
}

/** Painel de execução/sessão abriu (ou mudou). */
export function hintRunner() {
  const r = app.runner;
  if (!r?.mode || r.floating) return;
  setTimeout(() => {
    if (r.mode === 'session') show('session', document.querySelector('.runner'), 'left');
    else if (r.mode === 'exec') show('exec', document.querySelector('.runner'), 'left');
  }, 300);
}

/** Árvore de arquivos desenhada com documentos. */
export function hintTree() {
  setTimeout(() => {
    if (els.sidebar.hidden) return;
    show('tree', document.querySelector('.side-tree .side-file'), 'right');
  }, 800);
}

/** Primeiro print salvo. */
export function hintPrint() {
  setTimeout(() => show('print', els.folderStatus), 2600);
}
