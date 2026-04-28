#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== OpenBrain Setup ==="

# PostgreSQL
echo "→ Checking PostgreSQL..."
PG_PREFIX="$(brew --prefix postgresql@17 2>/dev/null || true)"
if [ -n "$PG_PREFIX" ] && [ -d "$PG_PREFIX/bin" ]; then
  export PATH="$PG_PREFIX/bin:$PATH"
fi

if ! command -v psql &>/dev/null; then
  echo "  ✗ psql not found. Install PostgreSQL 17: brew install postgresql@17"
  exit 1
fi

if ! brew services list | grep -q "postgresql@17.*started"; then
  echo "  Starting PostgreSQL 17..."
  brew services start postgresql@17
  sleep 2
fi

if ! psql -lqt | cut -d \| -f 1 | grep -qw openbrain; then
  echo "  Creating openbrain database..."
  createdb openbrain
fi

psql openbrain -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null
echo "  ✓ PostgreSQL ready"

# Schema
echo "→ Applying schema..."
psql openbrain -f - <<'SQL'
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
    source_date TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ,
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_memories_entities ON memories USING gin (entities);
CREATE INDEX IF NOT EXISTS idx_memories_content_fts ON memories
    USING gin (to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_memories_source_date ON memories (source_date DESC);
CREATE INDEX IF NOT EXISTS idx_memories_source_sourceid ON memories (source, source_id);
SQL
echo "  ✓ Schema applied"

# Bun dependencies
echo "→ Installing Bun dependencies..."
cd "$REPO_DIR"
BUN_TMPDIR="$REPO_DIR/.tmp" bun install --silent
echo "  ✓ Dependencies installed"

# Python embedding service
echo "→ Setting up embedding service..."
cd "$REPO_DIR/embed-service"
uv sync --quiet
echo "  ✓ Embedding service ready"

echo ""
echo "=== Setup Complete ==="
echo "Start services:"
echo "  bun run dev                          # MCP server (port 6277)"
echo "  cd embed-service && uv run server.py # Embedding service (port 6278)"
