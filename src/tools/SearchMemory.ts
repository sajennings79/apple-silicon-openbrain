import { z } from "zod";
import { pg } from "../db/client.js";
import { getEmbedding } from "../services/embedding.js";
import { getCachedEmbedding, setCachedEmbedding } from "../services/cache.js";

export const SearchMemorySchema = z.object({
  query: z.string().describe("Semantic search query"),
  limit: z.number().min(1).max(50).optional().default(10).describe("Max results"),
  memoryType: z
    .enum(["conversation", "decision", "learning", "fact"])
    .optional()
    .describe("Filter by memory type"),
  source: z
    .string()
    .optional()
    .describe("Filter by source (e.g. claude-code, manual, web, youtube)"),
  tags: z.array(z.string()).optional().describe("Filter by tags (AND)"),
  after: z.string().optional().describe("Only memories after this ISO date"),
  before: z.string().optional().describe("Only memories before this ISO date"),
});

export type SearchMemoryInput = z.infer<typeof SearchMemorySchema>;

export async function searchMemory(input: SearchMemoryInput) {
  let embedding = await getCachedEmbedding(input.query);
  if (!embedding) {
    embedding = await getEmbedding(input.query);
    await setCachedEmbedding(input.query, embedding);
  }

  const vecLiteral = `[${embedding.join(",")}]`;

  const conditions: string[] = ["deleted_at IS NULL"];
  const values: unknown[] = [];
  let idx = 1;

  if (input.memoryType) {
    conditions.push(`memory_type = $${idx++}`);
    values.push(input.memoryType);
  }
  if (input.source) {
    conditions.push(`source = $${idx++}`);
    values.push(input.source);
  }
  if (input.tags?.length) {
    conditions.push(`tags @> $${idx++}::text[]`);
    values.push(input.tags);
  }
  if (input.after) {
    conditions.push(`created_at > $${idx++}::timestamptz`);
    values.push(input.after);
  }
  if (input.before) {
    conditions.push(`created_at < $${idx++}::timestamptz`);
    values.push(input.before);
  }

  // Vector literal is safe — it's only floats from our embedding service.
  // Limit is Zod-validated as a number.
  const query = `
    SELECT id, content, summary, source, source_id, memory_type, tags, entities,
           created_at, updated_at,
           1 - (embedding <=> '${vecLiteral}'::vector) AS similarity
    FROM memories
    WHERE ${conditions.join(" AND ")}
    ORDER BY embedding <=> '${vecLiteral}'::vector
    LIMIT ${input.limit}
  `;

  const rows = values.length > 0
    ? await pg.unsafe(query, values as any[])
    : await pg.unsafe(query);

  const results = rows.map((r: any) => ({
    id: r.id,
    content: r.content,
    summary: r.summary,
    source: r.source,
    sourceId: r.source_id,
    memoryType: r.memory_type,
    tags: r.tags,
    entities: r.entities,
    similarity: Number(r.similarity),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    linkedMemories: [] as { id: string; similarity: number }[],
  }));

  // Fetch linked memories for search results
  if (results.length > 0) {
    try {
      const ids = results.map((r: any) => r.id);
      const links = await pg.unsafe(`
        SELECT source_memory_id, target_memory_id, similarity
        FROM memory_links
        WHERE source_memory_id = ANY($1) OR target_memory_id = ANY($1)
      `, [ids]);

      for (const link of links) {
        for (const result of results) {
          if (link.source_memory_id === result.id && !ids.includes(link.target_memory_id)) {
            result.linkedMemories.push({ id: link.target_memory_id, similarity: Number(link.similarity) });
          } else if (link.target_memory_id === result.id && !ids.includes(link.source_memory_id)) {
            result.linkedMemories.push({ id: link.source_memory_id, similarity: Number(link.similarity) });
          }
        }
      }
    } catch {
      // Links table may not exist yet — graceful degradation
    }
  }

  return results;
}
