// Empacota o servidor MCP local num arquivo só (sem node_modules) e na extensão do Claude desktop (.mcpb).
// Uso: npm run mcp:build
//   → mcp-dist/qa-mcp.mjs          (node qa-mcp.mjs "C:\pasta\de\trabalho")
//   → mcp-dist/testflow.mcpb    (Claude desktop: Configurações → Extensões → instalar; escolhe a pasta)
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { zip } from './zip.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8').replace(/\r\n?/g, '\n');
const pkg = JSON.parse(read('package.json'));

const templates = Object.fromEntries(readdirSync(new URL('src/templates/', root)).filter((f) => f.endsWith('.md')).map((f) => [f.replace(/\.md$/, ''), read(`src/templates/${f}`)]));
const out = new URL('mcp-dist/', root);
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [fileURLToPath(new URL('mcp/main.ts', root))],
  outfile: fileURLToPath(new URL('mcp-dist/qa-mcp.mjs', root)),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  // dependências CommonJS dentro do pacote ESM
  banner: { js: "import { createRequire as __qaRequire } from 'node:module'; const require = __qaRequire(import.meta.url);" },
  define: {
    __QA_TEMPLATES__: JSON.stringify(templates),
    __QA_CONVENCOES__: JSON.stringify(read('CONVENCOES-QA.md')),
    __QA_VERSION__: JSON.stringify(pkg.version),
  },
  logLevel: 'warning',
});
const bundle = readFileSync(new URL('mcp-dist/qa-mcp.mjs', root));

const TOOLS = [
  ['qa_visao_geral', 'Resumo da pasta de trabalho de QA'],
  ['qa_convencoes', 'Regras do formato QA-MD'],
  ['qa_listar', 'Listar documentos com filtros'],
  ['qa_consultar', 'Consultar como as visões do app'],
  ['qa_buscar', 'Buscar texto em todos os documentos'],
  ['qa_ler', 'Ler um documento (cabeçalho, execução, texto)'],
  ['qa_resumo_execucao', 'Falhas e resumo da execução'],
  ['qa_ver_evidencia', 'Ver um print do documento'],
  ['qa_versoes', 'Histórico de versões de um documento'],
  ['qa_criar', 'Criar documento a partir do modelo'],
  ['qa_bug_do_caso', 'Criar bug ligado a partir do passo que falhou'],
  ['qa_marcar_passos', 'Marcar status/obtido dos passos'],
  ['qa_nova_rodada', 'Arquivar a rodada e limpar os passos'],
  ['qa_aprovacao', 'Aprovação do caso: rascunho, em revisão, aprovado'],
  ['qa_release', 'Progresso de uma release (versão)'],
  ['qa_rodada_atribuir', 'Atribuir/distribuir os casos da rodada entre testadores'],
  ['qa_pendencias', 'Casos pendentes atribuídos a uma pessoa'],
  ['qa_preparar_ambientes', 'Massa de dados por ambiente (local, dev, hml, prod) no compartilhado'],
  ['qa_importar_casos', 'Importar casos de planilha (TestRail, Zephyr, Excel)'],
  ['qa_editar_em_massa', 'Mudar prioridade, tags, épico, responsável de vários casos'],
  ['qa_comparar_versoes', 'O que mudou entre versões (passos, cabeçalho, diff)'],
  ['qa_restaurar_versao', 'Voltar o documento a uma versão guardada'],
  ['qa_anexar_evidencia', 'Copiar um arquivo para evidencias/ e ligar'],
  ['qa_atualizar_cabecalho', 'Mudar campos do cabeçalho (ex.: chave do Jira)'],
  ['qa_comentar', 'Comentário de revisão'],
  ['qa_para_jira', 'Bug pronto para criar o ticket no Jira'],
  ['qa_rodada_status', 'Como está a rodada: progresso, falhas, pendentes'],
  ['qa_rodada_criar', 'Nova rodada por épico, ticket, #tag, consulta ou ciclo salvo'],
  ['qa_rodada_registrar', 'Registrar o resultado de um caso na rodada'],
  ['qa_rodada_finalizar', 'Finalizar a rodada e gerar os relatórios'],
  ['qa_relatorios', 'Relatórios de fim de execução (Go/No-Go, defeitos, rastreabilidade, log)'],
  ['qa_validar', 'Avisos de QA, links quebrados e evidências faltando'],
  ['qa_rastreabilidade', 'Ticket/épico → casos → resultado → bugs'],
  ['qa_tendencia', '% de sucesso por rodada e sprint, casos que mais falham, bugs no tempo'],
  ['qa_compartilhados', 'Passos e dados compartilhados do escopo (logins, URLs, ↪ blocos, antes de cada caso)'],
  ['qa_ligar', 'Ligar dois documentos ([[link]], ex.: bug órfão ao caso)'],
  ['qa_varredura', 'Documentos antigos sem os vínculos (app, ticket, épico, tags, caso do bug)'],
];

const manifest = {
  manifest_version: '0.3',
  name: 'markdown-qa',
  display_name: 'TestFlow (pasta de trabalho)',
  version: pkg.version,
  description: 'Lê, consulta e escreve os documentos de QA (casos, bugs, execuções) da sua pasta de trabalho no formato QA-MD — local, sem nuvem.',
  long_description: 'Servidor MCP local do TestFlow. O Claude lista e busca documentos, consulta como as visões do app, lê com o cabeçalho interpretado, cria documentos a partir dos modelos (próximo ID, pasta certa pelo app:), cria bug a partir do passo que falhou, marca passos, anexa evidências, atualiza o campo jira e deixa comentários de revisão. Antes de cada gravação a versão anterior vai para .versoes/. Nada é apagado nem publicado.',
  author: { name: 'TestFlow' },
  icon: 'icon.png',
  server: {
    type: 'node',
    entry_point: 'server/qa-mcp.mjs',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/qa-mcp.mjs', '--pasta', '${user_config.pasta}'],
      // opcionais pelo ambiente: vazio não atrapalha os argumentos
      env: { QA_NOME: '${user_config.nome}', QA_JIRA: '${user_config.jira}' },
    },
  },
  user_config: {
    pasta: { type: 'directory', title: 'Pasta de trabalho', description: 'A pasta com os documentos de QA (a mesma que você abre no editor).', required: true },
    nome: { type: 'string', title: 'Seu nome', description: 'Autor dos comentários de revisão feitos pelo Claude.', required: false, default: '' },
    jira: { type: 'string', title: 'Endereço do Jira', description: 'Ex.: https://ngosolucoes.atlassian.net (para os links das chaves).', required: false, default: 'https://ngosolucoes.atlassian.net' },
  },
  tools: TOOLS.map(([name, description]) => ({ name, description })),
  compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: '>=20.0.0' } },
};

writeFileSync(new URL('mcp-dist/manifest.json', root), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(new URL('mcp-dist/icon.png', root), readFileSync(new URL('public/icons/icon-512.png', root)));
writeFileSync(new URL('mcp-dist/testflow.mcpb', root), zip([
  ['manifest.json', JSON.stringify(manifest, null, 2)],
  ['server/qa-mcp.mjs', bundle],
  ['icon.png', readFileSync(new URL('public/icons/icon-512.png', root))],
]));
console.log(`MCP: mcp-dist/qa-mcp.mjs (${Math.round(bundle.length / 1024)} KB) + mcp-dist/testflow.mcpb — versão ${pkg.version}`);
