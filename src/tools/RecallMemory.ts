import { z } from "zod";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { memories } from "../db/schema.js";

export const RecallMemorySchema = z.object({
  id: z.string().uuid().describe("The memory UUID to retrieve"),
});

export async function recallMemory(input: z.infer<typeof RecallMemorySchema>) {
  const [row] = await db
    .select({
      id: memories.id,
      content: memories.content,
      summary: memories.summary,
      source: memories.source,
      sourceId: memories.sourceId,
      memoryType: memories.memoryType,
      tags: memories.tags,
      entities: memories.entities,
      createdAt: memories.createdAt,
      updatedAt: memories.updatedAt,
    })
    .from(memories)
    .where(and(eq(memories.id, input.id), isNull(memories.deletedAt)));

  if (!row) return { error: "Memory not found" };
  return row;
}
