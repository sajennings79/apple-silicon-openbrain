#!/usr/bin/env bun
/**
 * Enrich all memories that lack a summary. Strictly sequential (concurrency=1)
 * so the local mlx-lm LLM and the embed-service don't thrash the Metal GPU.
 * Idempotent — safe to rerun; finished rows have non-null summary.
 */
import { and, isNull, sql } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { memories } from "../src/db/schema.js";
import { enrichMemory } from "../src/services/enrichment.js";

async function main() {
  const rows = await db
    .select({ id: memories.id, content: memories.content, source: memories.source })
    .from(memories)
    .where(and(isNull(memories.summary), isNull(memories.deletedAt)))
    .orderBy(sql`created_at ASC`);

  console.log(`Backlog: ${rows.length} memories lacking summary.`);

  let ok = 0;
  let failed = 0;
  const start = Date.now();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      await enrichMemory(r.id, r.content);
      ok++;
    } catch (e) {
      failed++;
      console.error(`  [${i + 1}/${rows.length}] ${r.id.slice(0, 8)} failed:`, (e as Error).message);
    }
    if ((i + 1) % 25 === 0) {
      const elapsed = (Date.now() - start) / 1000;
      const rate = (i + 1) / elapsed;
      const eta = (rows.length - (i + 1)) / rate;
      console.log(
        `  ${i + 1}/${rows.length}  ok=${ok} fail=${failed}  ${rate.toFixed(2)}/s  ETA ${Math.round(eta)}s`
      );
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s. ok=${ok} failed=${failed}`);

  // Verify: count how many still lack summary
  const remaining = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(memories)
    .where(and(isNull(memories.summary), isNull(memories.deletedAt)));
  console.log(`Remaining without summary: ${remaining[0].c}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
