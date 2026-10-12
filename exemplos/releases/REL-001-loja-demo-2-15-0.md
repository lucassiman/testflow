---
tipo: release
id: REL-001
titulo: Loja Demo 2.15.0
versao: 2.15.0
prevista: 2026-10-16
situacao: em-teste
responsavel: Lucas
data: 2026-09-29
jira: [QA-400]
tags: [release]
qa-md: 1
---

# REL-001 — Loja Demo 2.15.0

Tudo o que tem `versao: 2.15.0` no cabeçalho faz parte desta release: o plano, as execuções, os casos e os bugs. O quadro abaixo é recalculado ao abrir — ele mostra casos executados, % de sucesso, falhas, bugs abertos e os dias até a data prevista.

## Progresso

```qa-visao
titulo: Progresso da release
formato: release
versao: 2.15.0
```

<!-- qa:visao -->
_Cópia gerada pelo TestFlow em 09/10/2026, 17:00 — atualizada ao salvar._

**⏳ Ainda não**

| Indicador | Valor |
| --- | --- |
| Casos executados | 4/5 (80%) |
| Sucesso (PASS ÷ executados que rodaram) | `50%` |
| PASS · FAIL · BLOCKED · SKIP | 2 · 2 · 0 · 0 |
| Execuções | 3 (1 em andamento) |
| Bugs abertos · fechados | `2 · 0` |
| Critérios de saída | `1/5` |
| Prevista | 16/10/2026 (faltam 7 dia(s)) |
| Casos da versão fora de qualquer rodada | 1 |
| Falta | 1 caso(s) sem resultado · 2 caso(s) com FAIL/BLOCKED · 2 bug(s) aberto(s) · 4 critério(s) de saída sem marcar · 1 execução(ões) em andamento |

**Execuções**

| Execução | Configuração | Início | Casos | PASS | FAIL | BLOCKED | Pendentes | % sucesso | Situação |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [[EXEC-20261008-084500]] | — | 08/10/2026 | 4 | 1 | 1 | 0 | 2 | `50%` | em andamento |
| [[EXEC-20261001-083000]] | — | 01/10/2026 | 4 | 2 | 2 | 0 | 0 | `50%` | encerrada |
| [[EXEC-20260924-140000]] | — | 24/09/2026 | 3 | 2 | 0 | 1 | 0 | `67%` | encerrada |

**Casos com falha**

| Caso | Resultado |
| --- | --- |
| [[TC-006]] | `FAIL` |
| [[TC-008]] | `FAIL` |

**Bugs abertos**

| Bug | Título |
| --- | --- |
| [[BUG-002]] | Pix pago com o QR Code já expirado |
| [[BUG-003]] | Estorno de Pix devolve o valor em dobro |

**Planos**

| Plano | Título |
| --- | --- |
| [[PT-002]] | Plano de teste — Pix (versão 2.15.0) |
<!-- /qa:visao -->

## Escopo

- Épico [[QA-400]] — Pagamento com Pix ([[QA-410]], [[QA-420]])
- [[HU-001]] — Menu da conta por perfil
- Plano de teste: [[PT-002]]

## Critérios de saída

- [x] Plano de teste revisado com o PO
- [ ] Todos os casos planejados executados
- [ ] Nenhum caso com FAIL ou BLOCKED (ou com bug aceito)
- [ ] Nenhum bug Crítico ou Alto aberto
- [ ] Smoke em PROD sem falhas

## Decisão

Go/No-Go na reunião de 15/10 com o PO. Registre aqui quem decidiu, quando e as ressalvas.
