import { z } from "zod";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { memories } from "../db/schema.js";
import { getEmbedding } from "../services/embedding.js";
import { setCachedEmbedding } from "../services/cache.js";
import { enrichMemory } from "../services/enrichment.js";

export const UpdateMemorySchema = z.object({
  id: z.string().uuid().describe("The memory UUID to update"),
  content: z.string().optional().describe("New content (will re-embed and re-enrich)"),
  memoryType: z
    .enum(["conversation", "decision", "learning", "fact"])
    .optional()
    .describe("Updated type"),
  tags: z.array(z.string()).optional().describe("Replace tags"),
  entities: z.record(z.array(z.string())).optional().describe("Replace entities"),
});

export async function updateMemory(input: z.infer<typeof UpdateMemorySchema>) {
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (input.content !== undefined) {
    const embedding = await getEmbedding(input.content);
    await setCachedEmbedding(input.content, embedding);
    updates.content = input.content;
    updates.embedding = embedding;
  }
  if (input.memoryType !== undefined) updates.memoryType = input.memoryType;
  if (input.tags !== undefined) updates.tags = input.tags;
  if (input.entities !== undefined) updates.entities = input.entities;

  const [row] = await db
    .update(memories)
    .set(updates)
    .where(and(eq(memories.id, input.id), isNull(memories.deletedAt)))
    .returning({ id: memories.id, updatedAt: memories.updatedAt });

  if (!row) return { error: "Memory not found" };

  // Re-enrich if content changed
  if (input.content) {
    enrichMemory(row.id, input.content).catch(() => {});
  }

  return row;
}
