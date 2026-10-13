# TestFlow

**Documentação e execução de testes de QA em Markdown — local, sem nuvem, sem login.**

O TestFlow é um aplicativo web instalável (PWA) que transforma arquivos `.md` em documentos de QA **interativos**: casos de teste com status clicável, execução passo a passo com cronômetro e prints, rodadas de regressão com relatórios de fim de execução, bugs ligados ao caso que falhou e cópia pronta para Jira, Notion e Claude.

Os documentos são os seus próprios `.md` (formato **QA-MD**), legíveis também no GitHub, no VS Code e em qualquer wiki. Nada sai do seu computador a menos que você mande.

> **Chegando agora?** Instale em 5 minutos (abaixo), abra a pasta [`exemplos/`](exemplos/) como pasta de trabalho e siga o tour de 15 minutos em [`exemplos/LEIA-ME.md`](exemplos/LEIA-ME.md). Para uma consulta completa, o [**Manual**](MANUAL.md) (também no botão **?** do app, ou `F1`). O que vem pela frente está no [**Roadmap**](ROADMAP.md).

## O que ele faz

| Módulo (menu do topo) | Para quê |
| --- | --- |
| **Dia** | O seu diário: começar o dia com o que ficou aberto, tarefas de qualquer documento (`Alt+T`), reuniões com decisões e ações (e marcar no Teams), fechar o dia e ver a semana. |
| **Casos** | Escrever casos com dados compartilhados (logins, URLs, massa por ambiente), casos com dados (uma execução por linha), fluxo de aprovação, edição em massa, importação de TestRail/Zephyr/Xray/Excel e **visões** (consultas salvas, como bases de dados). |
| **Execução** | Rodadas avulsas, **teste em dupla** com o dev por ticket e **ciclos de regressão** com várias execuções, painel da rodada, atribuição entre testadores, previsão de término, reteste das falhas, matriz de ambientes/navegadores, releases, tendência entre rodadas e **4 relatórios de fim de execução** (Go/No-Go, defeitos, rastreabilidade, log comparativo). |
| **Evidências e bugs** | Colar ou capturar prints, anotar (seta, retângulo, borrão, numeração…), gravar vídeo, **replay dos últimos segundos**, bug criado a partir do passo que falhou (com reincidência), **comparador de JSON** local (diferenças lado a lado, por partes em arquivos grandes) e, com a extensão do navegador, console, requisições com falha e contexto da aba testada. |
| **Automação** | Importar JUnit XML, Playwright JSON e Newman JSON; reporter ao vivo direto na execução; testes instáveis; exportar cenários BDD como `.feature`. |
| **Publicar** | Pasta oficial compartilhada (OneDrive, Drive, rede) com revisões, sincronização nos dois sentidos, histórico de versões com comparação, comentários de revisão e aviso de "fulano está editando". |
| **Compartilhar** | Copiar para Jira, Notion e Claude; exportar PDF, HTML e pacotes; Jira pela API; avisos no Microsoft Teams; página da rodada para o time; proteção de dados sensíveis. |

E, em todo o app: editor **Raw** (CodeMirror) e **Preview editável** (clique e edite no texto renderizado), diagramas Mermaid, abas, paleta de comandos (`Ctrl+Shift+P`), busca com filtros em toda a pasta, painel da pasta, organização por aplicação/épico/ticket, links `[[TC-042]]` que acompanham renomeações e backup da pasta.

### Integração com o Claude

- **Skill `qa-markdown`:** o Claude gera casos, bugs, planos e relatórios já no formato do app. A skill `qa-varredura` arruma vínculos de documentos antigos.
- **MCP local (39 ferramentas):** o Claude desktop ou o Claude Code lê, consulta e escreve na sua pasta de trabalho com as regras do app — próximo ID, pasta certa, histórico em `.versoes/`, nada apagado nem publicado.
- **Copiar para o Claude:** o documento com instruções e revisão de texto (o resumo da rodada vai pelo 📊 Como está, para Jira, Teams, e-mail ou Markdown; falhas e análise, pelo MCP) com conferência do antes × depois. Tudo pela área de transferência.

## Instalação

Precisa de **Node.js 18+**, **Git** e **Chrome ou Edge** (Windows ou Mac).

```bash
git clone https://github.com/lucassiman/testflow.git
cd testflow
npm install
npm run app        # gera o app e abre um servidor local em http://localhost:4173
```

1. Abra **http://localhost:4173** no Chrome ou Edge.
2. Clique no ícone **Instalar** na barra de endereço (ou menu ⋮ → *Instalar TestFlow*).
3. Pronto: o editor vira um aplicativo com ícone próprio, **funciona offline** e o servidor pode ser fechado.
4. **Abrir `.md` com duplo clique:** botão direito num `.md` → *Abrir com* → *TestFlow* (no Windows dá para marcar "sempre usar"; no Mac, *Obter informações → Abrir com → Alterar tudo*). O arquivo abre em modo leitura.

**Sem instalar:** `npm run build:single` gera `dist-single/index.html`, um arquivo só que abre com duplo clique no Chrome/Edge. O `index.html` da raiz é o código-fonte e só mostra uma tela de ajuda.

**Modo desenvolvimento:** `npm run dev` (http://localhost:5173).

### Atualizar

Salve tudo no app e rode, na pasta do projeto:

```bash
git pull
npm install
npm run app
```

Abra o app: ele pega a versão nova sozinho (a versão aparece no rodapé). **Não desinstale o app nem limpe os dados do site** para atualizar — preferências, abas, fixados e recentes ficam lá; mantenha sempre a porta 4173. Não copie `.zip` por cima da pasta do projeto.

### Peças opcionais

| Peça | Como gerar / instalar | Para quê |
| --- | --- | --- |
| **Skill do Claude** | `npm run skill` → envie `claude-skill/qa-markdown.zip` (e `qa-varredura.zip`) em *Customize → Skills* | O Claude gera os documentos no formato do app |
| **MCP local** | `npm run mcp:build` → instale `mcp-dist/testflow.mcpb` no Claude desktop (*Configurações → Extensões*), ou `claude mcp add markdown-qa -- node mcp-dist/qa-mcp.mjs --pasta <pasta>` no Claude Code | O Claude trabalha direto na pasta de trabalho |
| **Extensão do navegador** | `chrome://extensions` → *Modo do desenvolvedor* → *Carregar sem compactação* → pasta `extensao/` (ou `npm run extensao` para um `.zip`) | Console, rede e contexto no bug; Jira pela API; avisos no Teams |
| **Reporter da automação** | `npm run reporter` → `reporter-dist/testflow.mjs` | Resultado do Playwright/Jest/Cypress direto na execução |

Passo a passo de cada uma no [Manual](MANUAL.md): capítulo 2 (instalação), 8.3 (extensão), 9 (reporter) e 12.6 (MCP).

### Personalizar

`branding.json` define nome, cor e o endereço do Jira (`jiraBaseUrl`, por exemplo `https://suaempresa.atlassian.net`); os ícones ficam em `public/icons/`. Depois, `npm run app`.

## Primeiros passos

1. No app, `☰` → **Arquivos** → **Abrir…** e escolha a pasta [`exemplos/`](exemplos/) (a "Loja Demo", um projeto de QA fictício).
2. Abra `casos/TC-003-recuperar-senha.md` e clique em **▶ Executar**.
3. Siga o roteiro de [`exemplos/LEIA-ME.md`](exemplos/LEIA-ME.md) (15 minutos) e, depois, o de [`exemplos/LEIA-ME-por-modulo.md`](exemplos/LEIA-ME-por-modulo.md), com um exemplo para cada menu do topo.
4. Para a sua própria pasta de trabalho: **🗂 Organizar esta pasta…** cria a estrutura (`aplicacoes/<App>/{casos,bugs,planos,…}`, `_entrada/`, `modelos/`, `visoes/`).

## Privacidade e segurança

- Sem servidor, login, telemetria ou chamadas de API: tudo roda no navegador e nos seus arquivos. Preferências e rascunhos ficam só no navegador desta máquina.
- Integrações (Jira pela API, Teams, página da rodada, MCP) são **opcionais e desligadas por padrão**; ligadas, enviam apenas o que você configurou, com dados sensíveis mascarados.
- Antes de copiar ou exportar, o app procura CPF, CNPJ, e-mail, telefone, cartão, senhas e tokens e oferece mascarar.
- Todo HTML exibido passa pelo DOMPurify; Mermaid roda em modo `strict`.

## Para quem desenvolve

```bash
npm run check      # tipos (tsc) do app e do MCP
npm test           # testes unitários (node:test via tsx)
npm run test:e2e   # testes de tela no Chromium (1ª vez: npx playwright install chromium)
npm run test:perf  # pasta grande (2.000 documentos)
```

Visão geral do código em [ARQUITETURA.md](ARQUITETURA.md). O formato dos documentos está em [CONVENCOES-QA.md](CONVENCOES-QA.md). Em um clone novo, os arquivos gerados (`dist/`, `dist-single/`, `mcp-dist/`, `claude-skill/`, `extensao-dist/`, `reporter-dist/`) são recriados pelos comandos acima e não vão para o repositório.

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [MANUAL.md](MANUAL.md) | Todas as funcionalidades, atalhos (Windows e Mac) e problemas comuns |
| [exemplos/](exemplos/) | A Loja Demo e os roteiros de aprendizado |
| [ROADMAP.md](ROADMAP.md) | Onde o projeto está e o que vem pela frente |
| [CONVENCOES-QA.md](CONVENCOES-QA.md) | O formato QA-MD dos documentos |
| [ARQUITETURA.md](ARQUITETURA.md) | Como o código está organizado |
| [CONTEXTO-CLAUDE.md](CONTEXTO-CLAUDE.md) | Guia para sessões do Claude que trabalham no código |

## Licença

MIT.
