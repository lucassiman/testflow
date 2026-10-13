# Exemplos — tour guiado do TestFlow

Esta pasta é um **projeto de QA fictício** (a "Loja Demo") para você conhecer o editor na prática. Tudo aqui é Markdown comum: abre também no GitHub e no VS Code. A história começa na Sprint 42 (login e checkout, versão 2.14.0) e segue na Sprint 43 (épico *Pagamento com Pix*, versão 2.15.0).

> [!TIP]
> **Comece assim:** no editor, `☰` → aba **Arquivos** → **Abrir…** e escolha esta pasta `exemplos`. Ela vira a *pasta de trabalho*: os links `[[TC-002]]` passam a abrir os documentos, a busca e o painel enxergam todos os arquivos, e colar prints já salva em `evidencias/`.

Este roteiro é a **volta rápida (15 minutos)**. Para ver cada menu do topo com um exemplo próprio — Casos, Execução, Evidências, Automação, Publicar e Compartilhar —, siga depois o [`LEIA-ME-por-modulo.md`](LEIA-ME-por-modulo.md).

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
| `casos/QA-400 Pagamento com Pix/` · `compartilhados/` · `execucoes/` · `releases/` · `visoes/` · `acompanhamento/` | Sprint 43 | O épico do Pix, logins por ambiente, ciclo de regressão com 3 execuções, release, visões e a página da rodada — o roteiro está no `LEIA-ME-por-modulo.md` |

## Roteiro de 15 minutos

Marque conforme for fazendo (o contador ao lado de cada título acompanha).

### 1. Ler e navegar

- [ ] Abra esta pasta como pasta de trabalho (dica no topo)
- [ ] Abra `casos/TC-002…` pela árvore da aba **Arquivos**
- [ ] Alterne **Raw / Dividido / Preview** (`Alt+1`, `Alt+2`, `Alt+3`)
- [ ] Clique em `[[BUG-001]]` dentro do TC-002 — abre numa aba nova; `Alt+PageUp` volta
- [ ] Aba **Links** (barra lateral): veja quem cita o BUG-001
- [ ] `Ctrl+Shift+P` (paleta) → digite `checkout` → abra o TC-004

### 2. Executar um teste

- [ ] Abra `casos/TC-003…` e clique em **▶ Executar**
- [ ] Marque os passos com `1`–`5`, digite um resultado obtido, cole um print com `Ctrl+V`
- [ ] Experimente **⧉ Flutuar** (o painel fica por cima de outros programas)
- [ ] **✓ Concluir** e veja o *Histórico de execuções* no fim do documento
- [ ] No `EXE-001`, clique numa célula de Status e mude — o resumo e o gráfico acompanham

### 3. Organizar

- [ ] `Ctrl+Shift+F` → busque `execucao` (sem acento) — acha "execução" em vários arquivos
- [ ] Aba Arquivos → **📊 Painel**: clique em **FAIL** para filtrar; ordene por Prioridade
- [ ] No `CHK-001`, recolha a seção *Login* pelo **▾** ao lado do título

### 4. Compartilhar

- [ ] No `BUG-001`: **Compartilhar ▾ → Copiar para o Jira** (cole no Jira ou num e-mail para ver)
- [ ] No `TC-004`: exporte o **PDF** (**Compartilhar ▾ → Exportar → PDF**) e veja o aviso de dados sensíveis
- [ ] **Compartilhar ▾ → Exportar → HTML (página única)** — abre em qualquer navegador
- [ ] Arraste `automacao/playwright.json` para o editor

## Dicas

- Nada aqui é enviado para fora: tudo fica nos seus arquivos. Os prints e vídeos dos exemplos são imagens fictícias.
- Pode mexer à vontade. Para voltar os arquivos ao original: `git restore exemplos` (e `git clean -fd exemplos` para tirar os que você criou).
- Dúvidas: o manual completo está em `MANUAL.md` (raiz do projeto) e também no botão **?** do editor (tecla `F1`).
