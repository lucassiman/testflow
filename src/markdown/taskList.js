// @ts-check
/**
 * Checkboxes estilo GitHub: "- [ ] tarefa" / "- [x] feita".
 * Cada checkbox recebe data-line com a linha de origem, para que o clique
 * no Preview altere somente aquele caractere no Markdown.
 */
const TASK_RE = /^\[([ xX])\][ \t]/;

/** @param {import('markdown-it').MarkdownIt} md */
export function taskListPlugin(md) {
  md.core.ruler.after('inline', 'qa-task-lists', (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      const para = tokens[i - 1];
      const item = tokens[i - 2];
      if (inline.type !== 'inline' || para.type !== 'paragraph_open' || item.type !== 'list_item_open') continue;
      const match = TASK_RE.exec(inline.content);
      if (!match || !inline.children?.length || inline.children[0].type !== 'text') continue;

      const checked = match[1].toLowerCase() === 'x';
      const line = item.map ? item.map[0] : -1;
      const checkbox = new state.Token('html_inline', '', 0);
      inline.children[0].content = inline.children[0].content.replace(TASK_RE, '');
      inline.content = inline.content.replace(TASK_RE, '');
      // rótulo acessível = texto do item (leitores de tela anunciam a tarefa)
      const label = inline.content.replace(/[*_`~[\]]/g, '').trim().slice(0, 120).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
      checkbox.content = `<input type="checkbox" class="task-checkbox" data-line="${line}" aria-label="${label || 'tarefa'}"${checked ? ' checked' : ''}>`;
      inline.children.unshift(checkbox);
      item.attrJoin('class', 'task-list-item');

      // marca a lista pai
      for (let j = i - 3; j >= 0; j--) {
        if (tokens[j].level === item.level - 1 && tokens[j].nesting === 1) {
          tokens[j].attrJoin('class', 'contains-task-list');
          break;
        }
      }
    }
  });
}
