import { test, expect, beforeAll, afterAll } from "bun:test";
import { pg } from "../db/client.js";
import { config } from "../lib/config.js";
import { sweepExpired, purgeSoftDeleted, maintenanceStats } from "../services/maintenance.js";
import { ingestUrl } from "../services/ingest.js";

// Exercises retention sweep, purge/tombstone-shrink, and tombstone-aware
// ingest dedup against the live local DB (same approach as ob1-compat.test.ts:
// marker-tagged synthetic rows, full cleanup in afterAll).
//
// Synthetic deleted_at values are set in 1970 and purge is called with a
// ~50-year window so the test can never touch real soft-deleted rows.

const MARKER = `mxtest-${Date.now()}`;
const PURGE_WINDOW_DAYS = 18_250; // ~50 years
const ids: string[] = [];
let savedFirecrawlKey = "";

async function insertMemory(fields: {
  sourceId?: string;
  deletedAt?: string | null;
  expiresAt?: string | null;
  reviewStatus?: string | null;
  createdBy?: string | null;
  provenanceStatus?: string | null;
  canUseAsInstruction?: boolean;
}): Promise<string> {
  const id = crypto.randomUUID();
  ids.push(id);
  await pg`
    INSERT INTO memories (id, content, source, source_id, deleted_at, expires_at,
                          review_status, created_by, provenance_status, can_use_as_instruction)
    VALUES (${id}, ${`${MARKER} synthetic row`}, 'web', ${fields.sourceId ?? null},
            ${fields.deletedAt ?? null}, ${fields.expiresAt ?? null},
            ${fields.reviewStatus ?? null}, ${fields.createdBy ?? null},
            ${fields.provenanceStatus ?? null}, ${fields.canUseAsInstruction ?? false})
  `;
  return id;
}

async function getRow(id: string) {
  const [row] = (await pg`
    SELECT id, content, summary, embedding, deleted_at, expires_at
    FROM memories WHERE id = ${id}
  `) as any[];
  return row;
}

beforeAll(() => {
  // Force scrapeUrl to fail fast and offline ("FIRECRAWL_API_KEY is not set")
  // so the dedup tests below never reach the remote Firecrawl API.
  savedFirecrawlKey = config.firecrawlApiKey;
  (config as { firecrawlApiKey: string }).firecrawlApiKey = "";
});

afterAll(async () => {
  (config as { firecrawlApiKey: string }).firecrawlApiKey = savedFirecrawlKey;
  if (ids.length) {
    await pg`DELETE FROM memory_audit WHERE memory_id IN ${pg(ids)}`;
    await pg`DELETE FROM memory_links WHERE source_memory_id IN ${pg(ids)} OR target_memory_id IN ${pg(ids)}`;
    await pg`DELETE FROM memories WHERE id IN ${pg(ids)}`;
  }
  // Deliberately no pg.end() — bun test runs all files in one process and
  // ob1-compat.test.ts (alphabetically later) closes the shared client.
});

test("sweepExpired soft-deletes expired rows but skips promoted ones", async () => {
  const plain = await insertMemory({ expiresAt: "2020-01-01" });
  const confirmed = await insertMemory({ expiresAt: "2020-01-01", reviewStatus: "confirmed" });
  const userWritten = await insertMemory({ expiresAt: "2020-01-01", createdBy: "user" });
  const instruction = await insertMemory({
    expiresAt: "2020-01-01",
    provenanceStatus: "user_confirmed",
    canUseAsInstruction: true,
  });
  const future = await insertMemory({ expiresAt: "2099-01-01" });

  const report = await sweepExpired();
  expect(report.swept).toBeGreaterThanOrEqual(1);

  expect((await getRow(plain)).deleted_at).not.toBeNull();
  expect((await getRow(confirmed)).deleted_at).toBeNull();
  expect((await getRow(userWritten)).deleted_at).toBeNull();
  expect((await getRow(instruction)).deleted_at).toBeNull();
  expect((await getRow(future)).deleted_at).toBeNull();

  // Sweep writes a system audit record for the swept row.
  const [audit] = (await pg`
    SELECT action, actor FROM memory_audit WHERE memory_id = ${plain} AND action = 'delete'
  `) as any[];
  expect(audit?.actor).toBe("system");
});

test("purgeSoftDeleted hard-deletes old user-deletes (links first) and shrinks tombstones", async () => {
  // User delete: deleted long ago, no expiry → hard-deleted.
  const userDel = await insertMemory({ deletedAt: "1970-01-02" });
  // Tombstone: deleted long ago, had an expiry → shrunk, not deleted.
  const tombstone = await insertMemory({ deletedAt: "1970-01-02", expiresAt: "1970-01-01" });
  // Recent user delete → untouched by the windowed purge.
  const recentDel = await insertMemory({ deletedAt: new Date().toISOString() });
  // Live row linked to the purged one, to prove links are removed first.
  const liveNeighbor = await insertMemory({});
  await pg`
    INSERT INTO memory_links (source_memory_id, target_memory_id, similarity)
    VALUES (${userDel}, ${liveNeighbor}, 0.99), (${tombstone}, ${liveNeighbor}, 0.98)
  `;

  const report = await purgeSoftDeleted(PURGE_WINDOW_DAYS);
  expect(report.purgedRows).toBeGreaterThanOrEqual(1);
  expect(report.purgedLinks).toBeGreaterThanOrEqual(2);
  expect(report.shrunkTombstones).toBeGreaterThanOrEqual(1);

  expect(await getRow(userDel)).toBeUndefined();

  const t = await getRow(tombstone);
  expect(t).toBeDefined();
  expect(t.content).toBe("[expired]");
  expect(t.summary).toBeNull();
  expect(t.embedding).toBeNull();
  expect(t.deleted_at).not.toBeNull();

  expect(await getRow(recentDel)).toBeDefined();
  expect(await getRow(liveNeighbor)).toBeDefined();

  const links = (await pg`
    SELECT id FROM memory_links
    WHERE source_memory_id IN (${userDel}, ${tombstone}) OR target_memory_id IN (${userDel}, ${tombstone})
  `) as any[];
  expect(links.length).toBe(0);

  // Idempotent: a second run does not re-shrink the same tombstone.
  const second = await purgeSoftDeleted(PURGE_WINDOW_DAYS);
  expect(second.shrunkTombstones).toBe(0);
});

test("ingestUrl treats retention tombstones as duplicates", async () => {
  const url = `https://example.com/${MARKER}/tombstoned`;
  const id = await insertMemory({
    sourceId: url,
    deletedAt: new Date().toISOString(),
    expiresAt: "2020-01-01",
  });

  // Tombstone hit returns duplicate before any scraping happens.
  const result = await ingestUrl(url);
  expect(result.status).toBe("duplicate");
  expect(result.id).toBe(id);
});

test("ingestUrl still re-ingests user-deleted URLs", async () => {
  const url = `https://example.com/${MARKER}/user-deleted`;
  await insertMemory({ sourceId: url, deletedAt: new Date().toISOString() });

  // Not a tombstone → dedup misses → ingest proceeds to scrape, which fails
  // fast on the blanked API key. Reaching the scrape stage IS the assertion.
  expect(ingestUrl(url)).rejects.toThrow(/FIRECRAWL_API_KEY/);
});

test("maintenanceStats returns the expected shape", async () => {
  const stats = await maintenanceStats();
  for (const key of ["purgeable", "expiredPending", "unenriched", "dupGroups", "tableSize"]) {
    expect(stats).toHaveProperty(key);
  }
  expect(typeof stats.unenriched).toBe("number");
});
