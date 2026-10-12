---
tipo: caso-de-teste
id: TC-008
titulo: Atendente estorna um pedido pago com Pix
status: PENDING
prioridade: Alta
ambiente: HML
browser: Chrome 129
versao: 2.15.0
responsavel: Lucas
data: 2026-09-22
jira: QA-420
epico: QA-400
sprint: Sprint 43
tags: [pix, backoffice, regressao]
aprovacao: aprovado
qa-md: 1
aprovado_por: Ana
aprovado_em: 2026-09-30 09:30
aprovado_hash: 7173f908
---

# TC-008 — Atendente estorna um pedido pago com Pix

## Objetivo

O atendente estorna um pedido pago com Pix e o cliente recebe o valor de volta uma vez só. Usa **dois logins** no mesmo caso — o cliente e o atendente —, cada um com o bloco compartilhado `↪ Fazer login` do [[COMP-001]]. Cobre os critérios 1 e 2 da [[QA-420]].

## Pré-condições

- Duas janelas: uma normal (cliente) e uma anônima (atendente)

## Massa de dados

| Campo | Valor |
| --- | --- |
| Cliente | {{cliente}} |
| Atendente | {{atendente}} |
| Produto | Caneca Loja Demo (R$ 49,90) |

> [!IMPORTANT]
> Nenhuma senha é escrita no caso: elas ficam no [[COMP-001]] e aparecem para copiar no painel 🔑 (`Alt+K`) e no ▶ Executar.

## Passos

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | Logado como cliente | `PASS` |
| 2 | Comprar a "Caneca Loja Demo" pagando com Pix pelo QR Code e anotar o número do pedido | Pedido **Pago** | Pedido 10502 Pago | `PASS` |
| 3 | ↪ Fazer login (atendente) | Backoffice com o menu **Atendimento** | Backoffice com o menu Atendimento | `PASS` |
| 4 | Em **Atendimento → Pedidos**, abrir o pedido do passo 2 e clicar em **Estornar Pix** | Pedido **Estornado** e o aviso "Estorno enviado ao banco" | Pedido Estornado | `PASS` |
| 5 | Na janela do cliente, abrir **Meus pedidos** e o extrato do simulador do banco | Pedido **Estornado**; no extrato do banco, **um** lançamento de estorno de R$ 49,90 (não dois) | A correção do [[BUG-003]] ainda não chegou no HML (build rc2 previsto para 09/10) | `RETESTE` |

🐞 Bug: [[BUG-003]] — Estorno de Pix devolve o valor em dobro

> [!WARNING]
> **Aprovado · alterado:** o resultado esperado do passo 5 ficou mais preciso depois do [[BUG-003]] (02/10), e a aprovação da Ana (30/09) vale para o texto antigo. Clique na pílula **⚠ aprovado · alterado** no topo → **Ver o que mudou desde a aprovação**: a versão aprovada fica guardada no histórico (`.versoes/`).

## Evidências

Cole prints aqui com `Ctrl+V`.

## Histórico de execuções

| Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 24/09/2026 | 14:35 | 14:39 | 4 min | HML | `BLOCKED` | Lucas |
| 2 | 01/10/2026 | 09:45 | 10:03 | 18 min | HML | `FAIL` | Lucas |

### Rodada 1 — 01/10/2026 — `BLOCKED`

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | Logado como cliente | `PASS` |
| 2 | Comprar a "Caneca Loja Demo" pagando com Pix pelo QR Code e anotar o número do pedido | Pedido **Pago** | Pedido 10231 Pago | `PASS` |
| 3 | ↪ Fazer login (atendente) | Backoffice com o menu **Atendimento** | Backoffice aberto | `PASS` |
| 4 | Em **Atendimento → Pedidos**, abrir o pedido do passo 2 e clicar em **Estornar Pix** | Pedido **Estornado** e o aviso "Estorno enviado ao banco" | O botão Estornar Pix ainda não está no HML (entra no build da Sprint 43) | `BLOCKED` |
| 5 | Na janela do cliente, abrir **Meus pedidos** e o extrato do simulador do banco | Pedido **Estornado** e o valor devolvido ao cliente | Depende do passo 4 | `SKIP` |

### Rodada 2 — 08/10/2026 — `FAIL`

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | Logado como cliente | `PASS` |
| 2 | Comprar a "Caneca Loja Demo" pagando com Pix pelo QR Code e anotar o número do pedido | Pedido **Pago** | Pedido 10388 Pago | `PASS` |
| 3 | ↪ Fazer login (atendente) | Backoffice com o menu **Atendimento** | Backoffice com o menu Atendimento | `PASS` |
| 4 | Em **Atendimento → Pedidos**, abrir o pedido do passo 2 e clicar em **Estornar Pix** | Pedido **Estornado** e o aviso "Estorno enviado ao banco" | Pedido Estornado; aviso exibido | `PASS` |
| 5 | Na janela do cliente, abrir **Meus pedidos** e o extrato do simulador do banco | Pedido **Estornado**; no extrato do banco, **um** lançamento de estorno de R$ 49,90 (não dois) | O extrato do banco mostra **dois** lançamentos de estorno de R$ 49,90 — o cliente recebeu R$ 99,80 | `FAIL` |
