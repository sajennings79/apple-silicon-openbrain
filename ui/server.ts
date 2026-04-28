import { desc, isNull, and, sql, eq, ilike } from "drizzle-orm";
import { db, pg } from "../src/db/client.js";
import { memories } from "../src/db/schema.js";
import { storeMemory, StoreMemorySchema } from "../src/tools/StoreMemory.js";
import { updateMemory } from "../src/tools/UpdateMemory.js";

const PORT = Number(process.env.UI_PORT ?? 6279);
const indexHtml = await Bun.file(new URL("./index.html", import.meta.url)).text();

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    if (req.method === "GET" && pathname === "/") {
      return new Response(indexHtml, { headers: { "content-type": "text/html" } });
    }

    if (req.method === "GET" && pathname === "/api/memories") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
      const tag = url.searchParams.get("tag");
      const type = url.searchParams.get("type");
      const source = url.searchParams.get("source");
      const q = url.searchParams.get("q");

      const conds = [isNull(memories.deletedAt)];
      if (tag) conds.push(sql`${tag} = ANY(${memories.tags})`);
      if (type) conds.push(eq(memories.memoryType, type));
      if (source) conds.push(eq(memories.source, source));
      if (q) conds.push(ilike(memories.content, `%${q}%`));

      const effectiveDate = sql<string>`coalesce(${memories.sourceDate}, ${memories.createdAt})`.as("effective_date");
      const rows = await db
        .select({
          id: memories.id,
          content: memories.content,
          summary: memories.summary,
          source: memories.source,
          memoryType: memories.memoryType,
          tags: memories.tags,
          entities: memories.entities,
          createdAt: memories.createdAt,
          sourceDate: memories.sourceDate,
          effectiveDate,
        })
        .from(memories)
        .where(and(...conds))
        .orderBy(desc(effectiveDate))
        .limit(limit);
      return json(rows);
    }

    if (req.method === "GET" && pathname === "/api/stats") {
      const [totals] = await pg`
        SELECT count(*)::int AS total FROM memories WHERE deleted_at IS NULL
      `;
      const bySource = await pg`
        SELECT coalesce(source, '(none)') AS key, count(*)::int AS count
        FROM memories WHERE deleted_at IS NULL
        GROUP BY source ORDER BY count DESC
      `;
      const byType = await pg`
        SELECT coalesce(memory_type, '(none)') AS key, count(*)::int AS count
        FROM memories WHERE deleted_at IS NULL
        GROUP BY memory_type ORDER BY count DESC
      `;
      const topTags = await pg`
        SELECT tag, count(*)::int AS count
        FROM memories, unnest(tags) AS tag
        WHERE deleted_at IS NULL
        GROUP BY tag ORDER BY count DESC LIMIT 40
      `;
      const perDay = await pg`
        SELECT date_trunc('day', coalesce(source_date, created_at))::date AS day, count(*)::int AS count
        FROM memories WHERE deleted_at IS NULL
          AND coalesce(source_date, created_at) > now() - interval '30 days'
        GROUP BY day ORDER BY day
      `;
      const perMonth = await pg`
        SELECT to_char(date_trunc('month', coalesce(source_date, created_at)), 'YYYY-MM') AS month,
               count(*)::int AS count
        FROM memories WHERE deleted_at IS NULL
          AND coalesce(source_date, created_at) > now() - interval '2 years'
        GROUP BY month ORDER BY month
      `;
      const [coverage] = await pg`
        SELECT
          count(*) FILTER (WHERE source_date IS NOT NULL)::int AS with_source_date,
          count(*)::int AS total
        FROM memories WHERE deleted_at IS NULL
      `;
      return json({
        total: totals.total,
        bySource,
        byType,
        topTags,
        perDay,
        perMonth,
        coverage,
      });
    }

    if (req.method === "POST" && pathname === "/api/memories") {
      try {
        const body = await req.json();
        const parsed = StoreMemorySchema.parse({ ...body, source: body.source || "manual" });
        const result = await storeMemory(parsed);
        return json(result, 201);
      } catch (err) {
        return json({ error: (err as Error).message }, 400);
      }
    }

    // PATCH /api/memories/:id/tags  body: { add?: string[], remove?: string[] }
    const tagMatch = pathname.match(/^\/api\/memories\/([0-9a-f-]{36})\/tags$/i);
    if (req.method === "PATCH" && tagMatch) {
      try {
        const id = tagMatch[1];
        const body = (await req.json()) as { add?: string[]; remove?: string[] };
        const [row] = await db
          .select({ tags: memories.tags })
          .from(memories)
          .where(and(eq(memories.id, id), isNull(memories.deletedAt)));
        if (!row) return json({ error: "not found" }, 404);

        const set = new Set(row.tags ?? []);
        for (const t of body.add ?? []) {
          const trimmed = t.trim();
          if (trimmed) set.add(trimmed);
        }
        for (const t of body.remove ?? []) set.delete(t);

        const result = await updateMemory({ id, tags: Array.from(set) });
        return json(result);
      } catch (err) {
        return json({ error: (err as Error).message }, 400);
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`OpenBrain UI → http://0.0.0.0:${PORT}`);
