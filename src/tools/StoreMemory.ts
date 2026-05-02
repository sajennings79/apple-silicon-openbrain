import { z } from "zod";
import { db } from "../db/client.js";
import { memories } from "../db/schema.js";
import { getEmbedding } from "../services/embedding.js";
import { getCachedEmbedding, setCachedEmbedding } from "../services/cache.js";
import { enrichMemory } from "../services/enrichment.js";
import { linkRelatedMemories } from "../services/linking.js";

export const StoreMemorySchema = z.object({
  content: z.string().describe("The text content to store as a memory"),
  source: z
    .string()
    .optional()
    .describe("Where this memory came from (e.g. claude-code, manual, web, youtube, import)"),
  sourceId: z.string().optional().describe("External identifier from the source"),
  memoryType: z
    .enum(["conversation", "decision", "learning", "fact"])
    .optional()
    .describe("Classification of the memory"),
  tags: z.array(z.string()).optional().describe("Tags for categorization"),
  entities: z
    .record(z.array(z.string()))
    .optional()
    .describe("Named entities: { person: [...], tech: [...], ... }"),
});

export type StoreMemoryInput = z.infer<typeof StoreMemorySchema>;

export async function storeMemory(input: StoreMemoryInput, opts: { enrich?: boolean } = {}) {
  const enrich = opts.enrich ?? true;

  // Get embedding (check cache first)
  let embedding = await getCachedEmbedding(input.content);
  if (!embedding) {
    embedding = await getEmbedding(input.content);
    await setCachedEmbedding(input.content, embedding);
  }

  const [row] = await db
    .insert(memories)
    .values({
      content: input.content,
      embedding,
      source: input.source ?? null,
      sourceId: input.sourceId ?? null,
      memoryType: input.memoryType ?? null,
      tags: input.tags ?? [],
      entities: input.entities ?? {},
    })
    .returning({ id: memories.id, createdAt: memories.createdAt });

  // Fire-and-forget enrichment via mlx-lm (skipped during bulk imports)
  if (enrich) {
    enrichMemory(row.id, input.content).catch(() => {});
  }

  // Fire-and-forget cross-memory linking
  linkRelatedMemories(row.id).catch(() => {});

  return { id: row.id, createdAt: row.createdAt };
}
