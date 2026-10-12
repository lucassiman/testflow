---
tipo: caso-de-teste
id: TC-009
titulo: Menu da conta por perfil
status: PENDING
prioridade: Média
ambiente: HML
browser: Chrome 129
versao: 2.15.0
responsavel: Lucas
data: 2026-10-06
iterar: [cliente, atendente, gestor]
tags: [conta, perfis]
aprovacao: rascunho
qa-md: 1
---

# TC-009 — Menu da conta por perfil

## Objetivo

Cada perfil vê só os itens de menu dele, como na tabela da [[HU-001]]. O caso roda **uma vez por perfil**: `iterar: [cliente, atendente, gestor]` no cabeçalho usa as linhas dos *Logins* do [[COMP-001]] — sem copiar o caso três vezes nem repetir a massa.

## Passos

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | ↪ Fazer login (dado) | Página inicial com "Olá" | | |
| 2 | Abrir o menu da conta (canto superior direito) | Os itens do perfil {{dado.perfil}}, como na tabela da [[HU-001]] | | |
| 3 | Clicar em cada item do menu | Cada item abre a página certa, sem "Acesso negado" | | |

## Evidências

Cole prints aqui com `Ctrl+V`.

## Observações

> [!NOTE]
> **Rascunho** (pílula ✍ no topo): ainda não foi revisado nem executado — por isso aparece na visão *Casos ainda não executados*. Quando estiver pronto: pílula → **Enviar para revisão…**.
