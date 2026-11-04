import { StdioServerTransport, serveStdio } from '@modelcontextprotocol/server/stdio';
import { createFeedDoctorServer, type FeedDoctorServerOptions } from './server.js';

/**
 * Starts the `feed-doctor-mcp` server over stdio (supporting both 2025 and 2026 MCP protocol eras).
 */
export function startStdioServer(options: FeedDoctorServerOptions = {}) {
  return serveStdio(() => createFeedDoctorServer(options));
}

/**
 * Connects a single `feed-doctor-mcp` server instance directly to a `StdioServerTransport`.
 */
export async function connectStdioServer(
  options: FeedDoctorServerOptions = {},
  transport = new StdioServerTransport()
) {
  const server = createFeedDoctorServer(options);
  await server.connect(transport);
  return { server, transport };
}
