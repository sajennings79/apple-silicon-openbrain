import { pg } from "../db/client.js";

const MIN_SIMILARITY = 0.75;
const MAX_LINKS = 3;

export async function linkRelatedMemories(memoryId: string): Promise<void> {
  try {
    // Find the top N most similar memories (excluding self and deleted)
    // Uses the embedding already stored on the new memory
    const related = await pg.unsafe(`
      WITH source AS (
        SELECT embedding FROM memories WHERE id = $1
      )
      SELECT m.id,
             1 - (m.embedding <=> source.embedding) AS similarity
      FROM memories m, source
      WHERE m.id != $1
        AND m.deleted_at IS NULL
        AND m.embedding IS NOT NULL
      ORDER BY m.embedding <=> source.embedding
      LIMIT $2
    `, [memoryId, MAX_LINKS]);

    // Insert links for memories above the similarity threshold
    for (const row of related) {
      if (Number(row.similarity) < MIN_SIMILARITY) continue;

      await pg.unsafe(`
        INSERT INTO memory_links (source_memory_id, target_memory_id, similarity)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `, [memoryId, row.id, row.similarity]);
    }

    const linked = related.filter((r: any) => Number(r.similarity) >= MIN_SIMILARITY);
    if (linked.length > 0) {
      console.log(`[linking] Memory ${memoryId.slice(0, 8)}... linked to ${linked.length} related memories`);
    }
  } catch (err) {
    console.error(`[linking] Failed for ${memoryId}:`, err instanceof Error ? err.message : err);
  }
}
