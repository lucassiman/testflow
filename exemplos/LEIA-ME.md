# Exemplos — tour guiado do TestFlow

Esta pasta é um **projeto de QA fictício** (a "Loja Demo", versão 2.14.0, Sprint 42) para você conhecer o editor na prática. Tudo aqui é Markdown comum: abre também no GitHub e no VS Code.

> [!TIP]
> **Comece assim:** no editor, `☰` → aba **Arquivos** → **Abrir…** e escolha esta pasta `exemplos`. Ela vira a *pasta de trabalho*: os links `[[TC-002]]` passam a abrir os documentos, a busca e o painel enxergam todos os arquivos, e colar prints já salva em `evidencias/`.

## O que tem aqui

| Arquivo | Tipo | O que mostra |
| --- | --- | --- |
| `casos/TC-001-login-valido.md` | Caso de teste — `PASS` | Cabeçalho (cartão), passos executados, evidência com legenda, link para a automação (`automacao:`) |
| `casos/TC-002-login-usuario-bloqueado.md` | Caso de teste — `FAIL` | Status clicável, falha + bloqueio, prints, **Histórico de execuções** com a rodada anterior, link para o bug |
| `casos/TC-003-recuperar-senha.md` | Caso de teste — `PENDING` | **Em branco para você executar** (▶ Executar, painel flutuante, prints por passo) |
| `casos/TC-004-checkout-cartao.md` | Caso de teste — `BLOCKED` | Bloqueio de ambiente, massa de dados com **dados sensíveis fictícios** |
| `bdd/CEN-001-carrinho-de-compras.md` | Cenários BDD | Bloco `gherkin`, tabela de execução por cenário |
| `bugs/BUG-001-erro-500-usuario-bloqueado.md` | Bug | Resposta JSON, **log recolhido**, evidência, pronto para **Copiar para o Jira** |
| `execucoes/EXE-001-regressao-sprint-42.md` | Relatório de execução | **Resumo automático** (tabela + gráfico), resultados com `[[links]]`, filtro por status |
| `exploratorio/SES-001-checkout.md` | Sessão exploratória | Missão, notas com horário (BUG/DÚVIDA/IDEIA), tabela de bugs, **⏱ Sessão** |
| `planos/PT-001-plano-sprint-42.md` | Plano de teste | Diagramas **Mermaid** (fluxo e cronograma), critérios em checklist, riscos |
| `checklists/CHK-001-regressao-rapida.md` | Checklist | Contador por seção (`3/5`), **recolher seções**, filtro ☑ |
| `resumos/RES-001-resumo-sprint-42.md` | Resumo de testes | Métricas, qualidade por funcionalidade, recomendação |
| `recursos/tour-do-markdown.md` | — | **Tudo o que o editor sabe mostrar**: badges, destaques, cores, código, diagramas, imagens, links |
| `recursos/dados-sensiveis.md` | — | Área de teste da **proteção de dados sensíveis** |
| `automacao/junit.xml` · `playwright.json` · `newman.json` | Resultados de automação | Arraste um deles para o editor → relatório pronto |

## Roteiro de 15 minutos

Marque conforme for fazendo (o contador ao lado de cada título acompanha).

### 1. Ler e navegar

- [x] Abra esta pasta como pasta de trabalho (dica no topo)
- [x] Abra `casos/TC-002…` pela árvore da aba **Arquivos**
- [x] Alterne **Raw / Dividido / Preview** (`Alt+1`, `Alt+2`, `Alt+3`)
- [x] Clique em `[[BUG-001]]` dentro do TC-002 — abre numa aba nova; `Alt+PageUp` volta
- [x] Aba **Links** (barra lateral): veja quem cita o BUG-001
- [x] `Ctrl+Shift+P` (paleta) → digite `checkout` → abra o TC-004

### 2. Executar um teste

- [x] Abra `casos/TC-003…` e clique em **▶ Executar**
- [x] Marque os passos com `1`–`5`, digite um resultado obtido, cole um print com `Ctrl+V`
- [x] Experimente **⧉ Flutuar** (o painel fica por cima de outros programas)
- [x] **✓ Concluir** e veja o *Histórico de execuções* no fim do documento
- [x] No `EXE-001`, clique numa célula de Status e mude — o resumo e o gráfico acompanham

### 3. Organizar

- [x] `Ctrl+Shift+F` → busque `execucao` (sem acento) — acha "execução" em vários arquivos
- [x] Aba Arquivos → **📊 Painel**: clique em **FAIL** para filtrar; ordene por Prioridade
- [x] No `CHK-001`, recolha a seção *Login* pelo **▾** ao lado do título

### 4. Compartilhar

- [x] No `BUG-001`: **Copiar ▾ → Copiar para o Jira** (cole no Jira ou num e-mail para ver)
- [x] No `TC-004`: exporte o **PDF** e veja o aviso de dados sensíveis
- [x] **PDF ▾ → HTML (página única)** — abre em qualquer navegador
- [ ] Arraste `automacao/playwright.json` para o editor

## Dicas

- Nada aqui é enviado para fora: tudo fica nos seus arquivos. Os prints dos exemplos são imagens fictícias.
- Pode mexer à vontade — se estragar algo, pegue os arquivos de novo no `.zip` do projeto.
- Dúvidas: o manual completo está em `MANUAL.md` (raiz do projeto) e também no botão **?** do editor (tecla `F1`).
