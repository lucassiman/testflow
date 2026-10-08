// npm test — roda os testes de tests/unit/*.test.mjs com o test runner do próprio Node. O `tsx` (npm test) deixa importar os módulos .ts.
import { readdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'unit');
const only = process.argv[2];
for (const f of readdirSync(dir).filter((n) => n.endsWith('.test.mjs')).sort()) {
  if (only && !f.includes(only)) continue;
  // arquivo que nem carrega (import errado…) não pode passar em silêncio
  try { await import(pathToFileURL(join(dir, f)).href); } catch (err) { console.error(`\n✗ ${f} não carregou:`, err); process.exitCode = 1; }
}
