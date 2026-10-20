# Contexto para o Claude — TestFlow

**Leia só este arquivo para começar.** Ele resume o projeto, o estado atual e as regras de trabalho; os outros documentos são consulta (mapa abaixo). **Mantê-lo atualizado é parte de toda tarefa** (seção "Manter este arquivo em dia").

## O que é

PWA **local** (sem nuvem, sem servidor) para documentação e execução de testes de QA em Markdown no formato **QA-MD** (`CONVENCOES-QA.md`): casos, bugs, planos, sessões exploratórias, relatórios, épicos/histórias, releases, visões (consultas salvas) e ciclos de regressão. Tem ainda skill do Claude, servidor MCP local (39 ferramentas `qa_*`), extensão do navegador e reporter de automação.
Usuário: QA em pt-BR, Windows (`C:\dev\markdown qa editor`) e um Mac. **Interface, textos, comentários, documentos e commits em português do Brasil.** A versão atual está em `package.json` (não a copie para cá).

**Restrições do projeto:** tudo local; integrações externas opcionais e desligadas por padrão; nada é apagado sem lixeira/desfazer; antes de gravar por cima, a versão anterior vai para `.versoes/`; o app nunca reescreve o que o usuário não tocou.

## Mapa de documentos (e quem atualiza o quê)

| Documento | No repositório | Para quê | Quando atualizar |
| --- | --- | --- | --- |
| `README.md` | sim | Porta de entrada para quem chega de fora: o que é, instalação, atualização | Mudou instalação, comando, módulo ou peça opcional |
| `MANUAL.md` | sim | Manual completo, **embutido no app** (botão ?, `F1`) e conferido por testes | Toda mudança que o usuário vê (seção certa + "Onde fica…?" + atalhos) |
| `ROADMAP.md` | sim | Roadmap **público**: direção, o que há, o que vem. Para quem não acompanhou o desenvolvimento | Só quando muda o panorama (área nova, tema que entra/sai de "Próximos passos", decisão de escopo). Sem notas por versão e sem jargão interno |
| `ARQUITETURA.md` | sim | Mapa do código e princípios | Mudou pasta, conceito ou princípio |
| `CONVENCOES-QA.md` | sim | Especificação do formato QA-MD (embutida no MCP) | Mudou o formato |
| `exemplos/LEIA-ME.md`, `LEIA-ME-por-modulo.md` | sim | Tour da Loja Demo (conferido por testes) | Mudou menu ou fluxo citado; o por-módulo é conferido por `modules.test.mjs` |
| `CONTEXTO-CLAUDE.md` | sim | Este arquivo | Veja abaixo |
| `ROADMAP-INTERNO.md` | **não** (ignorado pelo git) | Roadmap **interno**: o que foi aprendido, decisões, pendências, análises a validar | A cada entrega; é a memória de trabalho |
| `BRAINSTORM.md` | **não** (ignorado pelo git) | Ideias sobre o futuro, com selos (💡 ideia, ✅ aceita → roadmap interno, 🌐 também no público) | O usuário escreve; ao aceitar uma ideia, levar para o `ROADMAP-INTERNO.md` (e o `ROADMAP.md` se 🌐) e trocar o selo |
| `CADERNO-DE-ATRITO.md` | **não** (ignorado pelo git) | Incômodos de uso, uma linha cada, com contagem de repetições | O usuário anota; triagem às sextas (ver 7.1 do roadmap interno). Durante a pausa (até 31/10/2026), pergunte antes de começar funcionalidade nova |
| `antigos/` | **não** (ignorado pelo git) | Documentos de fases anteriores (README, MANUAL, ROADMAP históricos, PLANEJAMENTO do MVP…) | Não atualizar; só consulta histórica |
| `src/changelog.js` | sim | Cartão "O que mudou" dentro do app (aqui sim, nota por versão) | Toda versão. O campo `manual:` é o início do título de uma seção do MANUAL — **não renomeie títulos de seção sem ajustar o changelog** |

Os documentos públicos descrevem **o estado atual**, sem citar versões antigas ("desde a 1.x", "antes da 1.x"). O histórico fica no `changelog.js` e no `ROADMAP-INTERNO.md`.

## Estado atual

- **Data de referência:** 12/10/2026. Fases 0–12 do roadmap interno concluídas (editor, execução, relatórios, MCP, integrações, layout por módulo, exemplos de todos os módulos).
- **Documentação reorganizada em 12/10/2026:** README, MANUAL, ROADMAP, ARQUITETURA e `exemplos/LEIA-ME.md` reescritos para o estado atual e sem versões antigas; os anteriores foram para `antigos/`.
- **13/10/2026:** tipo `teste-em-dupla` e comando **🤝 Teste em dupla do ticket** (`src/app/pairTest.js` + `src/markdown/pairTest.ts`). **Diário** (módulo *Dia*, `tipo: dia` em `diario/AAAA/MM/`, `src/app/diary.js` + `src/markdown/diary.ts`, visão `formato: semana`) e **Comparar JSON** (`src/app/jsonTool.js` + `src/markdown/jsonDiff.ts`, tela cheia, por partes acima de 1 MB). Pendente: reuniões do Outlook no diário (depende da empresa).
- **Diário opcional (1.67.0):** desligado numa pasta sem `diario/` (preferência `diary` em `src/app/diaryReminder.js`), com lembretes de começar/fechar o dia (app, computador e Teams, só com o app aberto).
- **Pasta oficial na nuvem (1.67.1, 20/10/2026):** no OneDrive do Mac, ler a oficial inteira em segundo plano travava abrir/salvar (o Chrome põe as operações de arquivo numa fila só). Regra: **nada lê a pasta oficial inteira sozinho** — `scanOfficial` só quando o usuário pede, um arquivo por vez, com Parar e vigia; o automático (documento aberto + travas) passa por `autoOfficial` em `src/app/collab.js`. **O diário nunca vai para a oficial** (1.67.2): `personalDoc` em `src/markdown/officialSync.ts` (pasta `diario/` ou `tipo: dia`) vale para publicar, ⇅, novidades, travas e histórico.
- **Teste de confirmação do bug (1.68.0, 20/10/2026):** o bug vira executável (`## Teste de confirmação`, `src/markdown/confirm.ts` + `src/app/confirm.js`) e entra na execução na seção `## Confirmação de bugs`, antes dos casos e contada à parte. `cycleTable` junta as duas tabelas: **use `row.cols` (não `t.cols`) e `row.confirm`** ao ler/gravar células da execução. `setFrontMatterStatus` não mexe no status de `tipo: bug`.
- **Próximo trabalho:** ver "Próximos passos" no `ROADMAP-INTERNO.md` — inclui uma **análise de redundâncias a validar** (nenhuma remoção decidida).
- **Pontos de atenção:** o MANUAL é importado pelo app (`import manualText from '../MANUAL.md?raw'`); `tests/unit/modules.test.mjs` confere "Onde fica…?" e todas as referências `Menu ▾ → item` / `Ctrl+Shift+P → texto` contra o registro de módulos.

## Stack e comandos

- Vite + JavaScript com `// @ts-check` (JSDoc) + módulos puros em `.ts`. CodeMirror 6 (Raw), markdown-it (Preview), turndown (Preview → Markdown).
- `npm run check` — tsc no app e no MCP (tem que passar sem erro).
- `npm test` — testes unitários (`tests/unit/*.test.mjs`, node:test via tsx). Um arquivo: `node --import tsx --test tests/unit/<arquivo>.test.mjs`.
- `npx playwright test` — testes de tela (`tests/e2e/*.spec.mjs`). Se pedir um navegador que não está baixado: `PW_CHROMIUM=…\ms-playwright\chromium_headless_shell-<n>\chrome-headless-shell-win64\chrome-headless-shell.exe`. Pasta de trabalho simulada com OPFS: `wsInit` em `tests/e2e/helpers.mjs` (`__write/__read/__ls`).
- `npm run build` (dist/ PWA) · `npm run build:single` (dist-single/index.html) · `npm run mcp:build` (`mcp-dist/qa-mcp.mjs` + `testflow.mcpb`) · `npm run skill` (`claude-skill/`) · `npm run extensao` · `npm run reporter`.

## Estrutura do código

| Pasta | O quê |
| --- | --- |
| `src/main.js` | Montagem do app: abas, salvar (`doSave`), atalhos, paleta e `switch` em `run()`, pasta de trabalho (`loadWorkspaceFiles`). |
| `src/ui/modules.js` | **Onde fica cada ação:** módulos (Arquivo, Casos, Execução, Evidências e bugs, Automação, Publicar, Compartilhar, Pasta, Editar e exibir, Ajuda) → menus do topo **e** categorias da paleta, os ⋯ do painel da rodada (`moreRefs` em `cyclePanel.js`) e da barra Execução (`EXEC_BAR_MORE`) e a tela inicial (`HOME_SHORTCUTS`). Ação nova: entra aqui + `case` no `run()`; `modules.test.mjs` confere. |
| `src/app/*` | Funcionalidades que usam o contexto `app` (`context.js`): `organize`, `collab`, `publishing`, `cycle`, `nextCase`, `execution`, `evidence`/`evidencePanel`, `place`, `linkPicker`, `idSync`, `views`, `templates`, `share`, `shared.js`… |
| `src/markdown/*.ts` | Lógica pura e testável: `frontmatter`, `structure`, `idRename`, `officialSync`, `publish`, `views`, `cycle`, `status`, `relink`, `wikilinks`, `jira`… |
| `src/io/*` | Disco: `fsOps` (diário/desfazer), `organizer`, `docIndex`, `publisher`, `versions`, `workspace`, `evidence`, `extBridge`. |
| `src/ui/*` | Componentes: `sidebar`, `dialog`, `commandMenu`, `runner`, `dashboard`, `shortcuts`… |
| `src/editor/*` | Preview editável, Raw, tabelas, barra de execução. |
| `src/templates/*.md` | Modelos de documento. |
| `mcp/` | Servidor MCP local: `nodefs.ts` adapta o fs do Node à File System Access API; `qa.ts` (lógica), `server.ts` (ferramentas `qa_*`). |
| `reporter/` | Reporter da automação (Playwright) e comando `importar` (JUnit/Playwright/Newman), via `QaWorkspace.attachAutomation`. |
| `extensao/` | Extensão do Chrome/Edge (console, rede, contexto, Jira API, Teams). Só páginas locais com `<meta name="testflow">` falam com ela. Lado do app: `src/io/extBridge.js`, `src/app/bugCapture.js`. Teste real: `PW_EXTENSAO=1 npx playwright test extensaoReal`. Subir a `version` de `extensao/manifest.json` se mudar. |
| `exemplos/` | A Loja Demo (Sprint 42 e Sprint 43/Pix). Geradores dos arquivos mais novos em `_local/exemplos-*` (só no Windows). Conferem: `exemplos.test.mjs`, `modules.test.mjs`, `tests/e2e/exemplos.spec.mjs`. O usuário marca os roteiros: ao mudar arquivos existentes de `exemplos/`, avise. |

Pasta de trabalho do usuário: `_entrada/`, `aplicacoes/<App>/{casos[/<ÉPICO>/<TICKET>],bugs,planos,sessoes,relatorios,requisitos,docs}`, `processos/`, `modelos/`, `visoes/`, `configuracao/`, `.versoes/`, `_lixeira/`.

## Conceitos importantes

- **`uid:`** no cabeçalho = identidade fixa. Links ficam legíveis (`[[TC-042]]`); trocar o `id:` reescreve título/menções e os `[[links]]` da pasta (editor no Ctrl+S, MCP em `qa_atualizar_cabecalho`; trocas feitas fora são detectadas pelo mapa uid→id).
- **Pasta oficial** (compartilhada) × pasta de trabalho (do usuário): publicar dá revisão (`revisao`, `publicado_*`); ⇅ Sincronizar traz/envia em lote; conflitos ficam de fora.
- **Ciclo** (definição) × **execução** (ocorrência) × rodada avulsa.
- Operações em vários arquivos usam o **diário** (`fsOps`) + `organizer.remember/undo` para o **Desfazer**.

## Nome do app

O app se chama **TestFlow** (nome visível vem de `branding.json`; ícones em `public/icons/`). **Identificadores internos ficaram com o nome antigo de propósito** — trocar apagaria dados ou duplicaria a extensão: chaves `mdqa:*` (localStorage), banco `md-qa-editor` (IndexedDB), ids dos seletores de pasta `mdqa-*`, id do MCP `markdown-qa` (ferramentas `qa_*`), skill `qa-markdown` e o formato **QA-MD**.

## Rotina de entrega de uma versão

1. Implementar + testes (unitário para a lógica pura, e2e para o fluxo na tela).
2. Subir a versão em `package.json` e `package-lock.json` (2 lugares).
3. Entrada nova no topo de `src/changelog.js` (`manual:` = início do título da seção do MANUAL).
4. **Atualizar o teste do "O que mudou"** em `tests/e2e/editor.spec.mjs` (prefs `version` = uma versão anterior e os textos esperados) — ele quebra a cada versão.
5. Documentar: `MANUAL.md` (seção certa + "Onde fica…?" + atalhos), `README.md` se mudar instalação/módulos; `CONVENCOES-QA.md` e `scripts/skill-intro.md` se mudar o formato; se mudar o MCP, a descrição em `mcp/server.ts` e a seção 12.6 do MANUAL. **Nota da versão em `ROADMAP-INTERNO.md`** (o quê, por quê, aprendizados). `ROADMAP.md` público só se o panorama mudou. Documentos públicos sem citar versões.
6. `npm run check` · `npm test` · `npx playwright test` · `npm run mcp:build` · `npm run skill` · `npm run extensao` · `npm run reporter` · `npm run build` · `npm run build:single`.
7. Avisar o usuário se precisa reinstalar `mcp-dist\testflow.mcpb` no Claude desktop (só quando o MCP mudou) ou recarregar a extensão.
8. **Entregar pelo Git:** commit na pasta do Windows (repositório `lucassiman/testflow`, branch `main`); o usuário faz `git push` (ou autoriza o push na sessão); no Mac: `git pull` + `npm install` + `npm run app`. Nunca mandar zip para copiar por cima. `_local/`, `antigos/` e `ROADMAP-INTERNO.md` não sobem.

## Manter este arquivo em dia

Ao terminar **qualquer** tarefa que mude comportamento, estrutura, comandos, decisões ou o mapa de documentos, antes de encerrar:

1. Atualize a seção **Estado atual** (data, o que mudou de relevante, próximo trabalho, pontos de atenção) — poucas linhas, sem histórico longo.
2. Atualize **Mapa de documentos**, **Estrutura do código** ou **Conceitos** se algo mudou de lugar.
3. Registre o detalhe (decisão, aprendizado, pendência) no `ROADMAP-INTERNO.md`, não aqui. Aqui fica só o que uma sessão nova precisa para começar sem ler mais nada.
4. Não grave aqui números que envelhecem (versão, quantidade de testes) — aponte para a fonte (`package.json`, `npm test`).
5. Se este arquivo passar de ~150 linhas, enxugue: mova o histórico para o `ROADMAP-INTERNO.md`.

## Estilo das respostas ao usuário

Português do Brasil, direto: o que mudou, como usar (onde clicar), o que fica de fora/limites. Sem passo a passo do que foi feito por dentro.
