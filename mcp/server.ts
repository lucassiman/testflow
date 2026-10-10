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
- Jira: qa_para_jira devolve o bug pronto (resumo, prioridade, descrição, anexos); depois de criar o ticket com o conector do Jira, grave a chave com qa_atualizar_cabecalho { jira: "CHAVE-123" }.
- Rodada de regressão: qa_rodada_criar (por segmento — épico, ticket, #tag —, consulta, lista de casos, ciclo salvo, ou reteste: EXEC-… só com as falhas) → qa_rodada_registrar por caso → qa_rodada_status para ver como está → qa_rodada_finalizar (SKIP nos pendentes e os 4 relatórios: encerramento/Go-No-Go, defeitos, rastreabilidade, log + comparativo). qa_relatorios regera.
- Bug de um caso que já tem bug ligado: qa_bug_do_caso devolve os bugs; pergunte ao usuário se é reincidência (reincidencia: "BUG-…") ou bug novo (novo: true).
- Evolução da qualidade (sprint, % de sucesso no tempo, casos que mais falham): qa_tendencia.
- Status personalizados: um documento tipo status (configuracao/status.md, tabela Palavra | Conta como | Cor) cria palavras a mais (ex.: RETESTE, FALHA CONHECIDA) que valem nos passos e contam como um dos 5 — use só as que existem (qa_marcar_passos avisa).
- Aprovação do caso (rascunho → em-revisao → aprovado): casos novos nascem "rascunho"; qa_aprovacao muda (aprovar só quando o usuário pedir); consulta "aprovacao: em-revisao, alterado" lista o que falta revisar; qa_rodada_criar so_aprovados=true deixa de fora os não aprovados.
- Massa por ambiente: no compartilhado, "## Dados: Logins (hml)" / "(prod)"… com as mesmas chaves (sem ambiente = vale para todos); o caso continua {{admin.e-mail}} e o app troca pelo ambiente ativo. qa_preparar_ambientes cria as seções com as chaves e os valores em branco para o QA preencher; qa_compartilhados { ambiente } mostra o que falta em cada ambiente.
- Caso com dados (o mesmo caso para vários perfis/massas): seção "## Iterações" no caso (tabela Chave | campos…, uma linha por execução) ou "iterar: <grupo de Dados compartilhado>" no cabeçalho; nos passos {{dado}} / {{dado.campo}} e "↪ Bloco (dado)". qa_compartilhados { documento } lista as iterações; registre uma a uma (iteracao: nome ou número) em qa_marcar_passos concluir=true / qa_rodada_registrar.
- Login, URLs e preparação repetidos em vários casos: veja qa_compartilhados (pasta ou documento) antes de escrever casos — use "↪ Bloco (param)" como um passo e {{dado}} / {{dado.senha}} em vez de repetir passos ou escrever senhas; se não houver, sugira criar um compartilhado (qa_criar tipo compartilhado, escopo pasta | app | global). Casos antigos com login repetido ou senha escrita: qa_varredura { modo: "compartilhados" } relata e, com o OK, converte.
- Segmento = tudo o que nasceu de um épico/ticket/execução/ciclo/#tag (filtro segmento em qa_listar/qa_consultar/qa_validar/qa_rastreabilidade).
- Qualidade: qa_validar (avisos de QA, links quebrados, evidências faltando) antes de entregar ou publicar; qa_varredura acha documentos antigos sem os vínculos (relate primeiro, aplique só com o OK do usuário).
- Escopo dos casos: siga a seção "Nível, tipo e profundidade" de qa_convencoes — gere só o nível pedido (ex.: e2e/UI sem casos de backend/unitários) e diga a premissa quando o pedido não especificar.`;

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
      segmento: z.string().optional().describe('tudo o que nasceu de um pai: épico (PORTAL-10), ticket, execução (EXEC-…), ciclo, plano, sprint ou #tag — pelos campos herdados, pela pasta e por quem cita'),
      limite: z.number().int().min(1).max(2000).optional(),
    }, annotations: RO,
  }, async (a) => run(() => ws.list(a), text));

  server.registerTool('qa_consultar', {
    title: 'Consultar (como as visões)', description: `Consulta na sintaxe do bloco qa-visao do app (uma linha "chave: valor" por item): filtros segmento (épico/ticket/execução/ciclo/#tag: tudo o que nasceu dele), tipo, app, status, tags, jira, versao, pasta, responsavel, prioridade, execucao, automacao, comentarios, texto; formato: lista | quadro | cobertura (medida: execucao|automacao) | jira | rastreabilidade; agrupar, colunas, ordenar (-desc), limite. Ou uma visão pronta: nao-executados, tickets, regressao, automacao, rastreabilidade (a consulta completa o filtro, ex.: "versao: 2.14").`,
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

  server.registerTool('qa_editar_em_massa', {
    title: 'Edição em massa', description: 'Muda campos do cabeçalho de vários casos de uma vez — prioridade, responsavel, epico, sprint, versao, tags (por/tirar), aprovacao; limpar esvazia campos. Casos por IDs, segmento ou consulta (interseção). Sem aplicar: só a prévia; aplicar=true grava (confirme com o usuário).',
    inputSchema: {
      casos: z.array(z.string()).optional(), segmento: z.string().optional(), consulta: z.string().optional(),
      prioridade: z.string().optional().describe('Crítica, Alta, Média, Baixa'), responsavel: z.string().optional(), epico: z.string().optional(), sprint: z.string().optional(), versao: z.string().optional(),
      tags_por: z.string().optional().describe('tags a acrescentar, separadas por vírgula'), tags_tirar: z.string().optional(),
      aprovacao: z.string().optional().describe('rascunho, em-revisao ou aprovado (aprovar só com o pedido do usuário)'),
      limpar: z.array(z.enum(['responsavel', 'epico', 'sprint', 'versao'])).optional(),
      aplicar: z.boolean().optional(),
    }, annotations: RW,
  }, async (a) => run(() => ws.bulkEdit(a), text));

  server.registerTool('qa_importar_casos', {
    title: 'Importar casos de planilha', description: 'Importa casos de uma planilha (CSV ou XLSX) exportada do TestRail, Zephyr, Xray, qTest ou montada à mão (um caso por linha, ou linhas de passos) — um documento por caso (TC-… novo) em aplicacoes/<app>/casos/ (por seção da origem, pela chave do Jira ou tudo junto). Sem aplicar: só mostra o que reconheceu; aplicar=true cria (confirme com o usuário). Já importados (importado-de:) são pulados.',
    inputSchema: {
      arquivo: z.string().describe('caminho completo da planilha no computador'), app: z.string().describe('aplicação (pasta aplicacoes/<App>/)'),
      pastas: z.enum(['secao', 'ticket', 'casos']).optional(), tags: z.string().optional().describe('tags em todos (padrão: importado)'),
      pular_importados: z.boolean().optional(), aplicar: z.boolean().optional(),
    }, annotations: RW,
  }, async (a) => run(() => ws.importCases(a), text));

  server.registerTool('qa_comparar_versoes', {
    title: 'Comparar versões', description: 'O que mudou entre uma versão guardada e o documento atual (ou outra versão): resumo do caso (cabeçalho, passos novos/removidos/alterados, seções) e o diff. versao: nome de qa_versoes, "anterior" (padrão) ou "aprovada" (a última aprovação).',
    inputSchema: { doc: docArg, versao: z.string().optional(), com: z.string().optional().describe('outra versão (sem ela: o documento atual)') }, annotations: RO,
  }, async (a) => run(() => ws.compareVersions(a), text));

  server.registerTool('qa_restaurar_versao', {
    title: 'Restaurar versão', description: 'Volta o documento a uma versão guardada (nome de qa_versoes, "anterior" ou "aprovada"); a atual fica em .versoes/. Confirme com o usuário antes.',
    inputSchema: { doc: docArg, versao: z.string() }, annotations: { ...RW, destructiveHint: true },
  }, async (a) => run(() => ws.restoreVersion(a), text));

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
    inputSchema: {
      caso: docArg, passo: z.string().optional().describe('número/ID do passo; sem ele, o primeiro com FAIL'), titulo: z.string().optional(), obtido: z.string().optional().describe('resultado obtido, se quiser detalhar'),
      reincidencia: z.string().optional().describe('ID de um bug já ligado ao caso: registra a reincidência nele (data, passo, obtido, print; reabre se estava fechado) em vez de criar outro'),
      novo: z.boolean().optional().describe('true = cria um bug novo mesmo que o caso já tenha bug ligado'),
      execucao: z.string().optional().describe('execução (rodada) onde o defeito foi achado: o bug guarda execucao:/ciclo:'),
    },
    annotations: RW,
  }, async (a) => run(() => ws.bugFromCase(a), text));

  server.registerTool('qa_marcar_passos', {
    title: 'Marcar passos', description: 'Marca o status (PASS, FAIL, BLOCKED, SKIP, PENDING ou "" para limpar) e/ou o resultado obtido de passos da tabela; recalcula o status geral e o resumo. concluir=true registra a rodada no Histórico de execuções.',
    inputSchema: {
      doc: docArg,
      passos: z.array(z.object({ passo: z.string().describe('número/ID do passo (coluna #)'), status: z.string().optional(), obtido: z.string().optional() })).min(1),
      concluir: z.boolean().optional(),
      iteracao: z.string().optional().describe('Caso com dados (## Iterações ou iterar:): qual iteração está sendo concluída — nome (admin) ou número (1). Sem ela: a seguinte à última registrada.'),
      ambiente: z.string().optional().describe('ambiente em que rodou (local, dev, hml, prod) — vai para o histórico e escolhe a massa do compartilhado'),
    }, annotations: RW,
  }, async (a) => run(() => ws.markSteps(a), text));

  server.registerTool('qa_aprovacao', {
    title: 'Aprovação do caso', description: 'Muda a aprovação de um caso/cenário/checklist: rascunho → em-revisao (com revisor) → aprovado (grava quem e quando; mudar a definição depois pede nova aprovação). Aprove só quando o usuário pedir — quem aprova é uma pessoa (por).',
    inputSchema: {
      doc: docArg,
      estado: z.enum(['rascunho', 'em-revisao', 'aprovado']),
      revisor: z.string().optional().describe('quem vai revisar (em-revisao)'),
      por: z.string().optional().describe('quem aprovou (padrão: o usuário do MCP)'),
    }, annotations: RW,
  }, async (a) => run(() => ws.approve(a), text));

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

  // ---------------------------------------------------------------- rodadas e relatórios (Fase 10.4)
  server.registerTool('qa_rodada_status', {
    title: 'Como está a rodada', description: 'Rodada (execução) em andamento — ou a informada: progresso, PASS/FAIL/BLOCKED/SKIP, % de sucesso, pendentes, falhas com os bugs ligados, duração e vínculos.',
    inputSchema: { execucao: z.string().optional().describe('ID/caminho da execução; sem ele, a última em andamento') }, annotations: RO,
  }, async (a) => run(() => ws.roundStatus(a.execucao || ''), text));

  server.registerTool('qa_rodada_criar', {
    title: 'Nova rodada de execução', description: 'Cria a execução (rodada) com os casos de um segmento (épico, ticket, #tag, execução anterior), de uma consulta (sintaxe das visões), de uma lista de IDs — combinados, vale a interseção — ou de um ciclo salvo (vira a execução #N dele) — ou o reteste das falhas de uma execução (reteste: EXEC-…). A execução herda as tags/épico/ticket/sprint que todos os casos têm (ou os do ciclo) e nasce junto das outras execuções.',
    inputSchema: {
      nome: z.string().optional(), casos: z.array(z.string()).optional().describe('IDs dos casos'),
      segmento: z.string().optional().describe('ex.: PORTAL-10, PORTAL-120, #pix, EXEC-20261001-0900'),
      consulta: z.string().optional().describe('ex.: "tags: regressao\napp: Portal\nprioridade: Alta"'),
      ciclo: z.string().optional().describe('ID do ciclo salvo (tipo ciclo-regressao) para executar de novo'),
      app: z.string().optional(), vinculos: z.record(z.string(), z.string()).optional().describe('jira, epico, sprint, plano'),
      reteste: z.string().optional().describe('ID de uma execução (EXEC-…): cria o reteste só com os casos FAIL/BLOCKED dela (herda vínculos, tags + reteste, dispositivo)'),
      reteste_skip: z.boolean().optional().describe('com reteste: inclui também os SKIP'),
      so_aprovados: z.boolean().optional().describe('só os casos aprovados (aprovacao: aprovado, sem mudança depois); os outros ficam de fora e são listados'),
      ambientes: z.array(z.string()).optional().describe('matriz: uma execução por combinação de ambientes × navegadores × dispositivos (ex.: ["HML", "PROD"])'),
      navegadores: z.array(z.string()).optional(), dispositivos: z.array(z.string()).optional(),
    }, annotations: RW,
  }, async (a) => run(() => ws.roundCreate(a), text));

  server.registerTool('qa_rodada_registrar', {
    title: 'Registrar caso na rodada', description: 'Registra o resultado de um caso na rodada. Com passos: marca no caso (arquiva a rodada antiga se as marcas eram de antes) e, com todos marcados, conclui a rodada do caso. Sem passos: status do caso inteiro (checklist, ou "não deu para executar") na execução. A execução se atualiza (status, executado em, bugs abertos).',
    inputSchema: {
      execucao: z.string().optional().describe('sem ela, a última em andamento'), caso: docArg,
      passos: z.array(z.object({ passo: z.string(), status: z.string().optional(), obtido: z.string().optional() })).optional(),
      status: z.string().optional().describe('PASS, FAIL, BLOCKED ou SKIP do caso inteiro (quando não há passos)'),
      observacao: z.string().optional().describe('comentário de revisão no caso, com o ID da rodada'),
      ambiente: z.string().optional().describe('ambiente em que rodou (vai para o histórico)'),
      iteracao: z.string().optional().describe('Caso com dados (## Iterações ou iterar:): a iteração destes passos — nome ou número. Sem ela: a seguinte à última registrada. Cada iteração é registrada e a tabela fica pronta para a próxima; o caso fica feito na última (pior resultado).'),
    }, annotations: RW,
  }, async (a) => run(() => ws.roundRecord(a), text));

  server.registerTool('qa_rodada_atribuir', {
    title: 'Atribuir casos na rodada', description: 'Coluna Testador da execução: pessoas → distribui os casos pendentes entre elas (pelo tempo previsto — duração média de cada caso — ou pela quantidade; todos=true redistribui os já atribuídos); casos + para → atribui esses casos a uma pessoa (para: "" tira). Devolve a carga de cada um.',
    inputSchema: {
      execucao: z.string().optional(), pessoas: z.array(z.string()).optional(), casos: z.array(z.string()).optional(), para: z.string().optional(),
      por: z.enum(['tempo', 'quantidade']).optional(), todos: z.boolean().optional(),
    }, annotations: RW,
  }, async (a) => run(() => ws.roundAssign(a), text));

  server.registerTool('qa_pendencias', {
    title: 'Minhas pendências', description: 'Casos pendentes atribuídos a uma pessoa nas execuções em andamento, com o tempo previsto.',
    inputSchema: { pessoa: z.string().optional().describe('sem ela: o usuário do MCP') }, annotations: RO,
  }, async (a) => run(() => ws.pendencies(a), text));

  server.registerTool('qa_release', {
    title: 'Release / milestone', description: 'Releases da pasta (tipo release) e o progresso de uma: tudo com a mesma versao: (planos, execuções, casos, bugs) — casos executados, % de sucesso, falhas, bugs abertos, critérios de saída, dias até a data prevista e se está pronta (Go). Sem argumentos: lista as releases.',
    inputSchema: { release: z.string().optional().describe('ID do documento da release (REL-…)'), versao: z.string().optional().describe('ex.: 2.14'), app: z.string().optional() }, annotations: RO,
  }, async (a) => run(() => ws.release(a), text));

  server.registerTool('qa_rodada_finalizar', {
    title: 'Finalizar rodada', description: 'Finaliza a execução: SKIP nos casos não executados, fim:, seção Encerramento, atualiza o ciclo de origem e (padrão) gera os 4 relatórios de fim de execução. Depois de finalizada, a execução não muda mais — confirme com o usuário antes.',
    inputSchema: { execucao: z.string().optional(), relatorios: z.boolean().optional().describe('false = não gera os relatórios') },
    annotations: { ...RW, destructiveHint: true },
  }, async (a) => run(() => ws.roundFinish(a), text));

  server.registerTool('qa_relatorios', {
    title: 'Relatórios de fim de execução', description: 'Gera ou regera os 4 relatórios da execução em relatorios/<ID>/ (Encerramento e Go/No-Go com os critérios de saída do plano; Defeitos da rodada; Rastreabilidade e cobertura; Log + comparativo com a execução anterior), ligados na seção Relatórios dela. O que o QA escreveu nos trechos de comentário e aceite é mantido.',
    inputSchema: { execucao: z.string().optional() }, annotations: RW,
  }, async (a) => run(() => ws.reports(a.execucao || ''), text));

  server.registerTool('qa_validar', {
    title: 'Validar (avisos de QA)', description: 'Os avisos do app: passo sem resultado esperado, status incoerente, cabeçalho incompleto, links [[…]] quebrados e evidências que não existem. Um documento, um segmento (épico/ticket/execução/#tag), uma pasta ou a pasta inteira.',
    inputSchema: { doc: z.string().optional(), segmento: z.string().optional(), pasta: z.string().optional(), limite: z.number().int().min(1).max(500).optional() },
    annotations: RO,
  }, async (a) => run(() => ws.validate(a), text));

  server.registerTool('qa_varredura', {
    title: 'Varredura de vínculos', description: 'Procura em aplicacoes/ (ou na pasta/app informada) documentos antigos sem os vínculos: app:, jira:/epico: (pela pasta do ticket/épico ou pela história), tags e sprint herdadas do pai, bug sem caso ligado, caso sem requisito, execução sem o épico/tags dos casos, relatório desatualizado, arquivo fora da pasta de épico/ticket. Cada achado vem com a confiança (certo / provável / confirmar). Sem aplicar, só relata; aplicar: "certo" ou "provavel" preenche campos vazios e soma tags (versão anterior em .versoes/). Mover arquivos e os "confirmar" ficam com o usuário. Com modo: "compartilhados", leva login/preparação repetidos e dados escritos à mão para um documento compartilhado (aplicar certo: cria e troca os blocos; provavel: também os dados soltos).',
    inputSchema: {
      pasta: z.string().optional(), app: z.string().optional(), aplicar: z.enum(['certo', 'provavel']).optional(), limite: z.number().int().min(1).max(1000).optional(),
      modo: z.enum(['vinculos', 'compartilhados']).optional().describe('vinculos (padrão) ou compartilhados: acha passos repetidos (login, preparação) e dados escritos à mão (e-mail, senha, URL) nos casos, propõe o compartilhado e troca por "↪ Bloco (dado)" / {{dado}}'),
      min_casos: z.number().int().min(2).max(50).optional().describe('modo compartilhados: em quantos casos a sequência precisa se repetir (padrão 3)'),
    },
    annotations: RW,
  }, async (a) => run(() => ws.sweep(a), text));

  server.registerTool('qa_ligar', {
    title: 'Ligar documentos', description: 'Põe em um documento o [[link]] para outro — ex.: o bug órfão ao caso onde foi achado ("Encontrado em [[TC-…]]" no Resumo) ou um caso à história. Não duplica e não mexe no resto do texto.',
    inputSchema: { doc: docArg, alvo: docArg }, annotations: RW,
  }, async (a) => run(() => ws.link(a), text));

  server.registerTool('qa_rastreabilidade', {
    title: 'Rastreabilidade', description: 'Matriz requisito (ticket/épico) → casos → último resultado → bugs. Com segmento, só o do épico/ticket/execução.',
    inputSchema: { segmento: z.string().optional(), app: z.string().optional() }, annotations: RO,
  }, async (a) => run(() => ws.traceability(a), text));

  server.registerTool('qa_compartilhados', {
    title: 'Passos e dados compartilhados', description: 'O que vale para um documento ou uma pasta (escopo, como beforeEach/beforeAll): dados (logins, URLs — sem as senhas) para usar como {{nome}} / {{nome.campo}}, blocos de passos para incluir como UM passo "↪ Nome (parâmetro)", e os "antes de cada caso" / "antes da rodada". Sem argumentos, lista os compartilhados da pasta. Use ANTES de escrever casos para não repetir login/setup.',
    inputSchema: { documento: z.string().optional().describe('caso/bug/etc. (ID ou caminho)'), pasta: z.string().optional().describe('pasta onde o caso vai ficar, ex.: aplicacoes/Portal/casos/PORTAL-10'), ambiente: z.string().optional().describe('local, dev, hml, prod… (sem ele: o ambiente: do documento) — a massa daquele ambiente') }, annotations: RO,
  }, async (a) => run(() => ws.shared(a), text));

  server.registerTool('qa_preparar_ambientes', {
    title: 'Preparar a massa por ambiente', description: 'Num compartilhado, cria para cada "## Dados…" a mesma tabela por ambiente ("## Dados: Logins (hml)"), com as chaves prontas e os valores em branco para o QA preencher (em branco vale o valor geral). Nunca invente valores.',
    inputSchema: { doc: docArg, ambientes: z.array(z.string()).optional().describe('padrão: dev, hml, prod') }, annotations: RW,
  }, async (a) => run(() => ws.prepareEnvs(a), text));

  server.registerTool('qa_tendencia', {
    title: 'Tendência entre rodadas', description: 'Como a qualidade evolui: % de sucesso por rodada (e a variação para a anterior) e por sprint, casos que mais falham no histórico (com o tempo médio) e bugs por mês de abertura (ainda abertos × fechados). Use para o resumo da sprint ou para achar casos instáveis.',
    inputSchema: { app: z.string().optional(), sprint: z.string().optional(), segmento: z.string().optional(), tags: z.string().optional(), limite: z.number().int().min(1).max(100).optional().describe('últimas N rodadas (padrão 12)') }, annotations: RO,
  }, async (a) => run(() => ws.trend(a), text));

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
