-- Deduplicate ingested memories and enforce uniqueness going forward.
--
-- Background: the SELECT-then-INSERT dedup in ingestUrl/mail had no DB backstop,
-- so overlapping poll-due runs re-scraped and re-stored the same URLs/messages.
-- This soft-deletes the duplicate rows (keeping the earliest per source) and adds
-- a partial UNIQUE index so concurrent inserts collide instead of duplicating.

-- 1. Soft-delete duplicates, keeping the earliest row per (source, source_id).
--    Soft delete (not hard) avoids tripping the memory_links FK and is reversible.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY source, source_id
      ORDER BY created_at, id
    ) AS rn
  FROM memories
  WHERE source IS NOT NULL
    AND source_id IS NOT NULL
    AND deleted_at IS NULL
)
UPDATE memories m
SET deleted_at = NOW(), updated_at = NOW()
FROM ranked r
WHERE m.id = r.id
  AND r.rn > 1;

-- 2. The old non-unique index is now redundant with the partial unique index below.
DROP INDEX IF EXISTS idx_memories_source_sourceid;

-- 3. Enforce uniqueness on live, externally-identified rows.
--    Partial so NULL source_id (manual/freeform memories) is unconstrained and
--    soft-deleted rows don't block re-ingestion of the same URL later.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_source_sourceid_unique
  ON memories (source, source_id)
  WHERE source_id IS NOT NULL AND deleted_at IS NULL;
