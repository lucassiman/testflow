# Pedidos ao Claude — um por ferramenta

Com o **MCP do TestFlow** ligado no Claude desktop (Manual, 12.6) e esta pasta `exemplos` como a pasta de trabalho dele, o Claude lê e escreve os documentos da Loja Demo pelas ferramentas `qa_*` — com as mesmas regras do editor: o próximo ID, a pasta certa, a versão anterior guardada em `.versoes/` e nada apagado nem publicado na pasta oficial.

Abaixo, um pedido pronto para **cada uma** das ferramentas, com os documentos desta pasta. Copie, cole no Claude e veja o que volta; o editor aberto percebe a mudança e oferece recarregar.

> [!TIP]
> Você não precisa saber o nome da ferramenta: peça como pediria a uma pessoa. A coluna **Ferramenta** só mostra qual o Claude vai usar. Onde o pedido grava algo, ele mostra a prévia ou pergunta antes (as ferramentas marcadas com ⚠ pedem confirmação).

> [!NOTE]
> Os pedidos com arquivo usam o caminho desta pasta no Windows (`C:\dev\markdown qa editor\exemplos\…`). No Mac, ou se a pasta estiver em outro lugar, troque pelo caminho certo: `Ctrl+Shift+P` → *Onde fica a pasta de trabalho no computador* mostra o caminho para copiar.

## 📂 Pasta de trabalho — orientar-se e achar

| Ferramenta | Peça assim | O que volta |
| --- | --- | --- |
| `qa_visao_geral` | *"Me dá uma visão geral da pasta de QA."* | Quantos documentos por tipo e status, a entrada e as visões salvas |
| `qa_convencoes` | *"Leia as convenções do QA-MD e me diga as 3 regras que mais importam para um caso de teste."* | As regras do formato (cabeçalho, status, passos, evidências) |
| `qa_listar` | *"Liste os bugs com status FAIL e a tag pix."* | Tabela com [[BUG-002]], [[BUG-003]] e [[BUG-004]] |
| `qa_buscar` | *"Procure 'copia e cola' em todos os documentos."* | Arquivos e linhas — acha o [[TC-010]] e o [[BUG-004]] |
| `qa_consultar` | *"Quais casos do épico QA-400 nunca foram executados?"* | A mesma consulta das visões (`tipo: caso-de-teste`, `segmento: QA-400`, `execucao: nunca`) — o [[TC-011]] |
| `qa_ler` | *"Leia o BUG-004 e me diga o que a extensão do navegador capturou."* | Cabeçalho interpretado, o resumo *Console e rede*, a reincidência e quem cita |
| `qa_validar` | *"Valide a pasta inteira: links quebrados e evidências faltando."* | Os avisos do app, documento por documento |
| `qa_varredura` | *"Varra a pasta atrás de documentos sem vínculos — só o relatório, sem aplicar."* | Achados com ✅ certo / 🟡 provável / ❓ confirmar |
| `qa_ligar` | *"Ponha na história QA-420 o link para o TC-011."* | O `[[TC-011]]` na [[QA-420]], sem mexer no resto |
| `qa_rastreabilidade` | *"Mostre a rastreabilidade do épico QA-400."* | História → casos → último resultado → bugs |

## 📋 Casos

| Ferramenta | Peça assim | O que volta |
| --- | --- | --- |
| `qa_compartilhados` | *"Quais logins e passos compartilhados valem para o TC-011?"* | Os logins do [[COMP-001]] (sem as senhas), o bloco `↪ Fazer login` e o *antes de cada caso* |
| `qa_criar` | *"Crie o caso 'Pagar com Pix pelo app do banco no celular' para a QA-410, épico QA-400, tags pix e mobile."* | `TC-012` novo, do modelo, com os avisos da validação |
| `qa_preparar_ambientes` | *"Prepare no COMP-001 a massa do ambiente DEV — sem inventar valores."* | As tabelas `(dev)` com as chaves prontas e os valores em branco, para você preencher |
| `qa_aprovacao` | *"Coloque o TC-009 em revisão com a Ana."* | O [[TC-009]] passa de rascunho para *em revisão* ⚠ (aprovar, só com o seu pedido) |
| `qa_editar_em_massa` | *"Mude a prioridade dos casos da QA-420 para Alta — me mostre a prévia antes."* | A prévia; com o seu OK, grava ⚠ |
| `qa_importar_casos` | *"Importe os casos de C:\dev\markdown qa editor\exemplos\importar\casos-testrail.csv na aplicação Loja Demo — primeiro só a prévia."* | 4 casos reconhecidos (C201–C204), as colunas que ficam de fora; com o seu OK, cria ⚠ |
| `qa_atualizar_cabecalho` | *"Mude o responsável do TC-011 para a Ana."* | O campo trocado (a versão anterior fica em `.versoes/`) |

## ▶ Execução

| Ferramenta | Peça assim | O que volta |
| --- | --- | --- |
| `qa_rodada_status` | *"Como está a execução #3 da Regressão do Pix?"* | Progresso, % de sucesso, pendentes, falhas com os bugs e a previsão |
| `qa_pendencias` | *"O que está pendente para a Ana nas rodadas em andamento?"* | Os casos dela ainda sem resultado na [[EXEC-20261008-084500]] (o TC-008), com o tempo previsto |
| `qa_rodada_atribuir` | *"Redistribua os pendentes da execução #3 entre Ana e Bruno pelo tempo previsto."* | A coluna Testador atualizada e a carga de cada um |
| `qa_rodada_registrar` | *"Na execução #3, o TC-008 passou em todos os passos: o extrato mostra um lançamento só."* | O caso marcado, a rodada do caso concluída e a execução atualizada |
| `qa_marcar_passos` | *"No TC-011, marque os passos 1 a 3 como PASS."* | Status e resumo do caso atualizados |
| `qa_nova_rodada` | *"Prepare o TC-010 para uma nova rodada."* | A tabela atual arquivada no *Histórico de execuções* e limpa |
| `qa_resumo_execucao` | *"Quais passos falharam no TC-010 e por quê?"* | Os passos FAIL/BLOCKED com esperado, obtido e os prints |
| `qa_rodada_criar` | *"Crie a execução #4 do ciclo Regressão do Pix."* | A execução nova do [[CICLO-20260923-1030]], com os vínculos dele |
| `qa_rodada_finalizar` | *"Finalize a execução #3."* | SKIP nos pendentes, o encerramento e os 4 relatórios ⚠ (depois de finalizada, não muda mais) |
| `qa_relatorios` | *"Gere de novo os relatórios da execução #2."* | Os 4 relatórios de `relatorios/EXEC-20261001-083000/`, mantendo a decisão do time |
| `qa_release` | *"A release 2.15.0 está pronta para sair?"* | O progresso da [[REL-001]], os critérios de saída do [[PT-002]] e se dá Go |
| `qa_tendencia` | *"Como a qualidade evoluiu nas rodadas da Sprint 43? Tem teste instável?"* | % de sucesso por rodada, casos que mais falham e os testes automatizados instáveis |

## 📸 Evidências e bugs

| Ferramenta | Peça assim | O que volta |
| --- | --- | --- |
| `qa_bug_do_caso` | *"O TC-006 falhou no passo 4: abra o bug."* | Como o [[TC-006]] já tem o [[BUG-002]], ele não duplica: pergunta se é **reincidência** (`reincidencia: "BUG-002"`) ou bug novo |
| `qa_ver_evidencia` | *"Mostre o print do passo 3 do TC-010."* | A imagem, para o Claude descrever ou comparar |
| `qa_anexar_evidencia` | *"Anexe ao BUG-004 o arquivo C:\Users\voce\Downloads\pedido-10688.png como evidência do passo 3."* | O arquivo copiado para `bugs/evidencias/` e o link na seção Evidências |

## 🤖 Automação

| Ferramenta | Peça assim | O que volta |
| --- | --- | --- |
| `qa_anexar_automacao` | *"Anexe o resultado C:\dev\markdown qa editor\exemplos\automacao\noturno\2026-10-09-pix-noturno.json numa execução nova."* | Uma execução automatizada com os testes, os casos ligados (TC-005…TC-008) e os ⚠ instáveis |
| `qa_exportar_feature` | *"Exporte o CEN-001 como .feature para o repositório da automação."* | O conteúdo e o nome sugerido (`cen-001-carrinho-de-compras.feature`) — o mesmo de `automacao/features/` |

## 🏛 Publicar — revisão e versões

| Ferramenta | Peça assim | O que volta |
| --- | --- | --- |
| `qa_comentar` | *"Revise os casos da QA-420 com o checklist de qualidade e deixe as sugestões como comentário."* | Um `[!COMMENT] @Claude` em cada caso — foi assim que nasceu o comentário (já resolvido) do [[TC-011]] |
| `qa_versoes` | *"Quais versões do TC-008 estão guardadas?"* | A lista de `.versoes/`, com a aprovada |
| `qa_comparar_versoes` | *"O que mudou no TC-008 desde a aprovação?"* | O passo 5 alterado e o diff (é o ⚠ *aprovado · alterado* da pílula) |
| `qa_restaurar_versao` | *"Volte o TC-008 para a versão aprovada."* | O documento como foi aprovado; o atual fica em `.versoes/` ⚠ |

## 📤 Compartilhar — Jira

| Ferramenta | Peça assim | O que volta |
| --- | --- | --- |
| `qa_para_jira` | *"Prepare o BUG-004 para o Jira."* | Resumo `[BUG-004] …`, prioridade, descrição (Markdown e wiki do Jira) e os anexos: o print, o vídeo do replay, os `.log` e os `.har`. Com o conector da Atlassian ligado: *"abra no Jira e grave a chave"* |
