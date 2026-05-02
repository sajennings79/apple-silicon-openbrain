CREATE TABLE IF NOT EXISTS memory_links (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_memory_id  UUID NOT NULL REFERENCES memories(id),
    target_memory_id  UUID NOT NULL REFERENCES memories(id),
    similarity        REAL NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_links_source ON memory_links (source_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_links_target ON memory_links (target_memory_id);
