-- Attribution: which `sources` row ingested this memory. Deliberately NOT a
-- foreign key (same philosophy as memory_audit.memory_id): deleting a source
-- must never touch or lock memory rows, and attribution to a since-deleted
-- source is still useful for audit/debugging. Dangling ids render as
-- "(deleted source)" in the UI.
ALTER TABLE memories ADD COLUMN IF NOT EXISTS origin_source_id UUID;

CREATE INDEX IF NOT EXISTS idx_memories_origin_source
  ON memories (origin_source_id) WHERE origin_source_id IS NOT NULL;

-- Retention sweeper scan: live rows with an expiry.
CREATE INDEX IF NOT EXISTS idx_memories_expires
  ON memories (expires_at) WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

-- Purge scan: soft-deleted rows.
CREATE INDEX IF NOT EXISTS idx_memories_deleted
  ON memories (deleted_at) WHERE deleted_at IS NOT NULL;
