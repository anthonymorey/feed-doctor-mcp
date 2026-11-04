import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  WebStandardStreamableHTTPServerTransport,
  createMcpHandler
} from '@modelcontextprotocol/server';
import { resolveRequestCredentials } from './auth.js';
import { createFeedDoctorServer, type FeedDoctorServerOptions } from './server.js';

export interface HttpHandlerOptions extends FeedDoctorServerOptions {
  /** Base path for the MCP endpoint (default: "/mcp") */
  mcpPath?: string;
}

/**
 * Creates a stateless Web-Standard `fetch(request: Request) => Promise<Response>` handler
 * for Streamable HTTP MCP transport (compatible with Vercel, Cloudflare Workers, Bun, Deno, and Node).
 *
 * Credentials (Authorization: Bearer <token>, x-google-access-token, x-microsoft-access-token, etc.)
 * are extracted per-request and never stored after the request completes.
 */
export function createStreamableHttpFetchHandler(
  options: HttpHandlerOptions = {}
): (request: Request) => Promise<Response> {
  const mcpPath = options.mcpPath ?? '/mcp';

  const mcpHandler = createMcpHandler((ctx) => {
    const reqHeaders = ctx.requestInfo?.headers ?? options.requestHeaders;
    return createFeedDoctorServer({
      ...options,
      requestHeaders: reqHeaders
    });
  });

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(
        JSON.stringify({
          ok: true,
          service: 'feed-doctor-mcp',
          version: '0.1.0',
          readOnly: true,
          stateless: true,
          transport: 'streamable-http'
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
          }
        }
      );
    }

    if (url.pathname !== mcpPath) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Not found. Send MCP Streamable HTTP requests to ${mcpPath}`
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        }
      );
    }

    if (options.hosted || (options.env ?? process.env).FEED_DOCTOR_HOSTED === '1') {
      try { resolveRequestCredentials({ ...options, requestHeaders: request.headers }); }
      catch { return Response.json({ error: 'Encrypted bearer token required.' }, { status: 401 }); }
    }

    // Use stateless WebStandardStreamableHTTPServerTransport for direct JSON-RPC POSTs
    // or delegate to createMcpHandler which supports both 2025 stateless and 2026 envelope eras.
    try { return await mcpHandler.fetch(request); } catch {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

/**
 * Stateless per-request Streamable HTTP transport helper using `WebStandardStreamableHTTPServerTransport`
 * directly with `sessionIdGenerator: undefined` and `enableJsonResponse: true`.
 */
export async function handleStatelessStreamableHttpRequest(
  request: Request,
  options: FeedDoctorServerOptions = {}
): Promise<Response> {
  if (options.hosted || (options.env ?? process.env).FEED_DOCTOR_HOSTED === '1') {
    try { resolveRequestCredentials({ ...options, requestHeaders: request.headers }); }
    catch { return Response.json({ error: 'Encrypted bearer token required.' }, { status: 401 }); }
  }
  const server = createFeedDoctorServer({
    ...options,
    requestHeaders: request.headers
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await server.close();
  }
}

async function nodeRequestToWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host || 'localhost';
  const url = `http://${host}${req.url || '/'}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }

  const method = req.method || 'GET';
  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  return new Request(url, {
    method,
    headers,
    body: body.length > 0 ? body : undefined
  });
}

async function writeWebResponseToNode(
  webRes: Response,
  res: ServerResponse
): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (!webRes.body) {
    res.end();
    return;
  }
  const arrayBuf = await webRes.arrayBuffer();
  res.end(Buffer.from(arrayBuf));
}

/**
 * Starts a standalone Node.js HTTP server serving the stateless Streamable HTTP MCP transport.
 */
export function startHttpServer(
  options: HttpHandlerOptions & { port?: number; host?: string } = {}
): Promise<{
  port: number;
  host: string;
  close: () => Promise<void>;
}> {
  const fetchHandler = createStreamableHttpFetchHandler(options);
  const port = options.port ?? Number(process.env.PORT || 3000);
  const host = options.host ?? '127.0.0.1';

  const httpServer = createServer(async (req, res) => {
    try {
      const webReq = await nodeRequestToWebRequest(req);
      const webRes = await fetchHandler(webReq);
      await writeWebResponseToNode(webRes, res);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          ok: false,
          error: 'Internal server error'
        })
      );
    }
  });

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      const address = httpServer.address();
      const actualPort =
        typeof address === 'object' && address ? address.port : port;
      resolve({
        port: actualPort,
        host,
        close: () =>
          new Promise<void>((resClose, rejClose) =>
            httpServer.close((err) => (err ? rejClose(err) : resClose()))
          )
      });
    });
  });
}
