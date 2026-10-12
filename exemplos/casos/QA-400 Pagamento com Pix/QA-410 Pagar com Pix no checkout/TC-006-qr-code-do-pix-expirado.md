---
tipo: caso-de-teste
id: TC-006
titulo: QR Code do Pix expirado não aceita pagamento
status: FAIL
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
aprovacao: em-revisao
qa-md: 1
revisor: Ana
---

# TC-006 — QR Code do Pix expirado não aceita pagamento

## Objetivo

Depois do prazo, o QR Code não pode mais ser pago: o banco recusa, o pedido continua aguardando e o cliente consegue gerar outro. Cobre o critério 3 da [[QA-410]].

## Pré-condições

- No HML, o prazo do QR Code está em **2 minutos** (backoffice → Pix → Expiração), para não esperar 30 min

## Passos

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | Logado como cliente | `PASS` |
| 2 | Pôr um produto no carrinho, ir ao checkout, escolher **Pix** e **Gerar QR Code** | QR Code na tela com o contador "expira em 2:00" | Contador em 2:00 | `PASS` |
| 3 | Esperar o contador zerar sem pagar | "QR Code expirado" e o botão **Gerar novo QR Code**; pedido **Aguardando pagamento** | "QR Code expirado" exibido | `PASS` |
| 4 | Pagar o QR Code expirado no simulador do banco ({{banco}}) | O banco recusa: "QR Code expirado"; o pedido continua **Aguardando pagamento** | Mesmo defeito do [[BUG-002]] (ainda aberto): pagamento aceito com o QR expirado | `FALHA CONHECIDA` |
| 5 | Clicar em **Gerar novo QR Code** e pagar | Novo QR Code; pagamento confirmado e pedido **Pago** | Pedido já pago no passo 4 | `SKIP` |

🐞 Bug: [[BUG-002]] — Pix pago com o QR Code já expirado

## Evidências

Cole prints aqui com `Ctrl+V`.

## Observações

> [!NOTE]
> Caso **em revisão** com a Ana (pílula 👀 no topo): ela pediu para separar o passo 4 em "pagar pelo QR" e "pagar pelo copia-e-cola". Enquanto não for aprovado, ele fica fora das rodadas que usam **☐ só aprovados**.

## Histórico de execuções

| Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 24/09/2026 | 14:20 | 14:29 | 9 min | HML | `PASS` | Lucas |
| 2 | 01/10/2026 | 08:55 | 09:07 | 12 min | HML | `FAIL` | Lucas |
| 3 | 08/10/2026 | 09:05 | 09:16 | 11 min | HML | `FAIL` | Lucas |

### Rodada 1 — 01/10/2026 — `PASS`

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | Logado como cliente | `PASS` |
| 2 | Pôr um produto no carrinho, ir ao checkout, escolher **Pix** e **Gerar QR Code** | QR Code na tela com o contador "expira em 2:00" | Contador em 2:00 | `PASS` |
| 3 | Esperar o contador zerar sem pagar | "QR Code expirado" e o botão **Gerar novo QR Code**; pedido **Aguardando pagamento** | "QR Code expirado" exibido | `PASS` |
| 4 | Pagar o QR Code expirado no simulador do banco ({{banco}}) | O banco recusa: "QR Code expirado"; o pedido continua **Aguardando pagamento** | Banco recusou; pedido aguardando | `PASS` |
| 5 | Clicar em **Gerar novo QR Code** e pagar | Novo QR Code; pagamento confirmado e pedido **Pago** | Novo QR pago; pedido Pago | `PASS` |

### Rodada 2 — 08/10/2026 — `FAIL`

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | Logado como cliente | `PASS` |
| 2 | Pôr um produto no carrinho, ir ao checkout, escolher **Pix** e **Gerar QR Code** | QR Code na tela com o contador "expira em 2:00" | Contador em 2:00 | `PASS` |
| 3 | Esperar o contador zerar sem pagar | "QR Code expirado" e o botão **Gerar novo QR Code**; pedido **Aguardando pagamento** | "QR Code expirado" exibido | `PASS` |
| 4 | Pagar o QR Code expirado no simulador do banco ({{banco}}) | O banco recusa: "QR Code expirado"; o pedido continua **Aguardando pagamento** | O simulador aceitou o pagamento e o pedido ficou **Pago** com o QR Code expirado | `FAIL` |
| 5 | Clicar em **Gerar novo QR Code** e pagar | Novo QR Code; pagamento confirmado e pedido **Pago** | Pedido já pago no passo 4 | `SKIP` |
