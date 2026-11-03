// Gera a skill do Claude "qa-markdown" a partir da introdução (scripts/skill-intro.md), da seção 8 das convenções
// (CONVENCOES-QA.md — uma fonte só para o qa_convencoes e a skill), dos MESMOS modelos usados pelo editor
// (src/templates/*.md) e do guia de teste (GUIA-DE-TESTE.md, arquivo de referência lido sob demanda).
// Uso: npm run skill   →  claude-skill/qa-markdown/SKILL.md  +  claude-skill/qa-markdown.zip
//                       claude-skill/qa-varredura/SKILL.md +  claude-skill/qa-varredura.zip
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
  // 1.80.0: os modelos do time (o tipo vem do cabeçalho; o nome do modelo é o que o qa_criar recebe)
  ['revisao-de-requisito', 'Revisão de requisito (REV-)'],
  ['registro-de-riscos', 'Registro de riscos (RSK-)'],
  ['resumo-do-periodo', 'Resumo do período (RES-)'],
  ['retrospectiva', 'Retrospectiva (RET-)'],
  ['estrategia-de-teste', 'Estratégia de teste (EST-, em `processos/`)'],
];

/** O corpo da seção 8 das convenções (nível, tipo, profundidade e técnicas), no lugar da marca <!-- convencoes:8 -->. */
const conv = read('CONVENCOES-QA.md');
const sec8 = /^## 8\. .*\n([\s\S]*?)(?=^## \d|(?![\s\S]))/m.exec(conv)?.[1]?.trim();
if (!sec8) throw new Error('CONVENCOES-QA.md sem a seção 8');
const intro = read('scripts/skill-intro.md');
if (!intro.includes('<!-- convencoes:8 -->')) throw new Error('skill-intro.md sem a marca <!-- convencoes:8 -->');
let skill = intro.replace('<!-- convencoes:8 -->', () => sec8).trimEnd();
for (const [key, label] of ORDER) {
  const tpl = read(`src/templates/${key}.md`).trimEnd(); // resumo automático fica vazio: o editor calcula
  const fence = tpl.includes('```') ? '````' : '```';
  const tipo = /^tipo:\s*(.+)$/m.exec(tpl)?.[1]?.trim() || key;
  skill += `\n\n### ${label} (\`tipo: ${tipo}\`${tipo === key ? '' : `, modelo \`${key}\``})\n\n${fence}markdown\n${tpl}\n${fence}`;
}
skill += '\n';

mkdirSync(new URL('claude-skill/qa-markdown/', root), { recursive: true });
writeFileSync(new URL('claude-skill/qa-markdown/SKILL.md', root), skill);

const guia = read('GUIA-DE-TESTE.md');
writeFileSync(new URL('claude-skill/qa-markdown/guia-de-teste.md', root), guia);
writeFileSync(new URL('claude-skill/qa-markdown.zip', root), zip([['qa-markdown/SKILL.md', skill], ['qa-markdown/guia-de-teste.md', guia]]));
console.log(`Skill gerada: claude-skill/qa-markdown/SKILL.md (${skill.length} caracteres) + claude-skill/qa-markdown.zip`);

// skill de varredura dos vínculos (documentos antigos)
const sweep = `${read('scripts/skill-varredura.md').trimEnd()}\n`;
mkdirSync(new URL('claude-skill/qa-varredura/', root), { recursive: true });
writeFileSync(new URL('claude-skill/qa-varredura/SKILL.md', root), sweep);
writeFileSync(new URL('claude-skill/qa-varredura.zip', root), zip([['qa-varredura/SKILL.md', sweep]]));
console.log(`Skill gerada: claude-skill/qa-varredura/SKILL.md (${sweep.length} caracteres) + claude-skill/qa-varredura.zip`);
