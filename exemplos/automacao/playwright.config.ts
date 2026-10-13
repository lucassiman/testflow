// playwright.config.ts do projeto de automação da Loja Demo (C:\dev\loja-demo-e2e) — exemplo do TestFlow.
// Não roda daqui: é o arquivo que fica no repositório da automação. Toda noite o CI roda a suíte no HML e:
//  • o reporter do TestFlow grava o resultado direto na pasta de trabalho, numa execução nova
//    (execucoes/execucao-automatizada-loja-demo-e2e-…), com os testes instáveis marcados (⚠ instável);
//  • o reporter json guarda o mesmo resultado num arquivo (automacao/noturno/*.json — arraste um no editor).
// O trecho do TestFlow sai pronto em Automação ▾ → ⚡ Reporter ao vivo — como ligar… (com o caminho da sua pasta).
// Uma vez, na pasta do TestFlow: npm run reporter (gera reporter-dist/testflow.mjs).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // a raiz do projeto como base: os caminhos no relatório ficam tests/e2e/pix.spec.ts, o mesmo do campo
  // automacao: do TC-005 — assim o TestFlow liga o teste ao caso manual (coluna Caso)
  testDir: '.',
  testMatch: 'tests/e2e/**/*.spec.ts',
  // passou só na 2ª tentativa = "flaky": o TestFlow anota "passou só com retry" e conta como sinal de instabilidade
  retries: 1,
  use: {
    baseURL: 'https://hml.lojademo.test',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/pix-noturno.json' }],
    // troque os dois caminhos pelos seus (no Mac: '/Users/voce/…'); execucao: 'nova' = uma execução por noite
    ['C:/dev/markdown qa editor/reporter-dist/testflow.mjs', { pasta: 'C:/dev/markdown qa editor/exemplos', execucao: 'nova' }],
  ],
});
