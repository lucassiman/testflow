---
name: qa-varredura
description: Varre a pasta de QA do TestFlow (aplicacoes/) atrás de casos, bugs, histórias, execuções e relatórios antigos sem os vínculos (app, ticket/jira, épico, tags e sprint herdadas, bug sem caso, caso sem requisito, arquivo fora da pasta do épico/ticket) e de login/preparação repetidos e senhas escritas nos casos (leva para um compartilhado), e corrige com o OK do usuário. Use quando o usuário pedir para "organizar", "varrer", "revisar os vínculos", "arrumar documentos antigos" ou "preparar a pasta para os segmentos/relatórios" ou "converter para o formato de compartilhados".
---

# Varredura de vínculos (TestFlow)

O TestFlow junta tudo o que nasceu de um épico, ticket, execução ou ciclo (**segmento**: busca `seg:PORTAL-10`, relatórios de fim de execução, rastreabilidade) **a partir do cabeçalho e da pasta** de cada documento. Documentos antigos — de antes da herança, importados do Notion, escritos à mão — muitas vezes não têm esses vínculos, e aí ficam fora do segmento, da rastreabilidade e das métricas. Esta skill encontra e corrige isso **sem inventar**.

## Regras

1. **Relatar antes de mudar.** Primeiro a lista do que falta; aplicar só depois do OK do usuário (ele pode aprovar por grupo).
2. **Só preencher o que está vazio e somar tags.** Nunca trocar um `jira:`, `epico:` ou `app:` que já existe — se parecer errado, aponte como "confirmar".
3. **Confiança de cada sugestão:**
   - ✅ **certo** — sai da pasta (`aplicacoes/<App>/casos/<ÉPICO>/<TICKET>/`) ou de um campo do pai sem ambiguidade (a história `PORTAL-120` tem `epico: PORTAL-10`). Pode aplicar em lote.
   - 🟡 **provável** — herança de boa prática (tags e sprint do épico/história/caso; épico em comum dos casos de uma execução). Mostre e aplique se o usuário concordar.
   - ❓ **confirmar** — não dá para deduzir (bug sem caso ligado, caso sem requisito, história sem épico, sem `id:`). Pergunte; nunca chute.
4. **Mover arquivos** (para a pasta do épico/ticket) é feito **no app**: clique direito em `casos/` → **🎫 Organizar por épico e ticket** — ele leva links, prints e anexos junto e tem Desfazer. Não mova à mão.
5. **Relatórios antigos** (de execuções sem tags/vínculos): depois de corrigir a execução, gere de novo (`qa_relatorios` ou 📑 Relatórios no app) — o que o QA escreveu no aceite fica.
6. Toda gravação pelo MCP guarda a versão anterior em `.versoes/`.
7. **Passos e dados repetidos** (formato novo de compartilhados): `qa_varredura { modo: "compartilhados", app | pasta }` acha login/preparação repetidos (a mesma sequência em 3+ casos — `min_casos` muda) e e-mail/senha/URL escritos à mão, e propõe o compartilhado (dados com senha, bloco `↪` com parâmetro, escopo pela pasta em comum dos casos). Mostre o resumo (sem senhas) e, com o OK: `aplicar: "certo"` cria o compartilhado e troca as sequências por **uma** linha `↪ Bloco (dado)` (status e obtido juntados, `#` renumerado); `aplicar: "provavel"` troca também os dados soltos por `{{dado}}`. Os ❓ (senha na Massa de dados, senha sem usuário ao lado) ficam com o usuário — sugira levar para o compartilhado. Senha escrita num caso é sempre item a corrigir.

## Com o MCP do TestFlow (ferramentas `qa_*`)

1. `qa_visao_geral` para ver aplicações e volume. Pasta grande: faça **uma aplicação por vez** (`app: "Portal"`).
2. `qa_varredura { app: "Portal" }` — relatório agrupado por documento, cada item com ✅/🟡/❓ e o porquê.
3. Mostre ao usuário um **resumo** (quantos certos, prováveis e a confirmar; os 5–10 exemplos mais relevantes) e pergunte:
   - aplicar os ✅ certos? → `qa_varredura { app, aplicar: "certo" }`
   - aplicar também os 🟡 prováveis? → `qa_varredura { app, aplicar: "provavel" }`
4. Para os ❓ confirmar, proponha a resposta quando houver indício — por exemplo, o bug órfão cujo título/obtido bate com um caso (`qa_buscar` pelo texto do erro), o caso sem ticket que está junto de outros do mesmo ticket — e, com o OK, grave com `qa_atualizar_cabecalho` (campos `jira`, `epico`, `tags`) ou ligue com `qa_ligar { doc: "BUG-2", alvo: "TC-14" }` (põe "Encontrado em [[TC-14]]" no Resumo do bug). Depois de ligar, rode a varredura de novo: o bug passa a herdar épico/tags do caso.
5. Rode `qa_varredura` de novo para confirmar que sobrou só o que depende do usuário, e `qa_validar { app }` para links quebrados e evidências faltando.
6. Feche com: o que foi aplicado (por tipo), o que ficou para o usuário decidir, e o lembrete de **🎫 Organizar por épico e ticket** no app se houver itens "mover".
7. Pastas com casos antigos (antes dos compartilhados): rode também `qa_varredura { modo: "compartilhados", app }` (regra 7) — uma aplicação por vez.

## Sem o MCP (arquivos à mão ou anexados)

Leia os `.md` de `aplicacoes/<App>/` e verifique, por documento:

| Documento | O que deve ter | De onde tirar |
| --- | --- | --- |
| Todos em `aplicacoes/<App>/` | `app: <App>` | a pasta |
| Caso (`caso-de-teste`, `cenario-bdd`, `checklist`) | `jira:` (ticket) e `epico:` | pasta `casos/<ÉPICO>/<TICKET>/`; a história do ticket (`tipo: historia`, campo `epico:`) |
| Caso | tags e sprint do épico/história | cabeçalho do épico e da história |
| História | `epico:` | pasta do épico; o épico que a cita |
| Bug | um `[[caso]]` no texto (ou um caso que cite o bug); `epico:`, tags e sprint do caso | o caso; **o `jira:` do bug é a chave dele, não a do caso** |
| Execução (`tipo: execucao`) | tags/épico/ticket que todos os casos dela têm | os casos da tabela "Casos do ciclo" |
| Relatório (`relatorio-*`) | as tags/vínculos da execução (`execucao:`) | regerar |

Entregue a mesma tabela de achados (✅/🟡/❓ + porquê) e, com o OK, as edições só nos cabeçalhos (sem mexer no corpo), mantendo listas no formato `[a, b]`.
