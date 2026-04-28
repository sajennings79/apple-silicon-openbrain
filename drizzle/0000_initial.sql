CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content     TEXT NOT NULL,
    summary     TEXT,
    embedding   vector(1024),
    source      TEXT,
    source_id   TEXT,
    memory_type TEXT,
    tags        TEXT[],
    entities    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ,
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_memories_entities ON memories USING gin (entities);

CREATE INDEX IF NOT EXISTS idx_memories_content_fts ON memories
    USING gin (to_tsvector('english', content));
