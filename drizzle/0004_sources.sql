CREATE TABLE IF NOT EXISTS sources (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind              TEXT NOT NULL,
    name              TEXT NOT NULL,
    config            JSONB NOT NULL DEFAULT '{}',
    interval_seconds  INTEGER NOT NULL DEFAULT 900,
    enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    last_synced_at    TIMESTAMPTZ,
    last_error        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sources_kind ON sources (kind);
CREATE INDEX IF NOT EXISTS idx_sources_enabled_synced ON sources (enabled, last_synced_at);
