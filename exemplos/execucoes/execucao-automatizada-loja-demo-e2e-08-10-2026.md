---
tipo: execucao
id: EXEC-20261008-020412
titulo: Execução automatizada — loja-demo-e2e — 08/10/2026
versao: 
responsavel: Lucas
inicio: 2026-10-08 02:04
status: FAIL
tags: [regressao, automacao]
qa-md: 1
fim: 2026-10-08 08:15
---

# Execução automatizada — loja-demo-e2e — 08/10/2026

Execução só de testes automatizados (relatório Playwright), iniciada em 08/10/2026 às 02:04. O resultado está na seção "Testes automatizados" (relatório importado). Dá para somar casos manuais depois, editando a tabela "Casos do ciclo".

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

> 🤖 **Playwright** — `reporter do Playwright` · importado em 08/10/2026 02:04 · duração 6 min 30 s

### Resultados

| # | Teste | Arquivo | Projeto | Duração | Caso | Resultado | Obs |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| 1 | Pix › TC-005 paga pelo QR Code e o pedido fica Pago | [pix.spec.ts:14](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/pix.spec.ts:14) | chromium | 43,9 s | TC-005 | `FAIL` | 1 retry · TimeoutError: locator.waitFor: Timeout 10000ms exceeded. |
| 2 | Pix › comprovante do Pix em PDF em Meus pedidos | [pix.spec.ts:41](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/pix.spec.ts:41) | chromium | 16,4 s | TC-005 | `PASS` | flaky (2 tentativas) · ⚠ instável: 1× passou só com retry em 2 execuções |
| 3 | Pix › TC-006 QR Code expirado é recusado pelo banco | [pix-expiracao.spec.ts:9](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/pix-expiracao.spec.ts:9) | chromium | 4 min 18 s | TC-006 | `FAIL` | 1 retry · Error: expect(locator).toHaveText(expected) failed |
| 4 | Pix › TC-007 limites de valor (R$ 0,01, R$ 5.000,00 e R$ 5.000,01) | [pix-limites.spec.ts:7](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/pix-limites.spec.ts:7) | chromium | 12,1 s | TC-007 | `PASS` |  |
| 5 | Estorno › TC-008 atendente estorna e o cliente recebe uma vez | [estorno.spec.ts:12](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/estorno.spec.ts:12) | chromium | 49,9 s | TC-008 | `FAIL` | 1 retry · Error: expect(received).toHaveLength(expected) |

### Falhas

#### 1. Pix › TC-005 paga pelo QR Code e o pedido fica Pago

[`tests/e2e/pix.spec.ts:14`](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/pix.spec.ts:14) · chromium · 43,9 s · Caso TC-005

> [!CAUTION]
> TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
> Call log:
> - waiting for getByText('Pagamento confirmado') to be visible

```log
TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
    at C:\dev\loja-demo-e2e\tests\e2e\pix.spec.ts:29:45
```

**Anexos:** [🖼 screenshot](vscode://file/C:/dev/loja-demo-e2e/test-results/tc-005-paga-pelo-qr-code-e-o-pedido-fica-chromium/test-failed-1.png) · [🖼 screenshot](vscode://file/C:/dev/loja-demo-e2e/test-results/tc-005-paga-pelo-qr-code-e-o-pedido-fica-chromium-retry1/test-failed-1.png) · [🧭 trace](vscode://file/C:/dev/loja-demo-e2e/test-results/tc-005-paga-pelo-qr-code-e-o-pedido-fica-chromium-retry1/trace.zip)

#### 2. Pix › comprovante do Pix em PDF em Meus pedidos

[`tests/e2e/pix.spec.ts:41`](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/pix.spec.ts:41) · chromium · 16,4 s · **flaky** — passou após 1 retry · Caso TC-005

> [!WARNING]
> TimeoutError: page.waitForEvent: Timeout 5000ms exceeded while waiting for event "download"

```log
TimeoutError: page.waitForEvent: Timeout 5000ms exceeded while waiting for event "download"
    at C:\dev\loja-demo-e2e\tests\e2e\pix.spec.ts:52:30
```

**Anexos:** [🖼 screenshot](vscode://file/C:/dev/loja-demo-e2e/test-results/comprovante-do-pix-em-pdf-em-meus-pedido-chromium/test-failed-1.png)

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

[`tests/e2e/estorno.spec.ts:12`](vscode://file/C:/dev/loja-demo-e2e/tests/e2e/estorno.spec.ts:12) · chromium · 49,9 s · Caso TC-008

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
| TC-005 | [Pagar com Pix pelo QR Code](../casos/QA-400%20Pagamento%20com%20Pix/QA-410%20Pagar%20com%20Pix%20no%20checkout/TC-005-pagar-com-pix-pelo-qr-code.md) | 2 | `FAIL` |
| TC-006 | [QR Code do Pix expirado não aceita pagamento](../casos/QA-400%20Pagamento%20com%20Pix/QA-410%20Pagar%20com%20Pix%20no%20checkout/TC-006-qr-code-do-pix-expirado.md) | 1 | `FAIL` |
| TC-007 | [Limites de valor do Pix](../casos/QA-400%20Pagamento%20com%20Pix/QA-410%20Pagar%20com%20Pix%20no%20checkout/TC-007-limites-de-valor-do-pix.md) | 1 | `PASS` |
| TC-008 | [Atendente estorna um pedido pago com Pix](../casos/QA-400%20Pagamento%20com%20Pix/QA-420%20Estorno%20de%20Pix/TC-008-atendente-estorna-um-pix.md) | 1 | `FAIL` |

## Encerramento

Encerrado em 08/10/2026 às 08:15 — resultado `FAIL`.

**Testes automatizados (Playwright):** 5 teste(s) — 2 PASS · 3 FAIL · 1 flaky (40% de sucesso).
