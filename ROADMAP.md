# Roadmap do TestFlow

*Atualizado em 13/10/2026.* Este documento mostra para onde o projeto vai, para quem não acompanhou o desenvolvimento. O que o app faz hoje está no [Manual](MANUAL.md); as novidades de cada versão aparecem no próprio app, em `Ctrl+Shift+P` → **O que mudou**.

## Direção

O TestFlow existe para que a documentação de QA seja **Markdown comum**, fique **no seu computador** e, mesmo assim, seja **interativa**: executar, registrar evidências, acompanhar a regressão e devolver o resultado para Jira, Notion e Claude sem copiar e colar no escuro.

Quatro princípios guiam toda decisão:

1. **Markdown puro é o formato.** O arquivo segue bonito no GitHub, no VS Code e em qualquer wiki. O significado vai em convenções legíveis, não em recursos que só o app entende.
2. **Local primeiro.** Sem nuvem, sem login. Integrações são opcionais, uma a uma, desligadas por padrão.
3. **Claude e app falam a mesma língua.** O mesmo formato (QA-MD) serve ao app, à skill e ao servidor MCP.
4. **Nunca perder nem reescrever o que você não tocou.** Histórico de versões, lixeira e desfazer em tudo.

## Onde estamos

A base está pronta e em uso diário. Em linhas gerais:

| Área | O que já funciona |
| --- | --- |
| **Escrever e editar** | Raw e Preview editável, tabelas, diagramas Mermaid, colar inteligente (Excel, JSON, logs, prints), links `[[ID]]` que acompanham renomeações, modelos próprios. |
| **Documentos de QA** | Casos, bugs, planos, BDD, sessões exploratórias, checklists, épicos, histórias e releases; dados e passos compartilhados por ambiente; casos com dados; aprovação do caso. |
| **Executar** | Status clicável, execução passo a passo com cronômetro, painel flutuante, rodadas e ciclos de regressão, atribuição entre testadores, previsão de término, reteste das falhas com o teste de confirmação dos bugs, matriz de configurações, status personalizados. |
| **Relatórios e acompanhamento** | Quatro relatórios de fim de execução (Go/No-Go, defeitos, rastreabilidade, log comparativo), tendência entre rodadas, visões salvas, painel da pasta, página da rodada para o time, avisos no Teams. |
| **Evidências e bugs** | Prints com anotação, captura de tela, vídeo, replay instantâneo, bug ligado ao passo que falhou com reincidência, console e rede da aba testada (extensão). |
| **Automação** | Importação de JUnit, Playwright e Newman, reporter ao vivo, testes instáveis, exportação de `.feature`. |
| **Equipe** | Pasta oficial compartilhada com revisões, sincronização, histórico com comparação, comentários de revisão e aviso de edição simultânea. |
| **Claude** | Skills `qa-markdown` e `qa-varredura`, servidor MCP com 39 ferramentas, cópia para o Claude e revisão de texto com conferência. |
| **Rotina do QA** | Diário (começar e fechar o dia, tarefas que passam de um dia para o outro, reuniões com decisões e ações, a semana), teste em dupla com o dev por ticket e um comparador de JSON local. |
| **Organização** | Estrutura por aplicação/épico/ticket, triagem da entrada, importação do Notion e de planilhas (TestRail, Zephyr, Xray, Excel), backup, busca com filtros. |
| **Aprender** | Manual embutido, tela inicial, dicas de primeira vez e a pasta `exemplos/` com roteiros por módulo. |

## Próximos passos

Ideias em estudo, **sem data nem compromisso**. A ordem pode mudar conforme o uso real mostrar o que dói mais.

| Tema | Ideia | Por quê |
| --- | --- | --- |
| **Uso em equipe** | Validar a pasta oficial em disco de nuvem (OneDrive, Drive) com mais de uma pessoa: tempo de leitura, conflitos, avisos de edição. | É o primeiro uso com mais de um QA; o desempenho depende do sincronizador. |
| **Clareza de uso** | Revisar menus, nomes e caminhos da interface com quem está chegando agora, e melhorar o roteiro de primeiros passos. | O app cresceu rápido; o objetivo é que continue fácil de aprender. |
| **Extensão do navegador** | Cobrir iframes e simplificar a instalação. | Hoje a captura de console e rede não enxerga iframes e a instalação é manual. |
| **Mais formatos de saída** | Exportar casos em formatos de outras ferramentas de teste e para wikis/hubs Markdown. | Facilitar a convivência com quem usa outro sistema. |
| **Distribuição** | Abrir e instalar o app por um link, sem Node nem Git; a atualização chega sozinha. Os dados continuam no computador de cada um. | Hoje exige Node e Git, o maior obstáculo para outra pessoa começar. |
| **Retrato da qualidade** | Um relatório por sprint ou mês, gerado a partir dos documentos: bugs por fase (teste em dupla, DEV, HML, PRD), o que escapou para homologação, tempo de execução e reincidência. | Mostrar o trabalho de QA em números, sem planilha à parte, e saber se o teste em dupla está pegando os bugs antes. |
| **Agenda** | Trazer as reuniões do calendário do Outlook/Teams para o diário (calendário publicado ou conector do Microsoft 365). | Hoje as reuniões são anotadas à mão; o link do Teams só cria a reunião. |
| **Resultados de automação** | Mais reporters e formatos de relatório. | Cobrir mais frameworks além de Playwright, JUnit e Newman. |

## Fora do escopo (por decisão)

- **Backend, contas e nuvem própria.** O TestFlow é local, com pasta compartilhada.
- **Papéis, permissões e auditoria.** Fazem sentido em ferramenta de nuvem com time grande, não aqui.
- **Avisos por Slack ou e-mail.** O canal integrado é o Microsoft Teams.
- **App nativo (Quick Look, Tauri).** O app instalado pelo navegador e o "Abrir com" já resolvem.
- **Capturar rede com depuração do navegador.** Evita a barra amarela e conflito com o DevTools; a captura atual usa scripts na página.

## Como acompanhar e opinar

- Novidades de cada versão: `Ctrl+Shift+P` → **O que mudou**.
- Problemas e sugestões: abra uma *issue* no repositório.
