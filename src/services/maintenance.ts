import { db, pg } from "../db/client.js";
import { memoryAudit } from "../db/schema.js";
import { reviewMemory } from "../tools/ReviewMemory.js";

/**
 * Data-hygiene operations: retention sweep (soft-delete expired rows) and
 * purge (hard-delete old user-deleted rows, shrink retention tombstones).
 *
 * Tombstone model: a soft-deleted row with expires_at IS NOT NULL is a
 * *retention tombstone* — kept (shrunken) forever so its (source, source_id)
 * keeps blocking re-ingestion of expired content that webpage sources would
 * otherwise re-list and resurrect. A soft-deleted row with expires_at IS NULL
 * is a *user delete* — hard-purged after the window, and re-ingestable
 * (today's intended behavior for deleted URLs).
 */

export interface SweepReport {
  swept: number;
  elapsedMs: number;
}

export interface PurgeReport {
  purgedRows: number;
  purgedLinks: number;
  shrunkTombstones: number;
  elapsedMs: number;
}

const AUDIT_CHUNK = 500;

/** Batched audit inserts — one statement per chunk, not one recordAudit per row. */
export async function auditBatch(
  ids: string[],
  action: string,
  diff: Record<string, unknown>,
  actor = "system",
) {
  for (let i = 0; i < ids.length; i += AUDIT_CHUNK) {
    const chunk = ids.slice(i, i + AUDIT_CHUNK);
    try {
      await db.insert(memoryAudit).values(
        chunk.map((memoryId) => ({ memoryId, action, actor, diff })),
      );
    } catch {
      // Audit is advisory — never let it break maintenance (matches recordAudit).
    }
  }
}

/**
 * Soft-delete expired rows, exempting anything promoted by a human:
 * confirmed review, user-written, or instruction-grade. Null-safe on the
 * nullable governance columns.
 */
export async function sweepExpired(): Promise<SweepReport> {
  const startedAt = Date.now();
  const rows = (await pg`
    UPDATE memories
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE deleted_at IS NULL
      AND expires_at IS NOT NULL AND expires_at < NOW()
      AND COALESCE(review_status, '') <> 'confirmed'
      AND COALESCE(created_by, '') <> 'user'
      AND can_use_as_instruction IS NOT TRUE
    RETURNING id
  `) as { id: string }[];

  await auditBatch(rows.map((r) => r.id), "delete", { reason: "retention-expired" });
  return { swept: rows.length, elapsedMs: Date.now() - startedAt };
}

/**
 * Hard-delete user-deleted rows past the retention window (memory_links first —
 * they are real FKs; memory_audit deliberately survives), and shrink retention
 * tombstones in place (clear content/embedding, keep the dedup-blocking row).
 */
export async function purgeSoftDeleted(olderThanDays = 30): Promise<PurgeReport> {
  const startedAt = Date.now();
  let purgedRows = 0;
  let purgedLinks = 0;

  // Pass 1: user deletes (no expiry) — hard delete in id batches.
  for (;;) {
    const batch = (await pg`
      SELECT id FROM memories
      WHERE deleted_at IS NOT NULL
        AND deleted_at < NOW() - make_interval(days => ${olderThanDays})
        AND expires_at IS NULL
      LIMIT 1000
    `) as { id: string }[];
    if (batch.length === 0) break;
    const ids = batch.map((r) => r.id);

    const links = await pg`
      DELETE FROM memory_links
      WHERE source_memory_id = ANY(${ids}::uuid[]) OR target_memory_id = ANY(${ids}::uuid[])
    `;
    purgedLinks += links.count;
    const deleted = await pg`DELETE FROM memories WHERE id = ANY(${ids}::uuid[])`;
    purgedRows += deleted.count;
  }

  // Pass 2: retention tombstones — shrink, never delete. The '[expired]'
  // sentinel also makes the pass idempotent (already-shrunk rows don't match).
  const shrunk = (await pg`
    UPDATE memories
    SET content = '[expired]', summary = NULL, embedding = NULL,
        tags = '{}', entities = '{}'::jsonb, updated_at = NOW()
    WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - make_interval(days => ${olderThanDays})
      AND expires_at IS NOT NULL
      AND content <> '[expired]'
    RETURNING id
  `) as { id: string }[];
  if (shrunk.length > 0) {
    const ids = shrunk.map((r) => r.id);
    const links = await pg`
      DELETE FROM memory_links
      WHERE source_memory_id = ANY(${ids}::uuid[]) OR target_memory_id = ANY(${ids}::uuid[])
    `;
    purgedLinks += links.count;
  }

  if (purgedRows > 0 || shrunk.length > 0) {
    console.log(
      `[maintenance] purged ${purgedRows} rows, shrunk ${shrunk.length} tombstones — consider running VACUUM ANALYZE memories;`,
    );
  }
  return {
    purgedRows,
    purgedLinks,
    shrunkTombstones: shrunk.length,
    elapsedMs: Date.now() - startedAt,
  };
}

// Opportunistic daily maintenance, piggybacked on the poll-due tick. The guard
// is per-process; only the MCP server calls this, so that is sufficient.
let lastMaintenanceAt = 0;
const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function maybeRunMaintenance(): Promise<void> {
  if (Date.now() - lastMaintenanceAt < MAINTENANCE_INTERVAL_MS) return;
  lastMaintenanceAt = Date.now();
  try {
    const sweep = await sweepExpired();
    const purge = await purgeSoftDeleted();
    console.log(
      `[maintenance] sweep=${sweep.swept} purged=${purge.purgedRows} links=${purge.purgedLinks} tombstones=${purge.shrunkTombstones}`,
    );
  } catch (err) {
    console.error("[maintenance] failed:", err);
  }
}

/**
 * Bulk-resolve every exact-duplicate fingerprint group via the existing
 * supersede review flow (full audit trail per row). Keeper preference:
 * a confirmed or user-written member, else the newest. In 3+ groups the
 * keeper's `supersedes` column ends up pointing at only the last member —
 * same as clicking the Duplicates UI repeatedly; the audit log holds the chain.
 */
export async function resolveExactDuplicates(): Promise<{ groupsResolved: number; superseded: number }> {
  const rows = (await pg`
    WITH dup AS (
      SELECT content_fingerprint
      FROM memories
      WHERE deleted_at IS NULL AND content_fingerprint IS NOT NULL
        AND COALESCE(provenance_status, '') <> 'superseded'
      GROUP BY content_fingerprint HAVING count(*) > 1
    )
    SELECT m.content_fingerprint AS fp, m.id, m.created_at AS "createdAt",
           m.review_status AS "reviewStatus", m.created_by AS "createdBy"
    FROM memories m JOIN dup ON dup.content_fingerprint = m.content_fingerprint
    WHERE m.deleted_at IS NULL
      AND COALESCE(m.provenance_status, '') <> 'superseded'
    ORDER BY m.content_fingerprint, m.created_at DESC
  `) as { fp: string; id: string; createdAt: string; reviewStatus: string | null; createdBy: string | null }[];

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const g = groups.get(r.fp) ?? [];
    g.push(r);
    groups.set(r.fp, g);
  }

  let groupsResolved = 0;
  let superseded = 0;
  for (const members of groups.values()) {
    const keeper =
      members.find((m) => m.reviewStatus === "confirmed") ??
      members.find((m) => m.createdBy === "user") ??
      members[0]; // newest (sorted created_at DESC)
    let resolvedAny = false;
    for (const m of members) {
      if (m.id === keeper.id) continue;
      const result = await reviewMemory({
        id: keeper.id,
        action: "supersede",
        relatedId: m.id,
        notes: "bulk exact-duplicate resolve",
      });
      if (!("error" in result)) {
        superseded++;
        resolvedAny = true;
      }
    }
    if (resolvedAny) groupsResolved++;
  }
  return { groupsResolved, superseded };
}

/** Counts for the Maintenance tab. */
export async function maintenanceStats(olderThanDays = 30) {
  const [row] = (await pg`
    SELECT
      count(*) FILTER (
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - make_interval(days => ${olderThanDays})
          AND expires_at IS NULL
      )::int AS purgeable,
      count(*) FILTER (
        WHERE deleted_at IS NULL
          AND expires_at IS NOT NULL AND expires_at < NOW()
          AND COALESCE(review_status, '') <> 'confirmed'
          AND COALESCE(created_by, '') <> 'user'
          AND can_use_as_instruction IS NOT TRUE
      )::int AS "expiredPending",
      count(*) FILTER (
        WHERE deleted_at IS NULL AND summary IS NULL
      )::int AS unenriched,
      count(*) FILTER (
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - make_interval(days => ${olderThanDays})
          AND expires_at IS NOT NULL AND content <> '[expired]'
      )::int AS "shrinkableTombstones"
    FROM memories
  `) as any[];
  const [dup] = (await pg`
    SELECT count(*)::int AS groups FROM (
      SELECT content_fingerprint
      FROM memories
      WHERE deleted_at IS NULL AND content_fingerprint IS NOT NULL
        AND COALESCE(provenance_status, '') <> 'superseded'
      GROUP BY content_fingerprint HAVING count(*) > 1
    ) g
  `) as any[];
  const [size] = (await pg`
    SELECT pg_size_pretty(pg_total_relation_size('memories')) AS "tableSize"
  `) as any[];
  return { ...row, dupGroups: dup.groups, tableSize: size.tableSize };
}
