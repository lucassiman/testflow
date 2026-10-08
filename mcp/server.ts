/**
 * Servidor MCP local do TestFlow: o Claude (desktop, Claude Code) lê, consulta e escreve
 * na pasta de trabalho no formato QA-MD — sem nuvem e sem o app aberto. Conversa pelo stdin/stdout (sem porta de rede).
 *
 * Uso:  node qa-mcp.mjs "C:\QA\minha-pasta"     (ou a variável QA_PASTA)
 * Opções: --nome "Lucas" (autor dos comentários) · --jira https://empresa.atlassian.net
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { QaWorkspace } from './qa.ts';

declare const __QA_TEMPLATES__: Record<string, string> | undefined;
declare const __QA_CONVENCOES__: string | undefined;
declare const __QA_VERSION__: string | undefined;

/** Argumentos: pasta (posicional ou --pasta), --nome, --jira. */
export function parseArgs(argv: string[], env: Record<string, string | undefined> = process.env) {
  const out: { pasta: string; nome: string; jira: string } = { pasta: env.QA_PASTA || '', nome: env.QA_NOME || '', jira: env.QA_JIRA || '' };
  // valor que não veio (opção vazia no Claude desktop) ou que ficou sem substituir ("${user_config.x}") é ignorado
  const value = (v: string | undefined) => (v === undefined || v.startsWith('--') || v.includes('${') ? null : v);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pasta' || a === '--nome' || a === '--jira') {
      const v = value(argv[i + 1]);
      if (v === null) continue;
      i++;
      if (a === '--pasta') out.pasta = v; else if (a === '--nome') out.nome = v; else out.jira = v;
    } else if (!a.startsWith('--') && !out.pasta && value(a) !== null) out.pasta = a;
  }
  for (const k of ['pasta', 'nome', 'jira'] as const) if (out[k].includes('${')) out[k] = '';
  return out;
}

/** Modelos e convenções: embutidos no pacote (build) ou lidos do projeto (npm run mcp). */
async function assets(): Promise<{ templates: Record<string, string>; convencoes: string; version: string }> {
  if (typeof __QA_TEMPLATES__ !== 'undefined') return { templates: __QA_TEMPLATES__, convencoes: __QA_CONVENCOES__ || '', version: __QA_VERSION__ || '' };
  const here = nodePath.dirname(fileURLToPath(import.meta.url));
  const project = nodePath.resolve(here, '..');
  const dir = nodePath.join(project, 'src', 'templates');
  const templates: Record<string, string> = {};
  for (const f of await fs.readdir(dir)) if (f.endsWith('.md')) templates[f.replace(/\.md$/, '')] = (await fs.readFile(nodePath.join(dir, f), 'utf8')).replace(/\r\n?/g, '\n');
  const convencoes = await fs.readFile(nodePath.join(project, 'CONVENCOES-QA.md'), 'utf8').catch(() => '');
  const version = JSON.parse(await fs.readFile(nodePath.join(project, 'package.json'), 'utf8')).version;
  return { templates, convencoes, version };
}

const INSTRUCTIONS = `Pasta de trabalho de QA no formato QA-MD (TestFlow): casos de teste, bugs, planos, sessões e relatórios em .md com cabeçalho YAML.
Como trabalhar:
- Para se orientar: qa_visao_geral; para achar: qa_listar / qa_buscar / qa_consultar (mesma sintaxe das visões do app); para ler: qa_ler (use o ID, ex.: TC-042).
- Para escrever, prefira as ferramentas específicas (qa_criar, qa_bug_do_caso, qa_marcar_passos, qa_anexar_evidencia, qa_atualizar_cabecalho, qa_comentar) em vez de reescrever arquivos: elas seguem as regras do formato, dão o próximo ID, põem no lugar certo pelo app: e guardam a versão anterior em .versoes/.
- Antes de escrever testware do zero, leia qa_convencoes. Não invente dados, resultados, IDs do Jira nem evidências.
- Nada é publicado na pasta oficial nem apagado por aqui; o editor aberto percebe a mudança e oferece recarregar.
- Jira: qa_para_jira devolve o bug pronto (resumo, prioridade, descrição, anexos); depois de criar o ticket com o conector do Jira, grave a chave com qa_atualizar_cabecalho { jira: "CHAVE-123" }.`;

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const fail = (err: unknown) => ({ content: [{ type: 'text' as const, text: `Erro: ${(err as Error)?.message || String(err)}` }], isError: true });
/** Roda a ferramenta devolvendo o erro como texto (o Claude lê e corrige). */
const run = async <T>(fn: () => Promise<T>, ok: (v: T) => ReturnType<typeof text>) => { try { return ok(await fn()); } catch (err) { return fail(err); } };

export async function createServer(ws: QaWorkspace, convencoes: string, version: string): Promise<McpServer> {
  const server = new McpServer({ name: 'markdown-qa', version: version || '1.0.0' }, { instructions: INSTRUCTIONS });
  const RO = { readOnlyHint: true, openWorldHint: false } as const;
  const RW = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
  const docArg = z.string().describe('Documento: ID (TC-042, BUG-7), [[TC-042]], nome do arquivo ou caminho dentro da pasta');

  server.registerTool('qa_visao_geral', {
    title: 'Visão geral da pasta de QA', description: 'Resumo da pasta de trabalho: quantos documentos por tipo, aplicação e status, entrada, visões salvas e prontas. Use primeiro para se orientar.',
    inputSchema: {}, annotations: RO,
  }, async () => run(() => ws.overview(), text));

  server.registerTool('qa_convencoes', {
    title: 'Convenções QA-MD', description: 'As regras do formato QA-MD (cabeçalho, status, passos, evidências, estrutura por tipo, onde salvar). Leia antes de escrever testware do zero.',
    inputSchema: {}, annotations: RO,
  }, async () => text(convencoes || 'Convenções não disponíveis neste pacote.'));

  server.registerTool('qa_listar', {
    title: 'Listar documentos', description: 'Lista documentos com filtros (listas separadas por vírgula; "!" na frente exclui). Devolve tabela com ID, título, tipo, status, app, progresso e pasta.',
    inputSchema: {
      tipo: z.string().optional().describe('caso-de-teste, bug, plano-de-teste, relatorio-execucao, charter-exploratorio, checklist, cenario-bdd, resumo-testes, epico, historia, ciclo-regressao…'),
      app: z.string().optional(), status: z.string().optional().describe('PASS, FAIL, BLOCKED, SKIP, PENDING, sem-status'),
      tags: z.string().optional(), pasta: z.string().optional().describe('começo do caminho, ex.: aplicacoes/Portal'),
      texto: z.string().optional().describe('palavra no ID, título, caminho, tags, responsável…'),
      execucao: z.string().optional().describe('nunca, andamento, executado, com-falha'),
      limite: z.number().int().min(1).max(2000).optional(),
    }, annotations: RO,
  }, async (a) => run(() => ws.list(a), text));

  server.registerTool('qa_consultar', {
    title: 'Consultar (como as visões)', description: `Consulta na sintaxe do bloco qa-visao do app (uma linha "chave: valor" por item): filtros tipo, app, status, tags, jira, versao, pasta, responsavel, prioridade, execucao, automacao, comentarios, texto; formato: lista | quadro | cobertura (medida: execucao|automacao) | jira | rastreabilidade; agrupar, colunas, ordenar (-desc), limite. Ou uma visão pronta: nao-executados, tickets, regressao, automacao, rastreabilidade (a consulta completa o filtro, ex.: "versao: 2.14").`,
    inputSchema: { consulta: z.string().optional().describe('ex.: "tipo: caso-de-teste\\napp: Portal\\nexecucao: com-falha\\ncolunas: id, titulo, status, rodada, bugs"'), pronta: z.string().optional() },
    annotations: RO,
  }, async (a) => run(() => ws.query(a.consulta || '', a.pronta || ''), text));

  server.registerTool('qa_buscar', {
    title: 'Buscar texto', description: 'Busca em todos os documentos (sem diferenciar acentos nem maiúsculas). Devolve arquivo e linhas.',
    inputSchema: { texto: z.string().min(1), limite: z.number().int().min(1).max(500).optional() }, annotations: RO,
  }, async (a) => run(() => ws.search(a.texto, a.limite), text));

  server.registerTool('qa_ler', {
    title: 'Ler documento', description: 'Lê um documento: cabeçalho interpretado, execução (passos por status), última rodada, publicação, Jira, comentários pendentes, quem cita, evidências e o texto (inteiro ou só uma seção).',
    inputSchema: { doc: docArg, secao: z.string().optional().describe('título de uma seção (## …), ex.: "Passos"'), so_resumo: z.boolean().optional().describe('true: só o cabeçalho interpretado, sem o texto') },
    annotations: RO,
  }, async (a) => run(() => ws.read(a.doc, a.secao || '', !a.so_resumo), text));

  server.registerTool('qa_resumo_execucao', {
    title: 'Falhas e resumo da execução', description: 'Passos com FAIL/BLOCKED (ação, esperado, obtido, prints) e o resumo da execução de um documento — para analisar a causa ou escrever o bug report.',
    inputSchema: { doc: docArg }, annotations: RO,
  }, async (a) => run(() => ws.executionSummary(a.doc), text));

  server.registerTool('qa_ver_evidencia', {
    title: 'Ver evidência', description: 'Mostra um print (ou outro arquivo de evidência) citado no documento, pelo caminho do link (ex.: evidencias/login.png).',
    inputSchema: { doc: docArg, arquivo: z.string() }, annotations: RO,
  }, async (a) => {
    try {
      const f = await ws.evidence(a.doc, a.arquivo);
      if (f.mimeType.startsWith('image/')) return { content: [{ type: 'image' as const, data: f.data, mimeType: f.mimeType }, { type: 'text' as const, text: f.path }] };
      if (/^(text\/|application\/json)/.test(f.mimeType)) return text(Buffer.from(f.data, 'base64').toString('utf8'));
      return text(`Arquivo ${f.path} (${f.mimeType}) — não é imagem nem texto.`);
    } catch (err) { return fail(err); }
  });

  server.registerTool('qa_versoes', {
    title: 'Histórico de versões', description: 'Versões guardadas de um documento em .versoes/ (antes de cada gravação do editor ou do Claude).',
    inputSchema: { doc: docArg }, annotations: RO,
  }, async (a) => run(() => ws.versions(a.doc), text));

  server.registerTool('qa_criar', {
    title: 'Criar documento', description: 'Cria um documento QA-MD a partir do modelo do tipo (ou do texto completo em "conteudo"), com o próximo ID livre e no lugar certo pelo app: (aplicacoes/<App>/<casos|bugs|planos…>/; casos com chave no jira: vão para casos/<TICKET>/; sem app: _entrada/). Nunca sobrescreve. Devolve o caminho e os avisos da validação.',
    inputSchema: {
      tipo: z.string().describe('caso-de-teste, bug, relatorio-execucao, cenario-bdd, plano-de-teste, charter-exploratorio, checklist, resumo-testes, epico, historia — ou o nome de um modelo da pasta modelos/'),
      titulo: z.string(), app: z.string().optional(),
      campos: z.record(z.string(), z.string()).optional().describe('outros campos do cabeçalho: prioridade, severidade, ambiente, versao, responsavel, jira, tags ("[a, b]")…'),
      conteudo: z.string().optional().describe('documento completo em QA-MD (com cabeçalho ---), quando você já escreveu tudo'),
      pasta: z.string().optional().describe('forçar a pasta (caminho dentro da pasta de trabalho)'),
    }, annotations: RW,
  }, async (a) => run(() => ws.create(a), text));

  server.registerTool('qa_bug_do_caso', {
    title: 'Bug a partir de um caso', description: 'Cria o bug ligado a um caso de teste a partir do passo que falhou (o primeiro FAIL/BLOCKED, ou o informado): passos até ele, esperado, obtido, ambiente e os prints do passo. O caso ganha o link para o bug.',
    inputSchema: { caso: docArg, passo: z.string().optional().describe('número/ID do passo; sem ele, o primeiro com FAIL'), titulo: z.string().optional(), obtido: z.string().optional().describe('resultado obtido, se quiser detalhar') },
    annotations: RW,
  }, async (a) => run(() => ws.bugFromCase(a), text));

  server.registerTool('qa_marcar_passos', {
    title: 'Marcar passos', description: 'Marca o status (PASS, FAIL, BLOCKED, SKIP, PENDING ou "" para limpar) e/ou o resultado obtido de passos da tabela; recalcula o status geral e o resumo. concluir=true registra a rodada no Histórico de execuções.',
    inputSchema: {
      doc: docArg,
      passos: z.array(z.object({ passo: z.string().describe('número/ID do passo (coluna #)'), status: z.string().optional(), obtido: z.string().optional() })).min(1),
      concluir: z.boolean().optional(),
    }, annotations: RW,
  }, async (a) => run(() => ws.markSteps(a), text));

  server.registerTool('qa_nova_rodada', {
    title: 'Nova rodada', description: 'Arquiva a tabela de passos como está no Histórico de execuções e limpa obtido/status (para reexecutar).',
    inputSchema: { doc: docArg }, annotations: RW,
  }, async (a) => run(() => ws.newRound(a.doc), text));

  server.registerTool('qa_anexar_evidencia', {
    title: 'Anexar evidência', description: 'Copia um arquivo deste computador (print, vídeo, log, HAR…) para evidencias/ ao lado do documento e põe o link na seção Evidências (com "Passo N" na legenda, se informado).',
    inputSchema: { doc: docArg, arquivo: z.string().describe('caminho completo do arquivo no computador'), passo: z.string().optional(), legenda: z.string().optional() },
    annotations: RW,
  }, async (a) => run(() => ws.attach(a), text));

  server.registerTool('qa_atualizar_cabecalho', {
    title: 'Atualizar cabeçalho', description: 'Muda campos do cabeçalho YAML (status, prioridade, responsavel, versao, jira…). "jira" acrescenta a chave (sem apagar as que já existem), a não ser com substituir_jira. Trocar "id" (ex.: SES-002 → SES-005) atualiza o título e as menções no documento e os [[links]] dos outros documentos da pasta. Campos de publicação e "uid" (identidade fixa) não mudam por aqui.',
    inputSchema: { doc: docArg, campos: z.record(z.string(), z.string()), substituir_jira: z.boolean().optional() },
    annotations: RW,
  }, async (a) => run(() => ws.setFields(a), text));

  server.registerTool('qa_comentar', {
    title: 'Comentário de revisão', description: 'Deixa um comentário de revisão no documento (> [!COMMENT] @autor · data), no fim de uma seção ou do documento. Não altera o texto existente.',
    inputSchema: { doc: docArg, texto: z.string().min(1), secao: z.string().optional(), autor: z.string().optional() },
    annotations: RW,
  }, async (a) => run(() => ws.comment(a), text));

  server.registerTool('qa_para_jira', {
    title: 'Bug pronto para o Jira', description: 'Devolve o bug pronto para criar/atualizar o ticket no Jira: resumo "[BUG-12] título", tipo, prioridade, descrição (Markdown e wiki markup, sem comentários de revisão) e os caminhos dos anexos. Depois de criar o ticket, grave a chave com qa_atualizar_cabecalho.',
    inputSchema: { doc: docArg }, annotations: RO,
  }, async (a) => run(() => ws.forJira(a.doc), (r) => text(r.text)));

  return server;
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.pasta) {
    process.stderr.write('Informe a pasta de trabalho: node qa-mcp.mjs "C:\\caminho\\da\\pasta" (ou a variável QA_PASTA).\n');
    process.exit(2);
  }
  const { templates, convencoes, version } = await assets();
  const ws = new QaWorkspace({ root: args.pasta, templates, who: args.nome, jiraBase: args.jira });
  await ws.refresh(true);
  const server = await createServer(ws, convencoes, version);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`markdown-qa MCP ${version}: pasta ${ws.rootPath}\n`);
}
