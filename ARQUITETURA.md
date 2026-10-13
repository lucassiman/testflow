# Arquitetura do TestFlow

Visão geral para quem vai ler ou alterar o código. Para usar o app, veja o [Manual](MANUAL.md); para o formato dos documentos, [CONVENCOES-QA.md](CONVENCOES-QA.md).

## Princípios

1. **Tudo local.** Aplicação 100% no navegador (PWA), sem backend. Arquivos pela File System Access API (Chrome/Edge). Integrações externas são opcionais e desligadas por padrão.
2. **O Markdown é a única fonte da verdade.** Raw e Preview são visões do mesmo texto; nada é guardado no DOM. O Preview divide o documento em blocos de nível superior, cada um com as linhas de origem, e editar um bloco reescreve **só aquelas linhas** — e só se algo mudou. Alternar de modo nunca converte nada.
3. **Markdown padrão (GFM).** O app só *reconhece* convenções (cabeçalho YAML, status entre crases, `> [!NOTE]`, tabelas de passos, `[[links]]`) e as mostra de forma visual. O arquivo segue legível no GitHub, no VS Code e em wikis.
4. **Nada se perde.** Rascunho no navegador, `Ctrl+Z` que cobre tudo, versão anterior em `.versoes/` antes de gravar por cima, lixeira em vez de apagar e **Desfazer** em toda operação em vários arquivos.
5. **Lógica pura separada da tela.** As regras ficam em módulos sem DOM, testáveis no Node, e são reaproveitadas pelo servidor MCP.
6. **Segurança.** Todo HTML renderizado passa pelo DOMPurify, o CSS inline tem lista de propriedades permitidas e o Mermaid roda em `securityLevel: 'strict'`.

## Tecnologia

Vite + JavaScript com `// @ts-check` (tipos em JSDoc) e módulos de regras em TypeScript. CodeMirror 6 (Raw), markdown-it (Preview), turndown (Preview → Markdown), DOMPurify, highlight.js, Mermaid (carregado só quando há diagrama). Testes: `node:test` via `tsx` (unitários) e Playwright (telas). Build: `vite-plugin-pwa` (app instalável) e `vite-plugin-singlefile` (arquivo único).

## Mapa do código

| Pasta | O que tem |
| --- | --- |
| `src/main.js` | Montagem do app: abas, salvar, atalhos, paleta e o `switch` de comandos (`run()`), pasta de trabalho. |
| `src/ui/modules.js` | **Registro de módulos:** onde fica cada ação. Dele saem os menus do topo, as categorias da paleta, os ⋯ do painel da rodada e da barra Execução e os atalhos da tela inicial. Ação nova entra aqui e num `case` do `run()`. |
| `src/app/` | As áreas de funcionalidade, uma por módulo, que usam o editor pelo contexto `app` (`context.js`): organização de pastas, pasta oficial, ciclo de regressão, execução, evidências e captura, bug ligado, compartilhamento, automação, Notion, dicas. O que não depende de nada fica em `shared.js`. |
| `src/markdown/` | Regras puras em `.ts`: cabeçalho, estrutura de pastas, status, ciclo, relatórios, visões, publicação, Jira, previsão, edição em massa, wikilinks… |
| `src/io/` | Disco: operações de arquivo com diário e desfazer, índice da pasta, pasta oficial, versões, evidências, captura de tela e replay. |
| `src/editor/` | Raw (CodeMirror), Preview editável, tabelas, barra Execução. |
| `src/ui/` | Componentes: barra lateral, diálogos, paleta, painel de execução, painel da pasta, atalhos, "O que mudou". |
| `src/templates/` | Modelos de documento (os mesmos da skill do Claude). |
| `mcp/` | Servidor MCP local (Node, stdio). Um adaptador do `fs` do Node imita a File System Access API para reaproveitar os módulos do app; `server.ts` registra as ferramentas `qa_*`. |
| `reporter/` | Reporter da automação (Playwright) e comando `importar` (JUnit, Playwright, Newman), por cima do mesmo núcleo do MCP. |
| `extensao/` | Extensão opcional do Chrome/Edge (Manifest V3): console, rede e contexto da aba testada; ponte com o app; Jira pela API; avisos no Teams. |
| `scripts/` | Builds do MCP, da skill, da extensão e do reporter; executor dos testes. |
| `exemplos/` | A Loja Demo, usada no tour e conferida por testes. |
| `tests/unit`, `tests/e2e` | Testes unitários e de tela. |

## Estrutura da pasta de trabalho do usuário

```
_entrada/                      o que chega sem destino (nota rápida, importados)
aplicacoes/<App>/
  casos/[<ÉPICO>/<TICKET>/]    um caso por arquivo, uma pasta por épico e por ticket
  bugs/ planos/ sessoes/ relatorios/ docs/ requisitos/
processos/  modelos/  visoes/  configuracao/
.versoes/  _lixeira/           histórico e lixeira (fora de listas e buscas)
```

## Conceitos que atravessam o código

- **`uid:`** no cabeçalho é a identidade fixa de um documento; links ficam legíveis (`[[TC-042]]`) e acompanham trocas de ID, nome ou pasta.
- **Pasta de trabalho × pasta oficial:** a primeira é do usuário; a segunda é compartilhada. Publicar grava revisão (`revisao`, `publicado_*`); sincronizar traz e envia em lote; conflitos ficam de fora.
- **Ciclo × execução:** o ciclo é a definição dos casos da regressão; a execução é uma ocorrência dele, com status por caso e encerramento.
- **Operações em vários arquivos** passam pelo diário de `fsOps` e alimentam o **Desfazer**.
- **Nomes internos herdados:** as chaves `mdqa:*` (localStorage), o banco `md-qa-editor` (IndexedDB), o id do MCP `markdown-qa` e a skill `qa-markdown` mantêm o nome antigo de propósito — trocá-los apagaria dados ou duplicaria a extensão.

## Limitações conhecidas

- Gravar direto nos arquivos exige Chrome ou Edge; em outros navegadores salvar faz download.
- A edição visual de tabelas complexas, HTML bruto e listas muito aninhadas pode normalizar a formatação *daquele bloco* (o `</>` abre o Markdown dele).
- Cores inline não aparecem no GitHub; o significado vai em badges e destaques.
- A extensão não observa iframes e não captura tempos detalhados de rede.
