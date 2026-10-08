---
tipo: charter-exploratorio
id: SES-001
titulo: Sessão exploratória — Checkout
status: FAIL
ambiente: HML
browser: Chrome 128
versao: 2.14.0
responsavel: Lucas
data: 2026-09-25
tags: [exploratorio, checkout]
---

# SES-001 — Sessão exploratória — Checkout

> [!TIP]
> **Experimente:** abra um documento *Sessão exploratória* (este ou um novo pelo modelo) e clique em **⏱ Sessão** na barra Execução. O cronômetro começa; escreva notas curtas e comece com `bug:`, `dúvida:` ou `ideia:` para etiquetar. Cada nota vai para *Notas da sessão* com o horário; BUG também entra na tabela *Bugs*. **Encerrar** preenche fim, duração real e o resumo.

## Missão

Explorar **o checkout (endereço, frete e pagamento)** usando **dados-limite e navegação com voltar/avançar** para descobrir **perdas de dados do carrinho e totais errados**.

## Áreas

- Endereço de entrega (CEP, número, complemento)
- Cálculo de frete
- Troca de forma de pagamento
- Botão voltar do navegador em cada etapa

## Duração

| Planejada | Real | Início | Fim |
| --- | --- | --- | --- |
| 60 min | 52 min | 14:00 | 14:52 |

## Notas da sessão

- 14:03 — Checkout com 1 item: fluxo feliz OK até o pagamento
- 14:11 — **IDEIA:** mostrar o prazo de entrega junto com o valor do frete
- 14:18 — **BUG:** CEP com hífen (01310-100) é recusado; sem hífen funciona
- 14:26 — **DÚVIDA:** frete grátis acima de R$ 199 vale com cupom aplicado?
- 14:34 — Voltar do pagamento para o endereço mantém os dados
- 14:41 — **BUG:** trocar de Pix para cartão zera o cupom aplicado
- 14:50 — Complemento com 60 caracteres é cortado sem aviso

## Bugs

| Bug | Resumo | Severidade |
| --- | --- | --- |
| a abrir | CEP com hífen é recusado no endereço | Média |
| a abrir | Trocar a forma de pagamento remove o cupom | Alta |

## Resumo

Sessão de 52 min (planejada 60). 7 notas: 2 BUG, 1 DÚVIDA, 1 IDEIA. O fluxo feliz funciona, mas a validação de CEP e a troca de pagamento precisam de correção antes da release.
