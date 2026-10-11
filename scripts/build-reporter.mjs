// Empacota o reporter do TestFlow num arquivo só (sem node_modules): reporter-dist/testflow.mjs.
// Uso: npm run reporter
//   Playwright: reporter: [['list'], ['<caminho>/reporter-dist/testflow.mjs', { pasta: 'C:/dev/qa' }]]
//   Outros (JUnit XML): node <caminho>/reporter-dist/testflow.mjs importar junit.xml --pasta C:/dev/qa
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, statSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
mkdirSync(new URL('reporter-dist/', root), { recursive: true });
const outfile = fileURLToPath(new URL('reporter-dist/testflow.mjs', root));

await build({
  entryPoints: [fileURLToPath(new URL('reporter/testflow.ts', root))],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
  // dependências CommonJS dentro do pacote ESM
  banner: { js: `// TestFlow ${pkg.version} — reporter (gerado por npm run reporter; não edite)\nimport { createRequire as __qaRequire } from 'node:module'; const require = __qaRequire(import.meta.url);` },
  logLevel: 'warning',
});
console.log(`Reporter: reporter-dist/testflow.mjs (${Math.round(statSync(outfile).size / 1024)} KB) — versão ${pkg.version}`);
