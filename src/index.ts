import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "./server.js";
import { config } from "./lib/config.js";
import { ingestUrl } from "./services/ingest.js";
import { handleSourcesRoute } from "./api/sources.js";

// Session management: map session IDs to their transport+server
const sessions = new Map<
  string,
  { transport: WebStandardStreamableHTTPServerTransport; server: ReturnType<typeof createServer> }
>();

const app = Bun.serve({
  port: config.mcpPort,
  hostname: config.mcpHost,
  idleTimeout: 255, // MCP sessions need long-lived connections (max for Bun)

  async fetch(req) {
    const url = new URL(req.url);

    // CORS preflight for /api/* routes (must run before auth)
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Bearer token auth for non-localhost requests (skip /api/* for now)
    if (config.authToken && !url.pathname.startsWith("/api/")) {
      const remoteIp =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        this.requestIP(req)?.address;
      const isLocal =
        remoteIp === "127.0.0.1" ||
        remoteIp === "::1" ||
        remoteIp === "::ffff:127.0.0.1";

      if (!isLocal) {
        const auth = req.headers.get("authorization");
        if (auth !== `Bearer ${config.authToken}`) {
          return new Response("Unauthorized", { status: 401 });
        }
      }
    }

    if (url.pathname === "/mcp") {
      const sessionId = req.headers.get("mcp-session-id");

      // Existing session
      if (sessionId && sessions.has(sessionId)) {
        const { transport } = sessions.get(sessionId)!;
        return transport.handleRequest(req);
      }

      // New session (initialization request)
      if (req.method === "POST") {
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, { transport, server });
          },
          onsessionclosed: (id) => {
            sessions.delete(id);
          },
        });

        const server = createServer();
        await server.connect(transport);

        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
        };

        return transport.handleRequest(req);
      }

      return new Response("Bad Request: missing session ID", { status: 400 });
    }

    // GET-based ingest for bookmarklet (avoids CSP issues on target pages)
    if (url.pathname === "/api/ingest" && req.method === "GET") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        return new Response("<html><body style='font:14px monospace;background:#1a1a2e;color:#f00;padding:20px'>Missing ?url= parameter</body></html>", {
          status: 400,
          headers: { "Content-Type": "text/html" },
        });
      }

      try {
        const { status, title } = await ingestUrl(targetUrl);
        const safeTitle = title.replace(/</g, "&lt;");
        if (status === "duplicate") {
          return new Response(`<html><body style="font:14px monospace;background:#1a1a2e;color:#ff0;padding:20px">Already saved</body><script>setTimeout(()=>window.close(),1500)</script></html>`, {
            headers: { "Content-Type": "text/html" },
          });
        }
        return new Response(`<html><body style="font:14px monospace;background:#1a1a2e;color:#0f0;padding:20px">Saved: ${safeTitle}</body><script>setTimeout(()=>window.close(),2000)</script></html>`, {
          status: 201,
          headers: { "Content-Type": "text/html" },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message.replace(/</g, "&lt;") : "Internal error";
        return new Response(`<html><body style="font:14px monospace;background:#1a1a2e;color:#f00;padding:20px">Error: ${message}</body></html>`, {
          status: 500,
          headers: { "Content-Type": "text/html" },
        });
      }
    }

    if (url.pathname === "/api/ingest" && req.method === "POST") {
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      };

      try {
        const body = (await req.json()) as { url?: string };
        if (!body.url || typeof body.url !== "string") {
          return Response.json({ error: "Missing 'url' field" }, { status: 400, headers: corsHeaders });
        }

        const result = await ingestUrl(body.url);
        const httpStatus = result.status === "created" ? 201 : 200;
        return Response.json(result, { status: httpStatus, headers: corsHeaders });
      } catch (err) {
        console.error("Ingest error:", err);
        const message = err instanceof Error ? err.message : "Internal error";
        return Response.json({ error: message }, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        service: "openbrain",
        sessions: sessions.size,
      });
    }

    // Sources CRUD + sync (Phase 0). Returns null if URL doesn't match.
    if (url.pathname.startsWith("/api/sources")) {
      const sourcesResponse = await handleSourcesRoute(req, url);
      if (sourcesResponse) return sourcesResponse;
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`OpenBrain MCP server listening on ${config.mcpHost}:${config.mcpPort}`);
