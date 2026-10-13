---
tipo: execucao
id: EXEC-20261007-020412
titulo: Execução automatizada — loja-demo-e2e — 07/10/2026
versao: 
responsavel: Lucas
inicio: 2026-10-07 02:04
status: FAIL
tags: [regressao, automacao]
qa-md: 1
fim: 2026-10-07 08:15
---

# Execução automatizada — loja-demo-e2e — 07/10/2026

Execução só de testes automatizados (relatório Playwright), iniciada em 07/10/2026 às 02:04. O resultado está na seção "Testes automatizados" (relatório importado). Dá para somar casos manuais depois, editando a tabela "Casos do ciclo".

<!-- qa:resumo -->

**Executados:** 0 de 0 (—)

| Status | Qtde | % |
| --- | ---: | ---: |
| `PASS` | 0 | — |
| `FAIL` | 0 | — |
| `BLOCKED` | 0 | — |
| `SKIP` | 0 | — |
| `PENDING` | 0 | — |
| **Total** | 0 | — |

<!-- /qa:resumo -->

## Casos do ciclo

| # | Caso | Título | Status | Executado em | Bugs |
| --- | --- | --- | --- | --- | --- |

## Testes automatizados

> 🤖 **Playwright** — `reporter do Playwright` · importado em 07/10/2026 02:04 · duração 5 min 51 s

### Resultados

| # | Teste | Arquivo | Projeto | Duração | Caso | Resultado | Obs |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 1 | Pix › TC-005 paga pelo QR Code e o pedido fica Pago | [pix.spec.ts:14](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/pix.spec.ts:14) | chromium | 17,4 s | TC-005 | `PASS` |  |
| 2 | Pix › comprovante do Pix em PDF em Meus pedidos | [pix.spec.ts:41](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/pix.spec.ts:41) | chromium | 6,2 s | TC-005 | `PASS` |  |
| 3 | Pix › TC-006 QR Code expirado é recusado pelo banco | [pix-expiracao.spec.ts:9](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/pix-expiracao.spec.ts:9) | chromium | 4 min 18 s | TC-006 | `FAIL` | 1 retry · Error: expect(locator).toHaveText(expected) failed |
| 4 | Pix › TC-007 limites de valor (R$ 0,01, R$ 5.000,00 e R$ 5.000,01) | [pix-limites.spec.ts:7](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/pix-limites.spec.ts:7) | chromium | 11,9 s | TC-007 | `PASS` |  |
| 5 | Estorno › TC-008 atendente estorna e o cliente recebe uma vez | [estorno.spec.ts:12](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/estorno.spec.ts:12) | chromium | 48,9 s | TC-008 | `FAIL` | 1 retry · Error: expect(received).toHaveLength(expected) |

### Falhas

#### 3. Pix › TC-006 QR Code expirado é recusado pelo banco

[`tests/e2e/pix-expiracao.spec.ts:9`](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/pix-expiracao.spec.ts:9) · chromium · 4 min 18 s · Caso TC-006

> [!CAUTION]
> Error: expect(locator).toHaveText(expected) failed
> Locator: getByTestId('status-pedido')
> Expected: "Aguardando pagamento"
> Received: "Pago"

```log
Error: expect(locator).toHaveText(expected) failed
    at C:\dev\loja-demo-e2e\tests\e2e\pix-expiracao.spec.ts:31:52
```

**Anexos:** [🖼 screenshot](vscode://file/C:/dev/loja-demo-e2e/test-results/tc-006-qr-code-expirado-e-recusado-pelo--chromium/test-failed-1.png) · [🖼 screenshot](vscode://file/C:/dev/loja-demo-e2e/test-results/tc-006-qr-code-expirado-e-recusado-pelo--chromium-retry1/test-failed-1.png) · [🧭 trace](vscode://file/C:/dev/loja-demo-e2e/test-results/tc-006-qr-code-expirado-e-recusado-pelo--chromium-retry1/trace.zip)

#### 5. Estorno › TC-008 atendente estorna e o cliente recebe uma vez

[`tests/e2e/estorno.spec.ts:12`](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/estorno.spec.ts:12) · chromium · 48,9 s · Caso TC-008

> [!CAUTION]
> Error: expect(received).toHaveLength(expected)
> Expected length: 1
> Received length: 2
> Received array:  ["Estorno Pix R$ 49,90", "Estorno Pix R$ 49,90"]

```log
Error: expect(received).toHaveLength(expected)
    at C:\dev\loja-demo-e2e\tests\e2e\estorno.spec.ts:44:38
```

**Anexos:** [🖼 screenshot](vscode://file/C:/dev/loja-demo-e2e/test-results/tc-008-atendente-estorna-e-o-cliente-rec-chromium/test-failed-1.png) · [🖼 screenshot](vscode://file/C:/dev/loja-demo-e2e/test-results/tc-008-atendente-estorna-e-o-cliente-rec-chromium-retry1/test-failed-1.png) · [🧭 trace](vscode://file/C:/dev/loja-demo-e2e/test-results/tc-008-atendente-estorna-e-o-cliente-rec-chromium-retry1/trace.zip)

### Cobertura dos casos manuais

| Caso | Título | Testes | Resultado |
| --- | --- | ---: | --- |
| TC-005 | [Pagar com Pix pelo QR Code](../casos/QA-400%20Pagamento%20com%20Pix/QA-410%20Pagar%20com%20Pix%20no%20checkout/TC-005-pagar-com-pix-pelo-qr-code.md) | 2 | `PASS` |
| TC-006 | [QR Code do Pix expirado não aceita pagamento](../casos/QA-400%20Pagamento%20com%20Pix/QA-410%20Pagar%20com%20Pix%20no%20checkout/TC-006-qr-code-do-pix-expirado.md) | 1 | `FAIL` |
| TC-007 | [Limites de valor do Pix](../casos/QA-400%20Pagamento%20com%20Pix/QA-410%20Pagar%20com%20Pix%20no%20checkout/TC-007-limites-de-valor-do-pix.md) | 1 | `PASS` |
| TC-008 | [Atendente estorna um pedido pago com Pix](../casos/QA-400%20Pagamento%20com%20Pix/QA-420%20Estorno%20de%20Pix/TC-008-atendente-estorna-um-pix.md) | 1 | `FAIL` |

## Encerramento

Encerrado em 07/10/2026 às 08:15 — resultado `FAIL`.

**Testes automatizados (Playwright):** 5 teste(s) — 3 PASS · 2 FAIL (60% de sucesso).
