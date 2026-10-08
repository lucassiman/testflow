---
tipo: caso-de-teste
id: TC-003
titulo: Recuperar senha por e-mail
status: PENDING
prioridade: Média
ambiente: HML
browser: Chrome 128
versao: 2.14.0
responsavel: Lucas
data: 2026-09-26
tags: [login, senha]
---

# TC-003 — Recuperar senha por e-mail

> [!TIP]
> **Experimente aqui:** clique em **▶ Executar** na barra *Execução* (no topo do Preview). Para cada passo digite o obtido, marque o status com as teclas **1–5** e cole um print com `Ctrl+V`. No fim, **✓ Concluir** registra a rodada no *Histórico de execuções*. Dá para usar o painel **⧉ Flutuar** por cima do navegador de teste.
>
> Ou clique direto numa célula da coluna **Status** da tabela.
>
> (No relatório [[EXE-001]] este caso aparece como executado — aqui ele está limpo de propósito, para você praticar.)

## Objetivo

O cliente que esqueceu a senha recebe um link por e-mail e consegue definir uma nova.

## Pré-condições

- Usuário `cliente.ativo@lojademo.test` cadastrado
- Acesso à caixa de e-mail de teste (MailHog do HML)

## Massa de dados

| Campo | Valor |
| --- | --- |
| Usuário | cliente.ativo@lojademo.test |
| Nova senha | escolher uma que atenda à política (8+ caracteres, número e símbolo) |

## Passos

| # | Ação | Resultado esperado | Resultado obtido | Status |
| --- | --- | --- | --- | --- |
| 1 | Na tela de login, clicar em **Esqueci minha senha** | Tela "Recuperar senha" exibida | | |
| 2 | Informar o e-mail e clicar em **Enviar link** | Mensagem "Se o e-mail existir, enviaremos um link" | | |
| 3 | Abrir o e-mail recebido no MailHog | E-mail com link válido por 30 minutos | | |
| 4 | Abrir o link e definir a nova senha | Mensagem "Senha alterada" e volta para o login | | |
| 5 | Entrar com a nova senha | Login realizado | | |

## Evidências

Cole prints aqui com `Ctrl+V`.

## Observações
