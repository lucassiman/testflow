---
tipo: caso-de-teste
id: TC-005
titulo: Pagar com Pix pelo QR Code
status: PASS
prioridade: Alta
ambiente: HML
browser: Chrome 129
versao: 2.15.0
responsavel: Lucas
data: 2026-09-22
jira: QA-410
epico: QA-400
sprint: Sprint 43
tags: [pix, checkout, regressao]
automacao: tests/e2e/pix.spec.ts
aprovacao: aprovado
qa-md: 1
aprovado_por: Ana
aprovado_em: 2026-09-30 09:10
aprovado_hash: a7fe970a
---

# TC-005 — Pagar com Pix pelo QR Code

## Objetivo

O cliente paga um pedido com Pix pelo QR Code e o pedido fica **Pago** em poucos segundos, com o comprovante em *Meus pedidos*. Cobre os critérios 1 e 2 da [[QA-410]].

## Pré-condições

- Pix ligado no backoffice e simulador do banco no ar (o **⏮ Antes da rodada** do [[COMP-001]] confere)

## Passos

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | Logado como cliente | `PASS` |
| 2 | Adicionar a "Caneca Loja Demo" ao carrinho e ir para o checkout | Checkout com o total de R$ 49,90 | Total R$ 49,90 | `PASS` |
| 3 | Escolher **Pix** e clicar em **Gerar QR Code** | QR Code e código copia-e-cola na tela, com o prazo para pagar | QR Code e copia-e-cola exibidos | `PASS` |
| 4 | Pagar o QR Code no simulador do banco ({{banco}}) | Em até 10 s, "Pagamento confirmado" e o pedido **Pago** | Confirmado em 5 s; pedido Pago | `PASS` |
| 5 | Abrir **Minha conta → Meus pedidos** | O pedido com a forma de pagamento Pix e o comprovante para baixar | Comprovante baixado | `PASS` |

## Evidências

Cole prints aqui com `Ctrl+V`.

## Observações

> [!TIP]
> O passo 1 é um **bloco compartilhado**: `↪ Fazer login (cliente)` vem do [[COMP-001]]. No Preview, passe o mouse sobre ele para ver os 3 passos já com o e-mail e a senha do ambiente ativo (🌐 no topo); no ▶ Executar, os dados vêm com botão de copiar. O `{{banco}}` do passo 4 também é um dado compartilhado — clique nele para copiar o endereço.

## Histórico de execuções

| Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 24/09/2026 | 14:05 | 14:17 | 12 min | HML | `PASS` | Lucas |
| 2 | 01/10/2026 | 08:40 | 08:51 | 11 min | HML | `PASS` | Lucas |
| 3 | 08/10/2026 | 09:00 | 09:14 | 14 min | HML | `PASS` | Lucas |

### Rodada 1 — 01/10/2026 — `PASS`

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | Logado como cliente | `PASS` |
| 2 | Adicionar a "Caneca Loja Demo" ao carrinho e ir para o checkout | Checkout com o total de R$ 49,90 | Total R$ 49,90 | `PASS` |
| 3 | Escolher **Pix** e clicar em **Gerar QR Code** | QR Code e código copia-e-cola na tela, com o prazo para pagar | QR Code e copia-e-cola exibidos | `PASS` |
| 4 | Pagar o QR Code no simulador do banco ({{banco}}) | Em até 10 s, "Pagamento confirmado" e o pedido **Pago** | Confirmado em 4 s; pedido Pago | `PASS` |
| 5 | Abrir **Minha conta → Meus pedidos** | O pedido com a forma de pagamento Pix e o comprovante para baixar | Comprovante baixado | `PASS` |

### Rodada 2 — 08/10/2026 — `PASS`

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | Logado como cliente | `PASS` |
| 2 | Adicionar a "Caneca Loja Demo" ao carrinho e ir para o checkout | Checkout com o total de R$ 49,90 | Total R$ 49,90 | `PASS` |
| 3 | Escolher **Pix** e clicar em **Gerar QR Code** | QR Code e código copia-e-cola na tela, com o prazo para pagar | QR Code e copia-e-cola exibidos | `PASS` |
| 4 | Pagar o QR Code no simulador do banco ({{banco}}) | Em até 10 s, "Pagamento confirmado" e o pedido **Pago** | Confirmado em 3 s; pedido Pago | `PASS` |
| 5 | Abrir **Minha conta → Meus pedidos** | O pedido com a forma de pagamento Pix e o comprovante para baixar | Comprovante com o identificador do Pix | `PASS` |
