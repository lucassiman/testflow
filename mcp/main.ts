// Ponto de entrada do servidor MCP (o pacote e o `npm run mcp` começam aqui).
import { main } from './server.ts';

main().catch((err) => {
  process.stderr.write(`markdown-qa MCP: ${(err as Error)?.stack || err}\n`);
  process.exit(1);
});
