---
tipo: plano-de-teste
id: PT-002
titulo: Plano de teste — Pix (versão 2.15.0)
status: PENDING
prioridade: Alta
ambiente: HML
versao: 2.15.0
responsavel: Lucas
data: 2026-09-22
epico: QA-400
sprint: Sprint 43
tags: [pix, plano]
qa-md: 1
---

# PT-002 — Plano de teste — Pix (versão 2.15.0)

## Objetivo

Validar o pagamento e o estorno com Pix ([[QA-400]]) antes da release 2.15.0 ([[REL-001]], prevista para 16/10).

## Escopo

- Pagar com Pix: QR Code, expiração e limites — [[QA-410]]
- Estorno pelo atendimento — [[QA-420]]
- Menu da conta por perfil — [[HU-001]]

## Fora de escopo

- App mobile; Pix agendado e parcelado

## Estratégia

| Tipo de teste | Abordagem | Ferramenta |
| --- | --- | --- |
| Funcional manual | Ciclo salvo *Regressão do Pix*, uma execução por build | TestFlow |
| Multiplataforma | Ciclo *Smoke do Pix* com matriz (HML Chrome/Safari, PROD Chrome) | TestFlow |
| Regressão automatizada | `tests/e2e/pix.spec.ts` | Playwright |

## Ambientes

| Ambiente | URL | Observação |
| --- | --- | --- |
| HML | https://hml.lojademo.test | Simulador do banco; QR Code expira em 2 min |
| PROD | https://www.lojademo.test | Smoke com Pix de R$ 0,01, estornado em seguida |

## Critérios de entrada

- [x] Build 2.15.0 no HML
- [x] Logins por ambiente no [[COMP-001]]

## Critérios de saída

- [ ] Nenhum bug Crítico ou Alto aberto
- [ ] 100% dos casos do Pix executados
- [ ] 90% de sucesso na regressão do Pix
- [ ] Smoke em PROD sem falhas

## Riscos

| Risco | Probabilidade | Impacto | Mitigação |
| --- | --- | --- | --- |
| Simulador do banco fora do ar no HML | Média | Alto | Rodar os casos de Pix logo cedo; avisar o time de infraestrutura |
| Estorno em PROD envolve dinheiro de verdade | Baixa | Alto | Valor mínimo (R$ 0,01) e estorno no mesmo dia |

## Cronograma

| Atividade | Início | Fim | Responsável |
| --- | --- | --- | --- |
| Regressão do Pix — execução #2 | 01/10 | 01/10 | Lucas |
| Regressão do Pix — execução #3 | 08/10 | 10/10 | Ana, Bruno, Lucas |
| Smoke multiplataforma | 13/10 | 14/10 | Lucas |
| Go/No-Go | 15/10 | 15/10 | PO + QA |
