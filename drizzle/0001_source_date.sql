ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS source_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_memories_source_date
  ON memories (source_date DESC);
