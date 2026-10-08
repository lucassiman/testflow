// @ts-check
/** Comandos de formatação (toolbar, atalhos) no Raw e no Preview, e inserir bloco depois do bloco ativo. */
import { app } from './context.js';
import { TEMPLATES, askUrl, codeBlock, rawCommand, transformLines, visualCommand } from '../editor/commands.js';
import { loadPrefs, savePrefs } from '../io/drafts.js';
import { els } from './shared.js';

export const INLINE_CMDS = new Set(['bold', 'italic', 'strike', 'code', 'link', 'color', 'size', 'status']);
export const BLOCK_CMDS = new Set(['h1', 'h2', 'h3', 'ul', 'ol', 'task', 'quote', 'alert']);
export const INSERT_CMDS = new Set(['codeblock', 'table', 'mermaid', 'image']);

/** @type {Record<string, string | ((type: string) => string)>} */
export const NEW_BLOCK_TEXT = {
  h1: '# Título', h2: '## Título', h3: '### Título',
  ul: '- Item', ol: '1. Item', task: '- [ ] Tarefa', quote: '> Texto',
  alert: (/** @type {string} */ type) => `> [!${type}]\n> Texto`,
};

/**
 * Insere um bloco depois do bloco ativo (ou no fim). Retorna a linha onde ele começa.
 * @param {string} block @param {{ silent?: boolean }} [opts]
 */
export function insertBlockAfterActive(block, { silent = false } = {}) {
  app.preview.commit();
  const lines = app.store.source.split('\n');
  const at = app.preview.activeBlock ? app.preview.activeBlock.end : lines.length;
  while (lines.length && at >= lines.length && lines[lines.length - 1] === '') lines.pop();
  const pos = Math.min(at, lines.length);
  const insertion = ['', ...block.split('\n')];
  if (pos < lines.length && lines[pos] !== '') insertion.push('');
  if (pos > 0 && lines[pos - 1] === '') insertion.shift();
  const startLine = pos + insertion.indexOf(block.split('\n')[0]);
  lines.splice(pos, 0, ...insertion);
  app.store.setSource(lines.join('\n'), { origin: 'command' });
  if (!silent) app.preview.scrollToLine(startLine);
  return startLine;
}

/** @param {string} cmd @param {string} [value] @param {'raw' | 'preview'} [forcedWhere] */
export function formatCommand(cmd, value, forcedWhere) {
  const where = forcedWhere || app.target();
  app.store.history.breakGroup();
  // bloco de código: sem linguagem escolhida usa a última (menu Código ▾ lembra)
  if (cmd === 'codeblock') {
    if (value === undefined || value === null) value = loadPrefs().codeLang || '';
    else savePrefs({ codeLang: value });
  }

  // bloco sendo editado como Markdown dentro do Preview → trata como Raw local
  const blockTa = app.preview.rawBlockTextarea();
  if (where === 'preview' && blockTa && (INLINE_CMDS.has(cmd) || BLOCK_CMDS.has(cmd))) {
    rawCommand(blockTa, cmd, value, { setSource: () => blockTa.dispatchEvent(new Event('input')) });
    return;
  }

  if (where === 'raw') {
    rawCommand(els.raw, cmd, value, {
      setSource: (text, sel) => app.store.setSource(text, { origin: 'raw', kind: 'edit', sel }),
    });
    return;
  }

  // ---- Preview
  if (INLINE_CMDS.has(cmd)) {
    const content = app.preview.editableContent();
    if (!content) { app.toast('Clique em um texto do Preview (ou selecione-o) antes de formatar.'); return; }
    const res = visualCommand(content, cmd, value);
    if (typeof res === 'string') app.toast(res);
    return;
  }
  if (BLOCK_CMDS.has(cmd)) {
    app.preview.commit();
    const block = app.preview.activeBlock;
    // sem bloco, ou o bloco novo ainda vazio (o "+" / duplo clique; ao aplicar ele é descartado e sobra só a posição):
    // cria o bloco do tipo pedido ali, já em edição — nunca transforma a linha em branco que separa os blocos
    if (!block || block.start >= block.end) {
      // nenhum bloco escolhido: cria um novo, já em edição, com o texto selecionado para digitar por cima
      const make = NEW_BLOCK_TEXT[cmd];
      const text = typeof make === 'function' ? make(value || '') : make;
      const line = insertBlockAfterActive(text, { silent: true });
      app.preview.editAtLine(line);
      return;
    }
    const next = transformLines(app.store.source, block.start, block.end, cmd === 'alert' ? `alert:${value}` : cmd);
    app.store.setSource(next, { origin: 'command' });
    return;
  }
  if (cmd === 'codeblock') {
    // blocos selecionados → viram um bloco de código (ex.: log colado que virou texto formatado)
    const range = app.blockSelect?.range;
    if (range) {
      const lines = app.store.source.split('\n');
      lines.splice(range.start, range.end - range.start, ...codeBlock(value, lines.slice(range.start, range.end).join('\n')).split('\n'));
      app.blockSelect?.clear();
      app.store.setSource(lines.join('\n'), { origin: 'command' });
      app.toast('Blocos convertidos em bloco de código — Ctrl+Z desfaz');
      return;
    }
    // novo bloco vazio, já aberto para colar/digitar
    const line = insertBlockAfterActive(codeBlock(value, ''), { silent: true });
    app.preview.editRawAtLine(line, 1);
    return;
  }
  if (INSERT_CMDS.has(cmd)) {
    if (cmd === 'image') {
      askUrl('image').then((url) => { if (url) insertBlockAfterActive(`![evidência](${url.trim()})`); });
      return;
    }
    insertBlockAfterActive(TEMPLATES[cmd]);
    app.toast('Bloco inserido — clique nele para editar.');
  }
}
