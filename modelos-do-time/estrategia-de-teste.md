---
tipo: documentacao
id: EST-000
titulo: Estratégia de teste do time
app:
versao: 1
responsavel:
data: {{data}}
tags: [estrategia, processo]
qa-md: 1
---

# EST-000 — Estratégia de teste do time

> [!NOTE]
> Uma página que diz **como o QA trabalha aqui**: o que testamos, até onde, quando paramos e o que fica com o dev. Serve para os dois QAs decidirem do mesmo jeito, para quem cobre férias e para quem chega no time. O texto abaixo é um **ponto de partida** — troque pelo que vocês fazem de verdade e revise a cada trimestre. Guarde em `processos/`.

## Contexto

- Aplicações:
- Fluxo do time: Kanban — colunas até a produção:
- Limite de WIP na coluna de teste:
- Ambientes: Local (dev) → DEV → HML → PROD
- QAs e o foco de cada um:

## O que o QA testa e o que fica com o dev

| Nível | Quem | Como |
| --- | --- | --- |
| Unitário / componente | Dev | No pipeline; o QA não repete |
| API / integração | Dev; QA quando o ticket muda contrato ou regra | Postman/Newman; o resultado vai para a execução |
| E2E / tela (sistema) | QA | Casos no TestFlow; os estáveis e repetitivos viram Playwright |
| Aceite / negócio | QA + PO | Critérios de aceite da história; cenários BDD quando a regra é complexa |
| Não funcional | Só quando o ticket pede | Com critério escrito (ex.: carrega em < 3 s, WCAG AA) |

## O caminho de um ticket pelo QA

1. **Entrada (Definition of Ready):** história revisada (revisão de requisito quando a regra é nova ou ambígua), critérios de aceite verificáveis, massa de dados conhecida.
2. **Casos:** escritos a partir dos critérios, com o risco (tag `risco-*`) e a prioridade; revisados pelo outro QA antes de valer para regressão.
3. **Teste em dupla:** com o dev, no ambiente local dele, antes de subir (~15 min).
4. **DEV/HML:** execução dos casos do ticket; toda falha não corrigida na hora vira bug ligado ao caso.
5. **Saída (Definition of Done do QA):** casos do ticket executados, nenhum bug Crítico ou Alto aberto, critérios de aceite marcados, casos que devem continuar valendo com a tag `regressao`.

## Regressão

- **Quando:** a cada entrega para PROD (release ou deploy), não por sprint.
- **O quê:** `risco-alto` sempre; `risco-medio` se der tempo; `risco-baixo` por amostra ou pela automação.
- **Antes de começar:** checklist de smoke no ambiente; ambiente quebrado bloqueia a rodada, não o QA.
- **Automação primeiro para:** casos estáveis, de risco alto e que rodam em toda entrega.

## Severidade e prioridade dos bugs

| Severidade | Quando usar |
| --- | --- |
| Crítica | Para o sistema ou um fluxo principal, perde ou corrompe dado, falha de segurança, sem contorno |
| Alta | Fluxo importante quebrado, contorno difícil, regra de negócio errada |
| Média | Funciona com contorno; erro em fluxo secundário |
| Baixa | Cosmético, texto, alinhamento |

**Severidade** é do QA (quanto dói). **Prioridade** é do time/PO (quando corrigir).

## Critérios padrão (quando o plano não disser outros)

- **Entrada da rodada:** build no ambiente, smoke passou, massa pronta.
- **Saída da rodada:** nenhum bug Crítico ou Alto aberto · 100% dos casos executados · nenhum caso BLOCKED · 95% de sucesso.

## O que documentamos

| Documento | Quando |
| --- | --- |
| Caso de teste | Todo critério de aceite |
| Bug | Toda falha que não foi corrigida na hora |
| Teste em dupla | Todo ticket que muda tela ou regra |
| Revisão de requisito | Ticket com regra nova, ambígua ou de risco alto |
| Registro de riscos | Um por aplicação, revisto todo mês |
| Plano de teste | Épico grande ou entrega com vários tickets |
| Resumo do período | A cada período combinado (ex.: quinzenal) |
| Retrospectiva | Mensal, ou logo depois de um bug em PROD |

## O que acompanhamos

- Bugs por fase (revisão → dupla → DEV → HML → PROD) e o que escapou para PROD.
- Tickets que voltaram para o dev.
- Tempo de cada ticket na coluna de teste (do quadro do Jira).
- Casos de risco alto executados em cada entrega.

## Revisões desta estratégia

- {{data}} — primeira versão.
