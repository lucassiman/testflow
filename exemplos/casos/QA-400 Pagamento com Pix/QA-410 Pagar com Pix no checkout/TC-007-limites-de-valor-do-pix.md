---
tipo: caso-de-teste
id: TC-007
titulo: Limites de valor do Pix
status: PENDING
prioridade: Média
ambiente: HML
browser: Chrome 129
versao: 2.15.0
responsavel: Lucas
data: 2026-09-25
jira: QA-410
epico: QA-400
sprint: Sprint 43
tags: [pix, checkout, regressao]
aprovacao: aprovado
qa-md: 1
aprovado_por: Ana
aprovado_em: 2026-09-30 09:20
aprovado_hash: 66fa7191
---

# TC-007 — Limites de valor do Pix

## Objetivo

O Pix aceita pedidos de **R$ 0,01** a **R$ 5.000,00**. O mesmo caso roda **uma vez por linha** da tabela *Iterações* — o valor mínimo, o máximo e um centavo acima. Cobre o critério 4 da [[QA-410]].

## Iterações

Cada linha é uma execução. No ▶ Executar o painel mostra **🔁 minimo 1/3**, com os valores da linha nos passos; **✓ Concluir iteração** registra e começa a próxima. Nos passos, `{{dado.valor}}` e `{{dado.esperado}}` são a linha da vez.

| Chave | Valor | Esperado |
| --- | --- | --- |
| minimo | R$ 0,01 | QR Code gerado normalmente |
| maximo | R$ 5.000,00 | QR Code gerado normalmente |
| acima-do-limite | R$ 5.000,01 | Aviso "O Pix aceita até R$ 5.000,00 por pedido" e **Gerar QR Code** desabilitado |

## Passos

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | | |
| 2 | Adicionar um **Vale-presente** de {{dado.valor}} ao carrinho e ir para o checkout | Checkout com o total de {{dado.valor}} | | |
| 3 | Escolher **Pix** | {{dado.esperado}} | | |

## Evidências

Cole prints aqui com `Ctrl+V`.

## Observações

> [!TIP]
> No Preview, `{{dado.valor}}` aparece como **🔁 valor** — passe o mouse para ver o valor de cada iteração. No *Histórico de execuções*, a coluna **Dados** diz qual linha rodou (`minimo (1/3)`); na rodada, o caso só conta como feito depois das três, com o pior resultado entre elas.

## Histórico de execuções

| Rodada | Data | Início | Fim | Duração | Ambiente | Resultado | Responsável | Dados |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 01/10/2026 | 09:20 | 09:26 | 6 min | HML | `PASS` | Lucas | minimo (1/3) |
| 2 | 01/10/2026 | 09:27 | 09:32 | 5 min | HML | `PASS` | Lucas | maximo (2/3) |
| 3 | 01/10/2026 | 09:33 | 09:40 | 7 min | HML | `PASS` | Lucas | acima-do-limite (3/3) |
| 4 | 08/10/2026 | 09:40 | 09:46 | 6 min | HML | `PASS` | Lucas | minimo (1/3) |

### Rodada 1 — 01/10/2026 — `PASS` — minimo (1/3)

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | Logado como cliente | `PASS` |
| 2 | Adicionar um **Vale-presente** de {{dado.valor}} ao carrinho e ir para o checkout | Checkout com o total de {{dado.valor}} | Total R$ 0,01 | `PASS` |
| 3 | Escolher **Pix** | {{dado.esperado}} | QR Code gerado | `PASS` |

### Rodada 2 — 01/10/2026 — `PASS` — maximo (2/3)

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | Logado como cliente | `PASS` |
| 2 | Adicionar um **Vale-presente** de {{dado.valor}} ao carrinho e ir para o checkout | Checkout com o total de {{dado.valor}} | Total R$ 5.000,00 | `PASS` |
| 3 | Escolher **Pix** | {{dado.esperado}} | QR Code gerado | `PASS` |

### Rodada 3 — 08/10/2026 — `PASS`

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | Logado como cliente | `PASS` |
| 2 | Adicionar um **Vale-presente** de {{dado.valor}} ao carrinho e ir para o checkout | Checkout com o total de {{dado.valor}} | Total R$ 5.000,01 | `PASS` |
| 3 | Escolher **Pix** | {{dado.esperado}} | Aviso do limite; botão desabilitado | `PASS` |

### Rodada 4 — 08/10/2026 — `PASS` — minimo (1/3)

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (cliente) | Página inicial com "Olá" | Logado como cliente | `PASS` |
| 2 | Adicionar um **Vale-presente** de {{dado.valor}} ao carrinho e ir para o checkout | Checkout com o total de {{dado.valor}} | Total R$ 0,01 | `PASS` |
| 3 | Escolher **Pix** | {{dado.esperado}} | QR Code gerado | `PASS` |
