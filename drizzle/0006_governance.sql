-- Governance / trust-ladder model (OB1 agent-memory, adapted for local single-user).
-- All changes are additive and safe to apply to the live corpus:
--  * new columns are nullable or have constant defaults (metadata-only on PG 11+)
--  * the content fingerprint is advisory (NON-unique) — the corpus already holds
--    legitimately-duplicated content, so a hard UNIQUE would fail.
--  * the CHECK validates clean against existing rows (can_use_as_instruction = false).

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS provenance_status         text,
  ADD COLUMN IF NOT EXISTS created_by                text,
  ADD COLUMN IF NOT EXISTS confidence                real,
  ADD COLUMN IF NOT EXISTS review_status             text,
  ADD COLUMN IF NOT EXISTS can_use_as_instruction    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_use_as_evidence       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_user_confirmation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS content_fingerprint       text,
  ADD COLUMN IF NOT EXISTS supersedes                uuid,
  ADD COLUMN IF NOT EXISTS workspace_id              text,
  ADD COLUMN IF NOT EXISTS project_id                text,
  ADD COLUMN IF NOT EXISTS visibility                text;

-- Backfill an advisory fingerprint for existing rows. Normalization must mirror
-- the JS normalizeForFingerprint(): lowercase, collapse whitespace runs, trim.
UPDATE memories
SET content_fingerprint = encode(
      sha256(convert_to(lower(regexp_replace(btrim(content), '\s+', ' ', 'g')), 'UTF8')),
      'hex')
WHERE content_fingerprint IS NULL;

CREATE INDEX IF NOT EXISTS idx_memories_content_fingerprint
  ON memories (content_fingerprint)
  WHERE content_fingerprint IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_memories_review_status
  ON memories (review_status)
  WHERE review_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memories_supersedes
  ON memories (supersedes)
  WHERE supersedes IS NOT NULL;

-- Trust rule: instruction-grade memory must be human-confirmed or trusted-imported.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_memories_instruction_grade'
  ) THEN
    ALTER TABLE memories
      ADD CONSTRAINT chk_memories_instruction_grade
      CHECK (can_use_as_instruction = false
             OR provenance_status IN ('user_confirmed', 'imported'));
  END IF;
END $$;

-- Append-only audit log. memory_id is intentionally NOT a foreign key so audit
-- rows outlive hard deletion of the memory they describe.
CREATE TABLE IF NOT EXISTS memory_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id   uuid NOT NULL,
  action      text NOT NULL,
  source      text,
  actor       text,
  diff        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_audit_memory  ON memory_audit (memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_audit_created ON memory_audit (created_at DESC);
