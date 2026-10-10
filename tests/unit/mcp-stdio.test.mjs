// O servidor de verdade, conversando pelo stdin/stdout com o cliente MCP (como o Claude desktop faz).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function withServer(args, fn) {
  const transport = new StdioClientTransport({ command: process.execPath, args, stderr: 'pipe' });
  const client = new Client({ name: 'teste', version: '1.0.0' });
  await client.connect(transport);
  try { await fn(client); } finally { await client.close(); }
}

test('MCP pelo stdio: ferramentas, instruções e uma leitura (npm run mcp; e o pacote, se já gerado)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-mcp-stdio-'));
  mkdirSync(join(dir, 'aplicacoes/Portal/casos'), { recursive: true });
  writeFileSync(join(dir, 'aplicacoes/Portal/casos/TC-001-login.md'), '---\ntipo: caso-de-teste\nid: TC-001\ntitulo: Login\napp: Portal\n---\n\n# TC-001 — Login\n');
  const variants = [['--import', 'tsx', 'mcp/main.ts', dir, '--nome', 'Lucas']];
  if (existsSync('mcp-dist/qa-mcp.mjs')) variants.push(['mcp-dist/qa-mcp.mjs', '--pasta', dir]);
  for (const args of variants) {
    await withServer(args, async (client) => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      for (const n of ['qa_visao_geral', 'qa_ler', 'qa_criar', 'qa_bug_do_caso', 'qa_marcar_passos', 'qa_para_jira', 'qa_rodada_criar', 'qa_rodada_registrar', 'qa_rodada_finalizar', 'qa_relatorios', 'qa_validar', 'qa_rastreabilidade', 'qa_tendencia', 'qa_compartilhados', 'qa_aprovacao', 'qa_comparar_versoes', 'qa_restaurar_versao', 'qa_editar_em_massa', 'qa_importar_casos', 'qa_preparar_ambientes']) assert.ok(names.includes(n), `${n} em ${args[0]}`);
      assert.equal(tools.find((t) => t.name === 'qa_ler').annotations.readOnlyHint, true);
      assert.match(client.getInstructions() || '', /QA-MD/);
      const r = await client.callTool({ name: 'qa_ler', arguments: { doc: 'TC-001', so_resumo: true } });
      assert.match(r.content[0].text, /Arquivo: aplicacoes\/Portal\/casos\/TC-001-login\.md/);
      const bad = await client.callTool({ name: 'qa_ler', arguments: { doc: 'TC-999' } });
      assert.equal(bad.isError, true);
      assert.match(bad.content[0].text, /não encontrado/);
      const conv = await client.callTool({ name: 'qa_convencoes', arguments: {} });
      assert.match(conv.content[0].text, /QA-MD|Convenç/);
    });
  }
});
