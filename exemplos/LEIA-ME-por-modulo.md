# Exemplos por módulo — um roteiro curto para cada menu

A mesma Loja Demo do [LEIA-ME](LEIA-ME.md) (Sprint 42, versão 2.14.0) continua na **Sprint 43**: o épico **QA-400 Pagamento com Pix**, da versão **2.15.0**. Aqui os exemplos estão organizados pelos **mesmos módulos do topo do app** — **Dia · Casos · Execução · Evidências · Automação · Publicar · Compartilhar** —, com o que olhar e um roteiro curto em cada. O tour de 15 minutos do `LEIA-ME.md` continua valendo.

> [!TIP]
> **Antes de começar:** abra esta pasta `exemplos` como pasta de trabalho (`☰` → aba **Arquivos** → **Abrir…**). Nas preferências, use **Lucas** como o seu nome: a Ana, o Bruno e o Lucas dividem a execução #3, e o filtro **Minhas** mostra os casos do Lucas.

> [!NOTE]
> Alguns exemplos não são `.md` e não aparecem na árvore do app: a pasta `acompanhamento/` (páginas da rodada e cartões do Teams), `automacao/` (relatórios, `.feature`, `playwright.config.ts`) e os vídeos, logs e HAR de `bugs/evidencias/`. Abra-os pelo Explorer do Windows (ou pelo Finder): as páginas `.html` abrem no navegador, os `.json` e o `.feature` em qualquer editor de texto.

## A história, em ordem

| Quando | O que aconteceu | Onde ver |
| --- | --- | --- |
| 22 e 23/09 | Os casos do Pix escritos; o [[TC-006]] em revisão; o ciclo *Regressão do Pix* salvo | `casos/QA-400 Pagamento com Pix/`, [[CICLO-20260923-1030]] |
| 24/09 | Execução #1 (Sprint 42): o estorno ainda não estava no HML — [[TC-008]] bloqueado | [[EXEC-20260924-140000]] |
| 01/10 | Execução #2: o [[TC-006]] e o [[TC-008]] falham → [[BUG-002]] e [[BUG-003]]; relatórios com a decisão *Não liberar* | [[EXEC-20261001-083000]], `execucoes/relatorios/`, `acompanhamento/` |
| 07 a 09/10 | Automação toda noite: o teste do TC-005 alterna PASS e FAIL — **instável** | `execucoes/execucao-automatizada-…`, `automacao/noturno/` |
| 08/10 | Execução #3 em andamento, dividida entre Ana, Bruno e Lucas | [[EXEC-20261008-084500]] |
| 09/10 | Smoke com matriz, pronto para executar; o [[TC-010]] (copia e cola) aprovado | [[CICLO-20261009-1400]] |
| 10/10 | O [[TC-010]] falha → [[BUG-004]] com print, vídeo do replay, console e rede; o [[TC-011]] em revisão, com comentários | [[BUG-004]], [[TC-011]] |
| 11/10 | Build rc3: o BUG-004 corrigido e fechado | [[BUG-004]] → *Andamento* |
| 12/10 | Com cupom no pedido, o defeito volta → **reincidência**, BUG-004 reaberto | [[BUG-004]] → *Reincidências* |

## 📅 Dia — o seu diário

| Onde olhar | O que mostra |
| --- | --- |
| `diario/2026/10/2026-10-09.md` | Um dia do Lucas: foco, tarefas (com prazo 📅 e ligadas a [[BUG-003]], [[TC-011]]), duas reuniões com *Decisões* e *Ações* e o fechamento do dia |
| `visoes/semana.md` | A semana: em aberto (atrasadas primeiro, há quantos dias rodam), agendadas, feitas e as decisões das reuniões |

**Roteiro:**

- [ ] **Dia ▾ → ☀ Começar o dia**: a nota de hoje nasce com as tarefas que ficaram abertas no dia 09/10 (`↪ desde 09/10`); no dia 09, elas viram `↪ … (passou para …)`
- [ ] Abra um caso qualquer e aperte `Alt+T`: escreva `Conferir o QR expirado @amanhã` — a tarefa vai para o dia, ligada ao caso, sem sair dele
- [ ] **Dia ▾ → 👥 Reunião…** com `16:00 Alinhamento do Pix`: o bloco entra em *Reuniões* com *Decisões* e *Ações*
- [ ] **Dia ▾ → 🌙 Fechar o dia…**: escolha *Feita*, *Fica para amanhã*, *Outra data* ou *Descartar* em cada tarefa
- [ ] **Dia ▾ → 📅 Semana** (abre `visoes/semana.md`)

## 📋 Casos

| Onde olhar | O que mostra |
| --- | --- |
| [[COMP-001]] | Logins geral / HML / PROD, endereços e o bloco `↪ Fazer login`; o gestor só tem conta no HML (**falta PROD**) |
| `casos/QA-400 Pagamento com Pix/` | O épico na pasta dele, uma pasta por ticket ([[QA-410]], [[QA-420]]) com a história e os casos. História sem ticket: [[HU-001]] |
| [[TC-008]] · [[TC-007]] · [[TC-009]] | Dois logins no mesmo caso; caso com dados pela tabela *Iterações* (3 valores) e pelo `iterar:` dos logins |
| [[TC-005]] · [[TC-006]] · [[TC-009]] · [[TC-008]] · [[TC-010]] | Aprovação: aprovado · em revisão · rascunho · **⚠ aprovado · alterado** · aprovado (o TC-010 nasceu do pedido da Ana na revisão do TC-006) |
| `importar/casos-testrail.csv` | Exportação do TestRail para importar (4 casos, passos separados) |

**Roteiro:**

- [ ] Abra o `TC-008` e aperte `Alt+K`: os logins do HML. Troque o 🌐 no topo para **PROD** — os dados mudam e o gestor aparece com *falta PROD*
- [ ] No `TC-007`, clique em **▶ Executar**: uma execução por linha da tabela *Iterações* (1/3)
- [ ] No `TC-008`, clique na pílula **⚠ aprovado · alterado** → *Ver o que mudou desde a aprovação*
- [ ] **Casos ▾ → 📥 Importar casos de uma planilha…** e escolha `importar/casos-testrail.csv` (veja a prévia; pode cancelar)

## ▶ Execução

| Onde olhar | O que mostra |
| --- | --- |
| [[CICLO-20260923-1030]] | Ciclo salvo *Regressão do Pix* com as 3 execuções |
| [[EXEC-20261008-084500]] | Rodada em andamento: testadores, **⏱ previsão**, ⏮ *Antes da rodada*, caso com 1/3 iterações e os status `FALHA CONHECIDA` e `RETESTE` (de `configuracao/status.md`) |
| `execucoes/relatorios/EXEC-20261001-083000/` | Os 4 relatórios da execução #2 — *Não liberar*, com a decisão do time no aceite |
| [[CICLO-20261009-1400]] | Ciclo com **matriz** (3 configurações), sem execução — para você executar |
| [[REL-001]] · `visoes/` | A release 2.15.0 e as visões (não executados, cobertura, rastreabilidade, tendência) |
| `acompanhamento/index.html` | **Página da rodada para o time** — o que o PO abre na pasta oficial: a #2 encerrada (com a recomendação) e a #3 em andamento (se recarrega sozinha) |
| `acompanhamento/teams-rodada-encerrada.json` · `teams-caso-critico.json` | Os **cartões do Teams**: 🏁 rodada encerrada (#2) e ❌ caso crítico falhou ([[TC-010]], prioridade Alta) |

**Roteiro:**

- [ ] Abra a `regressao-do-pix-execucao-3`: o painel da rodada mostra quem testa cada caso (A, B, L), a previsão e o *Antes da rodada*
- [ ] **Execução ▾ → 📈 Tendência entre rodadas**: % de sucesso por rodada, os casos que mais falham e os **testes instáveis** da automação
- [ ] Pelo Explorer, abra `acompanhamento/index.html` no navegador e clique nas duas rodadas
- [ ] Veja como liga a página e os avisos: **Execução ▾ → 🌐 Página da rodada para o time…** e **Execução ▾ → 📣 Avisos no Microsoft Teams…**. Para ver um cartão como no Teams, cole o que está em `content` do `.json` no designer de Adaptive Cards (adaptivecards.io/designer)
- [ ] No `smoke-do-pix-multiplataforma`, clique em **▶ Executar este ciclo**: nasce uma execução por configuração

## 📸 Evidências e bugs

| Onde olhar | O que mostra |
| --- | --- |
| [[BUG-004]] | Bug criado no passo que falhou com a **captura pela extensão** e o **replay instantâneo** ligados: o print do passo, o 🎬 vídeo, a tabela *Ambiente* com URL, Sistema e Tela, o resumo **Console e rede** e a chave do Jira |
| `bugs/evidencias/…-console.log` · `…-rede.har` | O console completo da aba e as requisições com falha — o token, o CPF e o e-mail saem **mascarados** |
| [[BUG-004]] → *Reincidências* | O mesmo defeito de novo (12/10, Edge, com cupom): entrou no bug existente, que voltou de `PASS` para `FAIL` |
| [[TC-010]] | O caso das 3 rodadas (FAIL, PASS, FAIL), com o print do passo 3 |
| [[BUG-002]] · [[BUG-003]] | Bugs achados numa rodada: guardam `execucao:` e `ciclo:` |

**Roteiro:**

- [ ] Abra o `BUG-004`: a tabela *Ambiente*, o print, o 🎬 replay e o *Console e rede*
- [ ] Clique em **📎 Requisições com falha (HAR)** e procure `cpf`, `email` e `token` — estão mascarados
- [ ] Desça até *Reincidências*: o defeito voltou e o bug reabriu
- [ ] No `TC-010`, **Evidências ▾ → 🐞 Novo bug ligado a este documento…**: como o caso já tem bug, o app oferece **Registrar no bug escolhido** em vez de duplicar (pode cancelar)
- [ ] Para capturar de verdade: instale a extensão (Manual, 8.3) e ligue **Evidências ▾ → Captura pela extensão: ligar/desligar** e **Evidências ▾ → Replay: duração ou desligar…**

## 🤖 Automação

| Onde olhar | O que mostra |
| --- | --- |
| `execucoes/execucao-automatizada-loja-demo-e2e-…` (07, 08 e 09/10) | Uma execução por noite, gravada pelo reporter: os testes, os casos manuais ligados (TC-005 a TC-008) e o **⚠ instável** |
| `automacao/noturno/*.json` | Os mesmos 3 resultados do Playwright — o do TC-005 alterna PASS → FAIL → PASS; o do comprovante passou só no retry |
| `automacao/playwright.config.ts` | O projeto de automação com o **reporter do TestFlow** (o resultado vai direto para a execução) |
| `automacao/features/cen-001-carrinho-de-compras.feature` | Os cenários do [[CEN-001]] exportados como `.feature` |

**Roteiro:**

- [ ] Abra a `execucao-automatizada-loja-demo-e2e-09-10-2026`: o teste do TC-005 com **⚠ instável: 2 trocas PASS↔FAIL em 3 execuções** e o do comprovante, *passou só com retry*
- [ ] Arraste `automacao/noturno/2026-10-08-pix-noturno.json` para o editor: relatório pronto, com as falhas e os anexos
- [ ] Abra o `CEN-001` e use **Automação ▾ → Exportar .feature deste documento…** — compare com `automacao/features/`
- [ ] **Automação ▾ → ⚡ Reporter ao vivo — como ligar…**: o mesmo trecho do `playwright.config.ts`, já com o caminho da sua pasta

## 🏛 Publicar — revisão e versões

| Onde olhar | O que mostra |
| --- | --- |
| [[TC-011]] | Caso **em revisão** com dois comentários: o do Claude (respondido e **resolvido**) e o da Ana (**pendente**) |
| [[TC-008]] | O histórico de versões com a versão aprovada de 30/09 |

**Roteiro:**

- [ ] Abra o `TC-011`: a pílula **💬 1** no topo; o comentário resolvido fica apagadinho
- [ ] Passe o mouse no comentário da Ana: **↩** responde, **✓** resolve. Para deixar o seu: **Publicar ▾ → 💬 Comentar** (`Alt+M`)
- [ ] **📊 Painel → 💬 Comentários**: só os documentos com comentário pendente
- [ ] No `TC-008`, **Publicar ▾ → 🕘 Histórico de versões…**: a versão aprovada, para comparar ou restaurar

> [!NOTE]
> **Publicar na pasta oficial** precisa de uma pasta compartilhada configurada (`☰` → 🏛 Oficial). É lá que a página da rodada fica para o time.

## 📤 Compartilhar — Jira, Claude e dados sensíveis

| Onde olhar | O que mostra |
| --- | --- |
| [[BUG-004]] | `jira: QA-433` e `jira_status: Reaberto (em andamento)` — o ticket criado e o status trazido pelo **Jira pela API** (extensão) |
| `recursos/pedidos-ao-claude.md` | Um pedido pronto para **cada** ferramenta `qa_*` do Claude (MCP), com os documentos desta pasta |
| `recursos/dados-sensiveis.md` | A área de teste da proteção de dados sensíveis |

**Roteiro:**

- [ ] No `BUG-004`: **Compartilhar ▾ → 🟦 Copiar para o Jira** e cole num e-mail — os anexos (print, vídeo, log e HAR) aparecem no aviso
- [ ] Veja como o `jira_status` chega: **Compartilhar ▾ → Trazer o status dos bugs (API)** (com a extensão e o Jira configurados — Manual, 12.7)
- [ ] Com o MCP ligado no Claude desktop, mande um pedido de `recursos/pedidos-ao-claude.md` — por exemplo, *"como está a execução #3 da Regressão do Pix?"*

## 📂 Pasta de trabalho

- [ ] **📊 Painel** (aba Arquivos): filtre por *Bug* — o BUG-004 aberto de novo
- [ ] `Ctrl+Shift+F` → `tag:pix status:FAIL`: os casos e bugs do Pix com falha
