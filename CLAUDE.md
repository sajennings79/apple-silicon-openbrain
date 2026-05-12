# OpenBrain

Fully local AI memory system for Apple Silicon Macs. MCP server giving Claude Code (or any MCP client) persistent semantic memory with vector search.

## Architecture

- **MCP Server** (`src/index.ts`): Bun HTTP server on port 6277. Handles MCP protocol via `WebStandardStreamableHTTPServerTransport`, plus REST endpoints for URL ingestion.
- **Embedding Service** (`embed-service/server.py`): Python FastAPI on port 6278. Uses MLX to run `Qwen3-Embedding-0.6B-4bit-DWQ` locally on Metal GPU. Produces 1024-dim vectors.
- **Enrichment**: Calls mlx-lm server (port 8000) running `Qwen3.6-35B-A3B-4bit` (default; configurable via `LLM_MODEL`) to auto-extract summary, tags, and entities from stored memories. Fire-and-forget after store/update.
- **PostgreSQL + pgvector**: `memories` table with HNSW vector index, GIN indexes on tags/entities/FTS.
- **Redis**: Optional caching layer for embeddings (24h TTL) and search results (5min TTL). Degrades gracefully if unavailable.
- **Web UI** (`ui/`): Single-page dashboard on port 6279 for browsing/searching memories.

## Key Patterns

- **Qwen3.x think blocks**: Enrichment strips `<think>...</think>` from Qwen3.x responses. The enrichment prompt uses `/no_think` prefix.
- **Vector dimensions**: Fixed at 1024 (matches the embedding model). Schema, HNSW index, and embedding service all assume this.
- **Drizzle ORM**: Has built-in `vector` column type. Do NOT use the `pgvector/drizzle-orm` npm package.
- **Source field**: Open string, not an enum. Common values: `claude-code`, `manual`, `web`, `youtube`.
- **Content truncation**: Enrichment caps input at 4000 chars to avoid Metal GPU OOM.
- **Auth**: Bearer token required for non-localhost MCP requests. `/api/*` routes are open (intended for local network only).

## Commands

```bash
bun run dev          # MCP server
bun run ui           # Web UI
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Apply migrations
bun run health       # Health check all services
```

## Package Manager + Runtime

- **Package manager: `pnpm`** (brew-installed, v11+). Use `pnpm install` / `pnpm add`. Never `npm`/`yarn`/`bun install`.
- **Runtime: `bun`**. The project uses `Bun.serve`, `Bun.spawn`, `Bun.file` throughout — `bun run X` is the right way to execute scripts. Bun reads pnpm's symlinked `node_modules` natively.
- Why split: `bun install` hits a SIP/provenance issue on this Mac that's well-documented and unfixable from inside the repo. `pnpm install` sidesteps it entirely. The runtime is unaffected.
- **Node version**: requires Node 22+ (for `node:sqlite`, used by pnpm 11). LTS v24 is the recommended default.
