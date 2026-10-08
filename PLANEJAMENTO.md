# TestFlow — Planejamento técnico

> Regra do projeto: **primeiro um excelente editor Markdown simples e rápido; depois, gradualmente, uma ferramenta de documentação e execução de testes de QA.**

---

## 1. Arquitetura proposta

Aplicação **100% client-side** (sem backend), com uma **única fonte da verdade**: a string Markdown (`source`).

```
                ┌──────────────── store (source, arquivo, dirty, histórico) ───────────────┐
                │                                                                          │
   Raw (textarea) ──edita texto──▶ source ──parse (markdown-it, com mapa de linhas)──▶ blocos
                                     ▲                                                     │
                                     │                                     render por bloco + DOMPurify
                                     │                                                     ▼
                     splice das linhas do bloco ◀── turndown (HTML→MD) ◀── Preview editável (contenteditable)
```

- **Raw** e **Preview** são apenas *visões* do `source`. Nada é guardado no DOM como verdade.
- O Preview é dividido em **blocos de nível superior** (parágrafo, título, lista, tabela, código, citação…). Cada bloco sabe de quais linhas do Markdown veio (`data-start`/`data-end`).
- Editar no Preview altera **somente as linhas daquele bloco**. O resto do arquivo nunca é reescrito.

## 2. Tecnologia escolhida e justificativa

**HTML + CSS + JavaScript puro (ES Modules), empacotado com Vite.**

| Opção | Por que sim / não |
|---|---|
| **JS puro + Vite** ✅ | Sem runtime de framework, inicialização instantânea, código direto. Vite dá dev server com reload, bundling e *code splitting* (Mermaid só é carregado quando existe um diagrama). |
| TypeScript | Útil quando o modelo de dados de QA crescer. Pode ser adotado depois, arquivo por arquivo (Vite suporta nativamente). No MVP adicionaria cerimônia sem ganho real. Usamos JSDoc onde ajuda. |
| React / Vue | O coração da app é um `textarea` e um bloco `contenteditable` — virtual DOM atrapalha mais do que ajuda na edição de texto rico. Seria dependência sem necessidade. |
| Electron/Tauri | Desnecessário: a File System Access API (Chrome/Edge) já permite abrir e salvar `.md` no disco. Pode virar app desktop depois (Tauri) sem reescrever nada. |

## 3. Bibliotecas

| Biblioteca | Papel |
|---|---|
| `markdown-it` | Parser/renderizador CommonMark + GFM (tabelas, strikethrough). Fornece **mapa de linhas** de cada bloco — é o que torna a edição no Preview possível sem parser próprio. |
| `highlight.js` (core + linguagens selecionadas) | Syntax highlighting (JS, TS, JSON, HTML/XML, CSS, Bash, Python, Java, C#, SQL, YAML, **Gherkin**, HTTP, Markdown). |
| `mermaid` | Diagramas. Carregado sob demanda (*lazy*), com `securityLevel: 'strict'`. |
| `dompurify` | Sanitização de todo HTML renderizado (anti-XSS). |
| `turndown` + `turndown-plugin-gfm` | Converte HTML editado no Preview de volta para Markdown (inclui tabelas e tasks). |
| `vite` (+ `vite-plugin-singlefile`) | Build. Gera também uma versão **arquivo único** (`index.html` portátil, abre com duplo clique). |

## 4. Estrutura de pastas

```
md-qa-editor/
├─ index.html                 # layout (header, toolbar, área de edição, status bar)
├─ src/
│  ├─ main.js                 # composição da app (liga os módulos)
│  ├─ core/
│  │  ├─ store.js             # estado do documento + eventos
│  │  └─ history.js           # undo/redo por snapshots
│  ├─ markdown/
│  │  ├─ parser.js            # markdown-it + divisão em blocos com linhas de origem
│  │  ├─ sanitize.js          # DOMPurify + whitelist de CSS inline
│  │  ├─ toMarkdown.js        # turndown configurado para preservar o estilo
│  │  ├─ taskList.js          # checkboxes - [ ] / - [x] com linha de origem
│  │  ├─ lint.js              # avisos (bloco de código não fechado, etc.)
│  │  └─ plugins.js           # ponto de extensão (futuros blocos de QA)
│  ├─ editor/
│  │  ├─ raw.js               # modo Raw (textarea)
│  │  ├─ preview.js           # render incremental + edição por bloco
│  │  ├─ mermaid.js           # lazy load, cache, erro, copiar/exportar/zoom
│  │  └─ commands.js          # comandos da toolbar (Raw e Preview)
│  ├─ io/
│  │  ├─ files.js             # abrir/salvar (.md) + fallback download
│  │  └─ drafts.js            # rascunho automático (localStorage)
│  ├─ ui/
│  │  ├─ shortcuts.js         # atalhos de teclado
│  │  └─ toolbar.js           # toolbar e menus (sem roubar o foco)
│  ├─ welcome.md              # documento de exemplo exibido na primeira abertura
│  └─ styles/                 # CSS (tema claro/escuro por variáveis)
└─ PLANEJAMENTO.md
```

## 5. Fluxo de funcionamento

1. Abre → restaura o rascunho (se houver) ou mostra um documento de boas-vindas.
2. Usuário digita no **Raw** → `source` muda → histórico registra → Preview re-renderiza (debounce ~100 ms, só blocos alterados).
3. Usuário clica num bloco do **Preview** → o bloco vira editável → ao sair (clique fora, `Esc`, `Ctrl+Enter`) o HTML é convertido e **somente as linhas do bloco** são substituídas.
4. Cada mudança agenda salvamento de rascunho e marca o documento como “não salvo” (●).
5. `Ctrl+S` grava no mesmo arquivo `.md` (Chrome/Edge) ou baixa o arquivo (outros navegadores).

## 6. Estratégia Raw ↔ Preview

- Três modos: **Raw**, **Dividido** (lado a lado) e **Preview**. `Ctrl+E` alterna; `Alt+1/2/3` vai direto.
- Alternar modos nunca converte nada: o Raw é o texto; o Preview é derivado. **Impossível perder conteúdo alternando.**
- No modo Dividido, rolagem sincronizada; `Alt+clique` num bloco do Preview leva à linha correspondente no Raw.
- Render incremental: cada bloco é cacheado pelo seu texto; só blocos alterados geram HTML novo (bom para documentos grandes).

## 7. Estratégia de edição no Preview

**Edição por bloco**, não do documento inteiro:

| Tipo de bloco | Como edita |
|---|---|
| Parágrafo, título, lista, tasks, citação, tabela | `contenteditable` no próprio bloco renderizado (edição visual). |
| Bloco de código, Mermaid, HTML bruto | Mini-editor do Markdown daquele bloco, no lugar (conversão visual não seria confiável). |
| Qualquer bloco | Botão `</>` no hover: “editar este bloco como Markdown” (válvula de escape previsível). |

Regras de segurança da conversão:
- Se o HTML do bloco **não mudou**, nada é escrito — o Markdown original fica byte a byte idêntico.
- Se mudou, `turndown` converte **somente aquele bloco**, respeitando o estilo detectado (marcador `-`/`*`, títulos `#`), sem escapar `_` dentro de palavras (`test_login`).
- Checkboxes do Preview são clicáveis e alteram apenas o caractere `[ ]`/`[x]` da linha (plugin próprio de ~40 linhas, sem dependência extra).
- Tabelas: a linha separadora original (`| --- | :---: |`) é mantida quando o número de colunas não muda.
- Arquivos com quebra de linha Windows (CRLF) e BOM são salvos no mesmo formato em que foram abertos.
- Se a conversão falhar, o bloco é restaurado e o Markdown não é tocado.

## 8. Estratégia para Mermaid

- Blocos ```` ```mermaid ```` viram diagrama no Preview; no Raw continuam texto normal.
- Mermaid é importado **só quando aparece o primeiro diagrama** (inicialização rápida).
- `securityLevel: 'strict'` (sem scripts/cliques); o SVG resultante ainda passa pelo DOMPurify (perfil SVG).
- Cache por código+tema: re-render de outros blocos não redesenha o diagrama.
- Erro de sintaxe → caixa de erro com a mensagem, código preservado.
- MVP já inclui: **copiar código**, **exportar SVG**, **zoom** (duplo clique ou ⤢, tela cheia, `Ctrl+roda`) e **editar código** no próprio Preview (botão `</>`).

## 9. Estratégia para cores e tamanho do texto

- Guardados como **HTML inline dentro do Markdown**, que continua legível e portátil:
  `<span style="color:#d93025">Resultado NOK</span>`
- Paleta de QA: 🔴 vermelho (problema), 🟢 verde (sucesso), 🟡 âmbar (atenção), 🔵 azul (info) + remover cor.
- **Tamanho do texto = zoom de leitura do Preview** (A− / 100% / A+, de 80% a 200%, `Ctrl+Alt+=` / `Ctrl+Alt+-` / `Ctrl+Alt+0`). É uma preferência de exibição salva no navegador: **não altera o Markdown**. Substituiu o tamanho por trecho (que usava `em` relativo e, ao ser reaplicado no mesmo texto, se multiplicava). Spans `font-size` já existentes em arquivos continuam sendo exibidos.
- Funciona igual no Raw (envolve a seleção) e no Preview (envolve a seleção visual).
- Sanitizador só aceita propriedades CSS de uma **whitelist** (color, background-color, font-size, font-weight, text-align…), sem `url()`.

## 10. Como preservar o Markdown original

- Fonte única = texto. O Preview nunca “regrava” o documento.
- Edição visual reescreve **apenas as linhas do bloco editado**, e só se algo mudou.
- Blocos não suportados visualmente (código, Mermaid, HTML) são editados como texto.
- Linhas em branco, front-matter, comentários HTML e espaçamentos entre blocos ficam intocados.

## 11. Como evitar perda de conteúdo

- Rascunho automático em `localStorage` (a cada alteração, com debounce) + restauração ao abrir.
- Aviso ao fechar a aba com alterações não salvas.
- Undo/redo próprio (`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`) cobrindo Raw **e** edições do Preview.
- Markdown incompleto nunca é “corrigido”: o Raw permanece exatamente como digitado; o Preview mostra um aviso (ex.: “bloco de código aberto na linha 12 não foi fechado”).

## 12. MVP (esta entrega)

- Novo / abrir / salvar / salvar como `.md`, arrastar e soltar arquivo, colar Markdown.
- Raw, Dividido, Preview; edição por bloco no Preview.
- Títulos, listas, listas numeradas, tabelas, links, imagens, negrito, itálico, código inline, blocos com highlight, citações, tasks.
- Mermaid (render, erro, copiar, exportar SVG, zoom, editar).
- Cor de texto e ajuste do tamanho do texto do Preview.
- Atalhos: `Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+O`, `Alt+N` (novo), `Ctrl+Z`, `Ctrl+Shift+Z`/`Ctrl+Y`, `Ctrl+B`, `Ctrl+I`, `Ctrl+K`, `Ctrl+E` (alterna modo), `Alt+1/2/3` (Raw/Dividido/Preview). `Ctrl+N` e `Ctrl+1..3` são reservados pelo navegador.
- Tema claro/escuro (automático + botão), responsivo, avisos de Markdown, sanitização.

## 13. Versões futuras

1. **Caixas de destaque** (info/warning/erro/sucesso) via sintaxe GitHub `> [!NOTE]` + badges `PASS/FAIL/BLOCKED`.
2. **Blocos de QA** como plugins do `markdown/plugins.js`: Test Case, Suite, Steps, Expected/Actual, Status, Prioridade, Severidade, Tags, Ambiente, Browser, Versão — renderizados como componentes, salvos como Markdown/front-matter.
3. **Evidências**: colar screenshot → salvar em pasta `evidencias/` ao lado do `.md`; blocos colapsáveis para JSON/XML/HAR/logs.
4. **Importar resultados** de Playwright/Cypress/Newman (JSON/JUnit XML) → tabela PASS/FAIL.
5. Editor Raw com CodeMirror 6 (numeração, busca, highlight do Markdown) — hoje é `textarea` para leveza.
6. Pasta de trabalho (lista de arquivos), múltiplas abas, exportar HTML/PDF.
7. Integrações (Git, Jira, Azure DevOps, CI) e app desktop (Tauri).

## 14. Limitações técnicas conhecidas

- Edição visual de **tabelas complexas, HTML bruto e listas muito aninhadas** pode normalizar a formatação daquele bloco (ex.: alinhamento de colunas da tabela). Por isso só o bloco editado é afetado e o `</>` está sempre disponível.
- O *turndown* pode escapar caracteres especiais digitados no Preview (ex.: `*` vira `\*`), o que é correto para manter o texto literal.
- Abrir/salvar direto no disco depende da File System Access API (Chrome/Edge). Em Firefox/Safari, “Salvar” faz download.
- Cores inline não aparecem no GitHub (ele remove `style`); o texto continua íntegro.
- `localStorage` guarda só um rascunho (~5 MB). Documentos com imagens embutidas grandes devem ser salvos em arquivo.

## 15. Plano de implementação por etapas

| Etapa | Entrega | Status |
|---|---|---|
| 1 | Estrutura Vite, store, histórico, Raw, render com markdown-it + sanitização | ✅ MVP |
| 2 | Preview por blocos com mapa de linhas + render incremental | ✅ MVP |
| 3 | Edição por bloco no Preview (contenteditable ↔ turndown) + checkboxes | ✅ MVP |
| 4 | Toolbar e atalhos (Raw e Preview), cor e tamanho do Preview | ✅ MVP |
| 5 | Mermaid lazy + ações (copiar/exportar/zoom/editar) | ✅ MVP |
| 6 | Arquivos (.md), rascunho, aviso de saída, dark mode, avisos de lint | ✅ MVP |
| 7 | Caixas de destaque + badges de status | próxima |
| 8 | Blocos de QA (Test Case) como plugins | futura |
| 9 | Evidências e importação de resultados automatizados | futura |
