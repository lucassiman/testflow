// Pacote da extensão "TestFlow — captura de bug" para mandar a um colega: extensao-dist/testflow-extensao.zip.
// Uso: npm run extensao. Para usar na própria máquina não precisa: no Chrome/Edge, "Carregar sem compactação"
// direto na pasta extensao/ (atualiza com git pull + ↻ na página de extensões).
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zip } from './zip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'extensao');
/** @param {string} d @returns {string[]} */
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(dir).map((p) => /** @type {[string, Buffer]} */ ([`testflow-extensao/${relative(dir, p).replace(/\\/g, '/')}`, readFileSync(p)]));
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
mkdirSync(join(root, 'extensao-dist'), { recursive: true });
writeFileSync(join(root, 'extensao-dist', 'testflow-extensao.zip'), zip(files));
console.log(`Extensão ${manifest.version}: extensao-dist/testflow-extensao.zip (${files.length} arquivos) — descompacte e use "Carregar sem compactação" no Chrome/Edge.`);
