import { z } from "zod";
import { db } from "../db/client.js";
import { sources } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { syncSource, syncDueSources } from "../services/sourceSync.js";

const KIND_VALUES = ["mail", "rss", "webpage"] as const;

const CreateSchema = z.object({
  kind: z.enum(KIND_VALUES),
  name: z.string().min(1).max(200),
  config: z.record(z.unknown()).default({}),
  intervalSeconds: z.number().int().min(60).max(86_400).default(900),
  enabled: z.boolean().default(true),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  config: z.record(z.unknown()).optional(),
  intervalSeconds: z.number().int().min(60).max(86_400).optional(),
  enabled: z.boolean().optional(),
});

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Access-Control-Allow-Origin": "*" },
  });

const SOURCE_ID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Returns a Response if the URL matched a /api/sources route, otherwise null.
 */
export async function handleSourcesRoute(req: Request, url: URL): Promise<Response | null> {
  const { pathname } = url;

  if (pathname === "/api/sources") {
    if (req.method === "GET") {
      const rows = await db.select().from(sources).orderBy(desc(sources.createdAt));
      return json(rows);
    }
    if (req.method === "POST") {
      try {
        const body = await req.json();
        const parsed = CreateSchema.parse(body);
        // Zod's default-applied output type widens fields to optional which
        // confuses Drizzle's strict insert typing — runtime validation is fine.
        const [row] = await db
          .insert(sources)
          .values(parsed as typeof sources.$inferInsert)
          .returning();
        return json(row, 201);
      } catch (err) {
        return json({ error: (err as Error).message }, 400);
      }
    }
    return json({ error: "method not allowed" }, 405);
  }

  if (pathname === "/api/sources/poll-due" && req.method === "POST") {
    const reports = await syncDueSources();
    return json({ ok: true, count: reports.length, reports });
  }

  // /api/sources/:id and /api/sources/:id/sync
  const m = pathname.match(/^\/api\/sources\/([^/]+)(?:\/(sync))?$/);
  if (!m) return null;

  const [, id, action] = m;
  if (!SOURCE_ID_RE.test(id)) return json({ error: "invalid id" }, 400);

  if (action === "sync" && req.method === "POST") {
    const report = await syncSource(id);
    return json({ ok: report.ok, report }, report.ok ? 200 : 502);
  }

  if (action) return json({ error: "method not allowed" }, 405);

  if (req.method === "GET") {
    const [row] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
    if (!row) return json({ error: "not found" }, 404);
    return json(row);
  }

  if (req.method === "PATCH") {
    try {
      const body = await req.json();
      const parsed = UpdateSchema.parse(body);
      if (Object.keys(parsed).length === 0) return json({ error: "no fields to update" }, 400);
      const [row] = await db
        .update(sources)
        .set({ ...parsed, updatedAt: new Date() })
        .where(eq(sources.id, id))
        .returning();
      if (!row) return json({ error: "not found" }, 404);
      return json(row);
    } catch (err) {
      return json({ error: (err as Error).message }, 400);
    }
  }

  if (req.method === "DELETE") {
    const [row] = await db.delete(sources).where(eq(sources.id, id)).returning({ id: sources.id });
    if (!row) return json({ error: "not found" }, 404);
    return json({ ok: true, id: row.id });
  }

  return json({ error: "method not allowed" }, 405);
}
