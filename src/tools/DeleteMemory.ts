import { z } from "zod";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { memories } from "../db/schema.js";

export const DeleteMemorySchema = z.object({
  id: z.string().uuid().describe("The memory UUID to soft-delete"),
});

export async function deleteMemory(input: z.infer<typeof DeleteMemorySchema>) {
  const [row] = await db
    .update(memories)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(memories.id, input.id), isNull(memories.deletedAt)))
    .returning({ id: memories.id });

  if (!row) return { error: "Memory not found" };
  return { id: row.id, deleted: true };
}
