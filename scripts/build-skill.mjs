// Gera a skill do Claude "qa-markdown" a partir da introdução (scripts/skill-intro.md)
// e dos MESMOS modelos usados pelo editor (src/templates/*.md).
// Uso: npm run skill   →  claude-skill/qa-markdown/SKILL.md  +  claude-skill/qa-markdown.zip
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { zip } from './zip.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8').replace(/\r\n?/g, '\n');

const ORDER = [
  ['caso-de-teste', 'Caso de teste'],
  ['bug', 'Bug'],
  ['relatorio-execucao', 'Relatório de execução'],
  ['cenario-bdd', 'Cenários BDD'],
  ['plano-de-teste', 'Plano de teste'],
  ['charter-exploratorio', 'Sessão exploratória'],
  ['checklist', 'Checklist'],
  ['resumo-testes', 'Resumo de testes'],
  ['epico', 'Épico'],
  ['historia', 'História de usuário'],
];

let skill = read('scripts/skill-intro.md').trimEnd();
for (const [key, label] of ORDER) {
  const tpl = read(`src/templates/${key}.md`).trimEnd(); // resumo automático fica vazio: o editor calcula
  const fence = tpl.includes('```') ? '````' : '```';
  skill += `\n\n### ${label} (\`tipo: ${key}\`)\n\n${fence}markdown\n${tpl}\n${fence}`;
}
skill += '\n';

mkdirSync(new URL('claude-skill/qa-markdown/', root), { recursive: true });
writeFileSync(new URL('claude-skill/qa-markdown/SKILL.md', root), skill);

writeFileSync(new URL('claude-skill/qa-markdown.zip', root), zip([['qa-markdown/SKILL.md', skill]]));
console.log(`Skill gerada: claude-skill/qa-markdown/SKILL.md (${skill.length} caracteres) + claude-skill/qa-markdown.zip`);
