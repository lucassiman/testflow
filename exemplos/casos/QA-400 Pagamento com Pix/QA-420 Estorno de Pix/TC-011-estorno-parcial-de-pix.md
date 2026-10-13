---
tipo: caso-de-teste
id: TC-011
titulo: Estorno parcial de um pedido pago com Pix
status: PENDING
prioridade: Média
ambiente: HML
browser: Chrome 141
versao: 2.15.0
responsavel: Lucas
data: 2026-10-10
jira: QA-420
epico: QA-400
sprint: Sprint 43
tags: [pix, backoffice, regressao]
aprovacao: em-revisao
qa-md: 1
revisor: Ana
---

# TC-011 — Estorno parcial de um pedido pago com Pix

## Objetivo

O atendente devolve **parte** do valor de um pedido pago com Pix e o cliente recebe só essa parte. Mesmo roteiro de dois logins do [[TC-008]]. Escrito para a revisão: a [[QA-420]] ainda diz que o estorno parcial "fica para depois" — ver os comentários.

## Pré-condições

- Duas janelas: uma normal (cliente) e uma anônima (atendente)

## Massa de dados

| Campo | Valor |
| --- | --- |
| Cliente | {{cliente}} |
| Atendente | {{atendente}} |
| Produto | Caneca Loja Demo (R$ 49,90) |
| Valor do estorno parcial | R$ 20,00 |

## Passos

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | | |
| 2 | Comprar a "Caneca Loja Demo" pagando com Pix e anotar o número do pedido | Pedido **Pago** | | |
| 3 | ↪ Fazer login (atendente) | Backoffice com o menu **Atendimento** | | |
| 4 | Abrir o pedido, clicar em **Estornar Pix**, escolher **Parcial** e informar R$ 20,00 | Pedido **Parcialmente estornado**, com R$ 29,90 ainda estornáveis | | |
| 5 | Na janela do cliente, abrir o extrato no simulador do banco ({{banco}}) | Um lançamento de estorno de R$ 20,00 | | |

> [!RESOLVED] @Claude · 10/10/2026 11:02
> Revisão (checklist de qualidade): falta o **limite** — estorno parcial maior que o valor pago (R$ 49,91) tem que ser recusado, e igual ao valor pago (R$ 49,90) vira estorno total. Sugiro uma tabela *Iterações* com R$ 20,00 / R$ 49,90 / R$ 49,91.
>
> ↳ **@Lucas** · 10/10/2026 11:20 — Combinado: vira a tabela Iterações quando a Ana aprovar o roteiro.
>
> ✓ Resolvido por @Lucas · 10/10/2026 11:30

> [!COMMENT] @Ana · 10/10/2026 15:40
> A [[QA-420]] diz que o estorno parcial "fica para depois". Confirmo com a Carla (PO) se entra na 2.15.0 antes de aprovar.
> E no passo 5, confira também que **não** aparece um segundo lançamento (lição do [[BUG-003]]).

## Evidências

Cole prints aqui com `Ctrl+V`.

## Observações

> [!NOTE]
> Caso **em revisão** com dois comentários de revisão: o do Claude (pedido *"revise os casos da QA-420"*), respondido e **resolvido**, e o da Ana, **pendente** — por isso a pílula 💬 1 no topo. Passe o mouse num comentário para responder (↩) ou resolver (✓); **📊 Painel → 💬 Comentários** lista os documentos com comentário pendente.

