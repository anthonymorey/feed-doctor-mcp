#!/usr/bin/env node
import { startHttpServer } from './http.js';
import { startStdioServer } from './stdio.js';

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] && !args[0].startsWith('-') ? args[0] : 'stdio';

  if (mode === 'http') {
    const portFlagIdx = args.indexOf('--port');
    const port =
      portFlagIdx !== -1 && args[portFlagIdx + 1]
        ? Number(args[portFlagIdx + 1])
        : Number(process.env.PORT || 3000);
    const hostFlagIdx = args.indexOf('--host');
    const host =
      hostFlagIdx !== -1 && args[hostFlagIdx + 1]
        ? args[hostFlagIdx + 1]
        : process.env.HOST || '127.0.0.1';

    const running = await startHttpServer({ port, host });
    process.stderr.write(
      `feed-doctor-mcp (Streamable HTTP, stateless, read-only) listening on http://${running.host}:${running.port}/mcp\n`
    );
    return;
  }

  startStdioServer();
}

main().catch((err) => {
  process.stderr.write(
    `feed-doctor-mcp fatal error: ${err instanceof Error ? err.stack || err.message : String(err)}\n`
  );
  process.exit(1);
});
