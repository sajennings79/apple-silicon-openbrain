import { z } from "zod";
import { eq, isNull, and, desc, arrayContains } from "drizzle-orm";
import { db } from "../db/client.js";
import { memories } from "../db/schema.js";

export const ListMemoriesSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20).describe("Max results"),
  offset: z.number().min(0).optional().default(0).describe("Pagination offset"),
  memoryType: z
    .enum(["conversation", "decision", "learning", "fact"])
    .optional()
    .describe("Filter by type"),
  source: z
    .string()
    .optional()
    .describe("Filter by source (e.g. claude-code, manual, web, youtube)"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
});

export async function listMemories(input: z.infer<typeof ListMemoriesSchema>) {
  const conditions = [isNull(memories.deletedAt)];

  if (input.memoryType) conditions.push(eq(memories.memoryType, input.memoryType));
  if (input.source) conditions.push(eq(memories.source, input.source));
  if (input.tags?.length) conditions.push(arrayContains(memories.tags, input.tags));

  const rows = await db
    .select({
      id: memories.id,
      content: memories.content,
      summary: memories.summary,
      source: memories.source,
      memoryType: memories.memoryType,
      tags: memories.tags,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.createdAt))
    .limit(input.limit)
    .offset(input.offset);

  return { memories: rows, count: rows.length };
}
