---
tipo: compartilhado
id: COMP-001
titulo: Logins e passos compartilhados
app:
escopo: app
aplica-a: []
responsavel:
data: {{data}}
qa-md: 1
---

# COMP-001 — Logins e passos compartilhados

Dados e passos usados por vários casos. **Escopo** (no cabeçalho): `pasta` = os documentos desta pasta e das de dentro · `app` = a aplicação toda · `global` = a pasta de trabalho toda. `aplica-a: [tag, ID, ticket ou épico]` restringe a quem tem um deles. Um compartilhado mais perto do caso (na pasta do épico, por exemplo) ganha de um mais de fora quando o nome é o mesmo.

## Dados: Logins

No caso: `{{admin}}` usa o valor e `{{admin.senha}}` a senha (no app, um clique copia; a senha aparece `••••` a não ser com "mostrar senhas"). Colunas a mais viram campos: `{{admin.perfil}}`. Escreva os valores como texto puro (sem link).

| Nome | Valor | Senha | Observação |
| --- | --- | --- | --- |
| admin | admin@exemplo.com | troque-aqui | Administrador |
| cliente | cliente@exemplo.com | troque-aqui | Cliente comum |
| url | https://hml.exemplo.com | | Ambiente de homologação |

## Dados: Logins (prod)

Massa por **ambiente**: a mesma tabela com `(local)`, `(dev)`, `(hml)` ou `(prod)` no título — mesmas chaves, valores daquele ambiente. O app usa a do ambiente ativo (🌐 no topo; começa pelo `ambiente:` do caso) e, o que estiver em branco, o valor geral acima. O caso não muda: continua `{{admin}}`. Para criar as seções de uma vez: 🌐 → *Preparar a massa por ambiente…*

| Nome | Valor | Senha | Observação |
| --- | --- | --- | --- |
| admin | | | Administrador |
| url | https://www.exemplo.com | | Produção |

## Dados: Colaboradores

Outras massas de dados ficam em outras tabelas (uma seção `## Dados: <nome>` para cada). A coluna **Chave** é o nome usado no caso — `{{colab-ativo.nome}}`, `{{colab-ativo.matricula}}`.

| Chave | Nome | Matrícula | Cargo |
| --- | --- | --- | --- |
| colab-ativo | Nome do colaborador | 000000 | Analista |

## Antes da rodada

Uma vez, no começo da rodada (como o *beforeAll*).

| # | Ação | Resultado esperado |
| --- | --- | --- |
| 1 | Conferir que {{url}} está no ar | A página abre |

## Antes de cada caso

Antes do 1º passo de cada caso do escopo (como o *beforeEach*).

| # | Ação | Resultado esperado |
| --- | --- | --- |
| 1 | Abrir {{url}} numa aba anônima | Tela de login |

## Passos: Fazer login

No caso, um passo com a ação `↪ Fazer login (admin)` — ou `↪ Fazer login (usuario=cliente)` — vale um passo e um status; no painel de execução aparecem os passos abaixo, com o e-mail e a senha para copiar.

Parâmetros: usuario

| # | Ação | Resultado esperado |
| --- | --- | --- |
| 1 | Abrir {{url}}/login | Tela de login |
| 2 | Informar {{usuario}} e a senha {{usuario.senha}} | Campos preenchidos |
| 3 | Clicar em Entrar | Painel inicial de {{usuario.observacao}} |
