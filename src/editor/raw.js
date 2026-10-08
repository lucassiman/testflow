// @ts-check
/**
 * Modo Raw com CodeMirror 6: numeração de linhas, destaque de Markdown (e do código dos blocos
 * js/ts/json/html/css), status `PASS`/`FAIL` coloridos, várias seleções (Ctrl+clique, Alt+arrastar,
 * Ctrl+D), mover linha (Alt+↑/↓), recolher seções pelo título (▸ na margem), destaque da busca.
 *
 * O resto do editor conversa com o Raw como se fosse um <textarea>: o elemento #raw ganha
 * value / selectionStart / selectionEnd / setSelectionRange / setRangeText / scrollTop… e dispara
 * "input" (com inputType/data) quando o usuário digita. Assim comandos, colar, "/", busca e abas
 * continuam iguais.
 */
import { EditorState, EditorSelection, Annotation, StateEffect, StateField, Prec, RangeSetBuilder } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, Decoration, ViewPlugin, MatchDecorator, placeholder,
} from '@codemirror/view';
import { defaultKeymap, indentMore, indentLess } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import {
  syntaxHighlighting, HighlightStyle, foldGutter, foldKeymap, indentUnit, LanguageDescription, bracketMatching,
} from '@codemirror/language';
import { highlightSelectionMatches, selectNextOccurrence, selectSelectionMatches } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import { statusKind } from '../markdown/qa.ts';
import { detectFrontMatter } from '../markdown/frontmatter.ts';

/** @typedef {import('@codemirror/view').EditorView} View */
/** @typedef {import('@codemirror/view').ViewUpdate} ViewUpdate */
/** @typedef {import('@codemirror/view').DecorationSet} DecorationSet */
/** @typedef {ReturnType<typeof import('../core/store.js').createStore>} Store */

/** Mudança feita pelo próprio editor (não é digitação): não dispara "input". */
const Programmatic = Annotation.define();

// ---------------------------------------------------------------- linguagem e cores
const codeLanguages = [
  LanguageDescription.of({ name: 'JavaScript', alias: ['js', 'jsx', 'mjs', 'cjs', 'javascript'], load: async () => javascript({ jsx: true }) }),
  LanguageDescription.of({ name: 'TypeScript', alias: ['ts', 'tsx', 'typescript'], load: async () => javascript({ typescript: true, jsx: true }) }),
  LanguageDescription.of({ name: 'JSON', alias: ['json', 'jsonc'], load: async () => json() }),
  LanguageDescription.of({ name: 'HTML', alias: ['html', 'xml', 'svg', 'htm'], load: async () => html() }),
  LanguageDescription.of({ name: 'CSS', alias: ['css', 'scss'], load: async () => css() }),
];

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', fontSize: '1.12em', color: 'var(--cm-heading)' },
  { tag: [t.heading2, t.heading3, t.heading4, t.heading5, t.heading6, t.heading], fontWeight: '700', color: 'var(--cm-heading)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--link)' },
  { tag: t.monospace, color: 'var(--cm-code)' },
  { tag: t.quote, color: 'var(--cm-quote)' },
  { tag: [t.processingInstruction, t.contentSeparator, t.labelName], color: 'var(--cm-mark)' },
  { tag: [t.meta, t.comment], color: 'var(--muted)' },
  { tag: t.keyword, color: 'var(--cm-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--cm-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--cm-number)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--cm-prop)' },
  { tag: [t.tagName, t.typeName, t.className], color: 'var(--cm-tag)' },
  { tag: t.invalid, color: 'var(--danger, #cf222e)' },
]);

// `PASS` `FAIL`… com a cor do status
const statusMatcher = new MatchDecorator({
  regexp: /`([^`\n]{2,20})`/g,
  decorate: (add, from, to, m) => {
    const kind = statusKind(m[1]);
    if (kind) add(from, to, Decoration.mark({ class: `cm-status cm-status-${kind}` }));
  },
});
const statusBadges = ViewPlugin.fromClass(class {
  /** @param {View} view */
  constructor(view) { this.decorations = statusMatcher.createDeco(view); }
  /** @param {ViewUpdate} u */
  update(u) { this.decorations = statusMatcher.updateDeco(u, this.decorations); }
}, { decorations: (v) => v.decorations });

// cabeçalho YAML: texto discreto (o Markdown acharia que a última linha antes de --- é um título)
const frontMatterLines = ViewPlugin.fromClass(class {
  /** @param {View} view */
  constructor(view) { this.decorations = this.build(view); }
  /** @param {ViewUpdate} u */
  update(u) { if (u.docChanged) this.decorations = this.build(u.view); }
  /** @param {View} view @returns {DecorationSet} */
  build(view) {
    const doc = view.state.doc;
    const head = doc.sliceString(0, Math.min(doc.length, 20000));
    const fm = detectFrontMatter(head);
    /** @type {RangeSetBuilder<Decoration>} */
    const builder = new RangeSetBuilder();
    if (fm) {
      for (let n = 1; n <= Math.min(fm.end, doc.lines); n++) builder.add(doc.line(n).from, doc.line(n).from, Decoration.line({ class: 'cm-frontmatter' }));
    }
    return builder.finish();
  }
}, { decorations: (v) => v.decorations });

// ocorrências da busca (Ctrl+F): todas destacadas, a atual mais forte
/** @type {import('@codemirror/state').StateEffectType<{ matches: Array<[number, number]>, current: number }>} */
const setFindMarks = StateEffect.define();
/** @type {StateField<import('@codemirror/view').DecorationSet>} */
const findMarks = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setFindMarks)) continue;
      const { matches, current } = e.value;
      const len = tr.state.doc.length;
      deco = Decoration.set(matches.filter(([a, b]) => b <= len && a < b).slice(0, 3000)
        .map(([a, b], i) => Decoration.mark({ class: i === current ? 'cm-find cm-find-current' : 'cm-find' }).range(a, b)), true);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ---------------------------------------------------------------- teclas
// Tab sem seleção insere 2 espaços; com seleção (ou várias linhas) indenta as linhas
/** @type {import('@codemirror/view').KeyBinding[]} */
const tabKeys = [{
  key: 'Tab',
  run: (view) => {
    if (view.state.selection.ranges.every((r) => r.empty)) {
      view.dispatch(view.state.replaceSelection('  '), { userEvent: 'input.type', scrollIntoView: true });
      return true;
    }
    return indentMore(view);
  },
  shift: indentLess,
}];
// teclas que são do editor (Ctrl+I itálico, Ctrl+/ menu…) ficam fora do CodeMirror
const RESERVED = new Set(['Mod-i', 'Mod-/', 'Alt-A', 'Ctrl-m', 'Mod-Enter']);
const baseKeys = defaultKeymap.filter((k) => !RESERVED.has(k.key || '') && !RESERVED.has(k.mac || ''));

// ---------------------------------------------------------------- editor
/**
 * @param {{ host: RawEditorElement, store: Store, placeholderText?: string }} opts
 */
export function createRaw({ host, store, placeholderText = '' }) {
  host.textContent = '';
  host.classList.add('cm-host');

  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: store.source,
      extensions: [
        lineNumbers(),
        foldGutter({ openText: '▾', closedText: '▸' }),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        rectangularSelection(),
        crosshairCursor(),
        bracketMatching(),
        highlightSelectionMatches({ minSelectionLength: 2 }),
        EditorView.lineWrapping,
        indentUnit.of('  '),
        EditorState.tabSize.of(2),
        markdown({ base: markdownLanguage, codeLanguages, completeHTMLTags: false }),
        syntaxHighlighting(highlight),
        statusBadges,
        frontMatterLines,
        findMarks,
        placeholderText ? placeholder(placeholderText) : [],
        Prec.high(keymap.of([
          ...tabKeys,
          { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
          { key: 'Mod-Shift-l', run: selectSelectionMatches, preventDefault: true },
        ])),
        keymap.of([...baseKeys, ...foldKeymap]),
        EditorView.contentAttributes.of({ spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off', 'aria-label': 'Markdown' }),
        // arquivos soltos no Raw (prints, .md) são tratados pelo editor, não viram texto
        EditorView.domEventHandlers({
          drop: (event) => !!event.dataTransfer?.files?.length,
          dragover: (event) => !!event.dataTransfer?.types?.includes('Files'),
        }),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged || u.transactions.some((tr) => tr.annotation(Programmatic))) return;
          // digitação/colar/apagar do usuário → "input" como o de um textarea
          let inputType = 'insertText';
          /** @type {string | null} */
          let data = null;
          const tr = u.transactions.find((x) => x.isUserEvent('input') || x.isUserEvent('delete') || x.isUserEvent('move'));
          if (tr?.isUserEvent('input.paste')) inputType = 'insertFromPaste';
          else if (tr?.isUserEvent('delete')) inputType = 'deleteContentBackward';
          else if (tr?.isUserEvent('input.type')) {
            tr.changes.iterChanges((a, b, c, d, inserted) => { data = inserted.toString(); });
          } else inputType = 'insertReplacementText';
          host.dispatchEvent(new InputEvent('input', { inputType, data }));
        }),
      ],
    }),
  });

  /** @param {import('@codemirror/state').TransactionSpec} spec */
  const programmatic = (spec) => view.dispatch({ ...spec, annotations: Programmatic.of(true) });
  /** @param {unknown} n */
  const clamp = (n) => Math.max(0, Math.min(Number(n) || 0, view.state.doc.length));

  /** @param {string} text */
  function setValue(text) {
    const cur = view.state.doc.toString();
    if (text === cur) return;
    // troca só o trecho que mudou (mantém rolagem, dobras e cursores)
    let a = 0;
    const max = Math.min(cur.length, text.length);
    while (a < max && cur.charCodeAt(a) === text.charCodeAt(a)) a++;
    let b = 0;
    while (b < max - a && cur.charCodeAt(cur.length - 1 - b) === text.charCodeAt(text.length - 1 - b)) b++;
    programmatic({ changes: { from: a, to: cur.length - b, insert: text.slice(a, text.length - b) } });
  }

  // ---- API de textarea no elemento #raw
  Object.defineProperties(host, {
    value: { get: () => view.state.doc.toString(), set: setValue, configurable: true },
    selectionStart: { get: () => view.state.selection.main.from, configurable: true },
    selectionEnd: { get: () => view.state.selection.main.to, configurable: true },
    scrollTop: { get: () => view.scrollDOM.scrollTop, set: (/** @type {number} */ v) => { view.scrollDOM.scrollTop = v; }, configurable: true },
    scrollHeight: { get: () => view.scrollDOM.scrollHeight, configurable: true },
    clientHeight: { get: () => view.scrollDOM.clientHeight, configurable: true },
  });
  host.setSelectionRange = (a, b = a) => programmatic({ selection: EditorSelection.single(clamp(a), clamp(b)) });
  host.setRangeText = (text, from = host.selectionStart, to = host.selectionEnd, mode = 'preserve') => {
    from = clamp(from);
    to = clamp(to);
    const end = from + text.length;
    const sel = mode === 'select' ? EditorSelection.single(from, end)
      : mode === 'start' ? EditorSelection.single(from)
        : mode === 'end' ? EditorSelection.single(end) : undefined;
    programmatic({ changes: { from, to, insert: text }, ...(sel ? { selection: sel } : {}) });
  };
  host.focus = () => view.focus();
  host.blur = () => view.contentDOM.blur();
  /** Coordenadas (tela) do cursor na posição — para abrir menus ali. */
  host.caretCoords = (pos = host.selectionStart) => {
    const c = view.coordsAtPos(clamp(pos)) || view.coordsAtPos(Math.max(0, clamp(pos) - 1));
    if (!c) { const r = host.getBoundingClientRect(); return { x: r.left + 40, y: r.top + 40 }; }
    return { x: c.left, y: c.bottom };
  };
  host.hasFocus = () => view.hasFocus;
  view.scrollDOM.addEventListener('scroll', () => host.dispatchEvent(new Event('scroll')));

  // ---- documento ↔ store
  host.addEventListener('input', () => {
    store.setSource(host.value, { origin: 'raw', kind: 'typing', sel: [host.selectionStart, host.selectionEnd] });
  });

  store.on('change', ({ source, origin, sel }) => {
    if (origin === 'raw') return;
    if (host.value !== source) {
      const keep = [host.selectionStart, host.selectionEnd];
      setValue(source);
      const [a, b] = sel || keep;
      host.setSelectionRange(a, b);
    }
  });

  /**
   * @param {number} pos
   * @param {{ y?: 'start' | 'center' | 'end' | 'nearest', margin?: number }} [opts]
   */
  function scrollTo(pos, { y = 'center', margin = 0 } = {}) {
    programmatic({ effects: EditorView.scrollIntoView(clamp(pos), { y, yMargin: margin }) });
  }

  return {
    view,
    focus() { view.focus(); },
    /** Seleciona [start, end) e rola até lá (sem tirar o foco de quem está digitando na busca). @param {number} start @param {number} end */
    revealRange(start, end) {
      programmatic({ selection: EditorSelection.single(clamp(start), clamp(end)) });
      const line = view.lineBlockAt(clamp(start));
      const top = view.scrollDOM.scrollTop;
      const visible = line.top >= top + 30 && line.bottom <= top + view.scrollDOM.clientHeight - 30;
      if (!visible) scrollTo(start, { y: 'start', margin: view.scrollDOM.clientHeight / 3 });
    },
    /** @param {number} line índice (0) */
    goToLine(line) {
      const n = Math.max(1, Math.min(line + 1, view.state.doc.lines));
      const l = view.state.doc.line(n);
      view.focus();
      programmatic({ selection: EditorSelection.single(l.from, l.to) });
      scrollTo(l.from, { y: 'start', margin: view.scrollDOM.clientHeight / 3 });
    },
    /** Destaque das ocorrências da busca. @param {Array<[number, number]>} [matches] */
    setFindMarks(matches = [], current = -1) {
      programmatic({ effects: setFindMarks.of({ matches, current }) });
    },
  };
}
