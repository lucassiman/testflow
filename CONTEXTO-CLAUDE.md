# Contexto para o Claude — TestFlow

Leia isto antes de mexer no projeto. Depois, `ROADMAP.md` (uma nota por versão: o que mudou e por quê) e `README.md`.

## O que é

PWA **local** (sem nuvem, sem servidor) para documentação de QA em Markdown no formato **QA-MD** (`CONVENCOES-QA.md`):
casos de teste, bugs, planos, sessões exploratórias, relatórios, épicos/histórias, visões (consultas salvas) e ciclos de regressão.
Usuário: QA em pt-BR (Windows `C:\dev\markdown qa editor` e um Mac). Jira Cloud: `https://ngosolucoes.atlassian.net`.
Versão atual: ver `package.json` (1.5.0 quando este arquivo foi escrito). **Interface, textos, comentários e commits em português do Brasil.**

**Restrições:** tudo local; não sobrescrever a pasta `exemplos/` do usuário; nada é apagado sem lixeira/desfazer;
antes de gravar por cima, versão anterior em `.versoes/`.

## Stack e comandos

- Vite + JavaScript com `// @ts-check` (JSDoc) + módulos puros em `.ts`. CodeMirror 6 (Raw), markdown-it (Preview), turndown (Preview → Markdown).
- `npm run check` — tsc no app e no MCP (tem que passar sem erro).
- `npm test` — testes unitários (`tests/unit/*.test.mjs`, node:test via tsx).
- `npx playwright test` — testes de tela (`tests/e2e/*.spec.mjs`). Se o Playwright pedir um navegador que não está baixado, aponte um já instalado: `PW_CHROMIUM=…\ms-playwright\chromium_headless_shell-<n>\chrome-headless-shell-win64\chrome-headless-shell.exe`. Pasta de trabalho simulada com OPFS: `wsInit` em `tests/e2e/helpers.mjs` (`__write/__read/__ls`).
- `npm run build` (dist/ PWA) · `npm run build:single` (dist-single/index.html, um arquivo só)
- `npm run mcp:build` → `mcp-dist/qa-mcp.mjs` + `mcp-dist/testflow.mcpb` (extensão do Claude desktop) · `npm run skill` → `claude-skill/`

## Estrutura do código

| Pasta | O quê |
| --- | --- |
| `src/main.js` | Montagem do app: abas, salvar (`doSave`), atalhos, paleta e `switch` em `run()`, pasta de trabalho (`loadWorkspaceFiles`). |
| `src/ui/modules.js` | **Onde fica cada ação** (desde a 1.57.0): módulos (Arquivo, Casos, Execução, Evidências e bugs, Automação, Publicar, Compartilhar, Pasta, Editar e exibir, Ajuda) → menus do topo **e** categorias da paleta. Ação nova: entra aqui + `case` no `run()`; `tests/unit/modules.test.mjs` confere. Desde a 1.58.0 também os **⋯** do painel da rodada (`moreRefs` em `cyclePanel.js`, `data-cp`) e da barra Execução (`EXEC_BAR_MORE`), e os atalhos da tela inicial (`HOME_SHORTCUTS`) — texto e módulo vêm do registro; o teste confere ainda o *Onde fica…?* e todas as referências `Menu ▾ → item` / `Ctrl+Shift+P → texto` do MANUAL. Nos testes de tela, `roundMore(page, 'assign')` abre o ⋯ do painel. |
| `src/app/*` | Funcionalidades que usam o contexto `app` (`context.js`): `organize` (mover/renomear/lixeira/ticket), `collab` (pasta oficial: novidades, ⇅ sincronizar, "fulano editando"), `publishing`, `cycle` (ciclo de regressão), `nextCase`, `execution`, `evidence`/`evidencePanel`, `place` (📍 de onde é o documento), `linkPicker` (`[[`), `idSync` (uid/ID trocado), `views`, `templates`, `share` (Jira/Notion/Claude), `shared.js` (elementos, `docIndex`, `menu`). |
| `src/markdown/*.ts` | Lógica pura e testável: `frontmatter`, `structure` (pastas, `suggestDestination`, ticket), `idRename`, `officialSync`, `publish`, `views`, `cycle`, `status`, `relink`, `wikilinks`, `jira`… |
| `src/io/*` | Disco: `fsOps` (diário/desfazer), `organizer`, `docIndex`, `publisher` (oficial), `versions`, `workspace`, `evidence`. |
| `src/ui/*` | Componentes: `sidebar`, `dialog` (`showDialog`), `commandMenu`, `runner` (execução passo a passo), `dashboard`, `shortcuts`… |
| `src/editor/*` | Preview editável (`preview.js`), Raw, tabelas, barra de execução. |
| `src/templates/*.md` | Modelos de documento. |
| `mcp/` | Servidor MCP local (Node): `nodefs.ts` adapta o fs do Node à File System Access API para reaproveitar os módulos do app; `qa.ts` (ferramentas), `server.ts` (17 ferramentas `qa_*`). |
| `scripts/` | builds (MCP, skill, extensão), `run-tests.mjs`, `skill-intro.md` (texto da skill). |
| `reporter/` | Reporter da automação (11.5): reporter do Playwright e comando `importar` (JUnit/Playwright/Newman) que gravam na execução pelo `QaWorkspace.attachAutomation` do MCP. JUnit no Node: `src/io/miniXml.js`. |
| `extensao/` | Extensão opcional do Chrome/Edge (11.4): guarda o console das abas testadas e responde ao app pela ponte (`window.postMessage` ↔ `conteudo.js` ↔ `fundo.js`). Só páginas locais com `<meta name="testflow">` falam como TestFlow. Lado do app: `src/io/extBridge.js`, `src/app/bugCapture.js`, `src/markdown/bugCapture.ts`. Teste com a extensão real: `PW_EXTENSAO=1 npx playwright test extensaoReal`. |

Estrutura da pasta de trabalho do usuário: `_entrada/`, `aplicacoes/<App>/{casos[/<TICKET>],bugs,planos,sessoes,relatorios,requisitos,docs}`, `processos/`, `modelos/`, `visoes/`, `.versoes/`, `_lixeira/`.

## Conceitos importantes

- **`uid:`** no cabeçalho = identidade fixa. Links ficam legíveis (`[[TC-042]]`); trocar o `id:` reescreve título/menções e os `[[links]]` da pasta (editor no Ctrl+S, MCP em `qa_atualizar_cabecalho`, e trocas feitas fora são detectadas pelo mapa uid→id).
- **Pasta oficial** (compartilhada) × pasta de trabalho (do usuário): publicar dá revisão (`revisao`, `publicado_*`); ⇅ Sincronizar traz/envia em lote; conflitos ficam de fora.
- Operações em vários arquivos usam o **diário** (`fsOps` journal) + `organizer.remember/undo` para o **Desfazer** no aviso.

## Nome do app (desde 1.19.0)

O app se chama **TestFlow** (antes: Markdown QA Editor). Nome visível vem de `branding.json`; ícones em `public/icons/` (desenho ✓→seta). **Identificadores internos ficaram com o nome antigo de propósito** — trocar apagaria dados ou duplicaria a extensão: chaves `mdqa:*` (localStorage), banco `md-qa-editor` (IndexedDB), ids dos seletores de pasta `mdqa-*`, id do MCP `markdown-qa` (ferramentas `qa_*`), skill `qa-markdown` e o formato **QA-MD**.

## Rotina de entrega de uma versão

1. Implementar + testes (unitário para a lógica pura, e2e para o fluxo na tela).
2. Subir a versão em `package.json` e `package-lock.json` (2 lugares).
3. Entrada nova no topo de `src/changelog.js` (cartão "O que mudou"; `manual:` = início do título da seção do MANUAL).
4. **Atualizar o teste do "O que mudou"** em `tests/e2e/editor.spec.mjs` (prefs `version` = uma versão anterior e os textos esperados) — ele quebra a cada versão.
5. Documentar: `MANUAL.md` (seção certa + "Onde fica…?" + atalhos), `ROADMAP.md` (nota da versão), `README.md`; se mudar o formato: `CONVENCOES-QA.md` e `scripts/skill-intro.md`; se mudar o MCP: descrição em `mcp/server.ts` e seção 12.6 do MANUAL.
6. `npm run check` · `npm test` · `npx playwright test` · `npm run mcp:build` · `npm run skill` · `npm run extensao` · `npm run reporter` · `npm run build` · `npm run build:single`. Se mudou a extensão: subir a `version` de `extensao/manifest.json`.
7. Avisar o usuário se precisa reinstalar `mcp-dist\testflow.mcpb` no Claude desktop (só quando o MCP mudou).
8. **Entregar pelo Git** (desde 07/10/2026): commit na pasta do Windows (o repositório privado no GitHub) e o usuário faz `git push`; no Mac ele faz `git pull` + `npm install` + `npm run app`. Não mandar zip para copiar por cima (arquivos removidos ficavam para trás). `_local/` é só da máquina e não sobe.

## Estilo das respostas ao usuário

Português do Brasil, direto: o que mudou, como usar (onde clicar), o que fica de fora/limites. Sem passo a passo do que foi feito por dentro.
