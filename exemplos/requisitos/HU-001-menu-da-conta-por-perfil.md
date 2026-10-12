---
tipo: historia
id: HU-001
titulo: Menu da conta por perfil
prioridade: Média
versao: 2.15.0
data: 2026-10-05
tags: [conta, perfis]
qa-md: 1
---

# HU-001 — Menu da conta por perfil

> [!NOTE]
> **Ainda sem ticket no Jira**, por isso fica em `requisitos/` (com um ID provisório, `HU-001`). Quando o PO criar o ticket, ponha a chave no `id:` (ou no `jira:`) e o `epico:` — o editor passa a sugerir a pasta do ticket dentro do épico, como as histórias do [[QA-400]].

## História

**Como** usuário da Loja Demo, **quero** ver no menu da conta só o que o meu perfil pode usar **para** não cair em telas de "Acesso negado".

## Critérios de aceite

- [ ] Dado um usuário logado, quando abro o menu da conta, então vejo os itens do meu perfil (tabela abaixo)
- [ ] Dado um item do menu, quando clico, então a página abre sem erro de permissão

## Regras de negócio

| Perfil | Itens do menu da conta |
| --- | --- |
| Cliente | Meus pedidos · Endereços · Formas de pagamento · Sair |
| Atendente | Atendimento · Pedidos · Sair |
| Gestor | Atendimento · Pedidos · Relatórios · Configurações · Sair |

## Casos de teste

| Caso | Critério coberto |
| --- | --- |
| [[TC-009]] | 1 e 2 — um caso, uma execução por perfil |

## Dúvidas para o time

- O gestor também deve ver *Meus pedidos* (para compras dele)?
