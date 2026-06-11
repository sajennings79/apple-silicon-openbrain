# OpenBrain

Fully local AI memory system for Apple Silicon Macs. MCP server giving Claude Code (or any MCP client) persistent semantic memory with vector search.

## Architecture

- **MCP Server** (`src/index.ts`): Bun HTTP server on port 6277. Handles MCP protocol via `WebStandardStreamableHTTPServerTransport`, plus REST endpoints for URL ingestion.
- **Embedding Service** (`embed-service/server.py`): Python FastAPI on port 6278. Uses MLX to run `Qwen3-Embedding-0.6B-4bit-DWQ` locally on Metal GPU. Produces 1024-dim vectors.
- **Enrichment**: Calls mlx-lm server (port 8000) running `Qwen3.6-27B-4bit` (configured via `LLM_MODEL`; must match the `--model` the server actually loads, or mlx-lm hot-swaps and thrashes the 32GB GPU) to auto-extract summary, tags, and entities from stored memories. Fire-and-forget after store/update. The same loaded model also serves Hermes local-model cron jobs and delegation.
- **PostgreSQL + pgvector**: `memories` table with HNSW vector index, GIN indexes on tags/entities/FTS.
- **Redis**: Optional caching layer for embeddings (24h TTL) and search results (5min TTL). Degrades gracefully if unavailable.
- **Web UI** (`ui/`): Single-page dashboard on port 6279 for browsing/searching memories.

## Key Patterns

- **Qwen3.x think blocks**: Qwen3.6 **ignores the `/no_think` prefix** — the real reasoning switch is `chat_template_kwargs: { enable_thinking: false }` in the request body (`enrichment.ts:76`). Without it the model can burn the whole `max_tokens` budget reasoning and return empty content. The `<think>...</think>` strip is now belt-and-suspenders (no inline think tags on current models).
- **Vector dimensions**: Fixed at 1024 (matches the embedding model). Schema, HNSW index, and embedding service all assume this.
- **Drizzle ORM**: Has built-in `vector` column type. Do NOT use the `pgvector/drizzle-orm` npm package.
- **Source field**: Open string, not an enum. Common values: `claude-code`, `manual`, `web`, `youtube`.
- **Content truncation**: Enrichment caps input at 4000 chars to avoid Metal GPU OOM.
- **Auth**: Bearer token required for non-localhost MCP requests. `/api/*` routes are open (intended for local network only).

## OB1 Compatibility & Governance

Modeled on Nate B. Jones's [OB1 / "Open Brain"](https://github.com/NateBJones-Projects/OB1) ecosystem. See `metadata.json` (OB1 catalog vocabulary) and the strategy doc referenced in `[[ob1-relationship]]` memory.

- **Canonical MCP tool parity** (`src/tools/compat.ts`): mirrors OB1's `search`, `fetch`, `search_thoughts`, `list_thoughts`, `thought_stats`, `capture_thought` as translating aliases over our native tools so OB1 companion skills/prompt packs work. Field translation: `memoryType↔type`, `tags↔topics`, `entities.person↔people`. Taxonomies differ — aliases translate, they don't pretend the enums match.
- **Trust ladder** (governance columns on `memories`): agent-written memory enters as **evidence**, not **instruction**. `created_by` (user/agent/system/import), `provenance_status`, `review_status`. `can_use_as_instruction` may only be true for `user_confirmed`/`imported` memory — enforced by the `chk_memories_instruction_grade` CHECK. Promote via the `ReviewMemory` tool (`confirm` → instruction-grade).
- **Content-fingerprint dedup**: `content_fingerprint` (sha256 of normalized content) is **advisory/non-unique** — the live corpus already holds legitimately-duplicated content, so a hard UNIQUE would fail. `storeMemory` uses it to dedup freeform captures that lack a `sourceId`. JS `normalizeForFingerprint` must mirror the SQL backfill in `drizzle/0006_governance.sql`.
- **Append-only audit**: `memory_audit` (memory_id is NOT a FK so audit survives deletion). Written fire-and-forget on capture/update/review/supersede.
- **Recency-boosted ranking**: `SearchMemory` accepts `recencyWeight`/`halfLifeDays` (blend, default 0 = pure similarity) and `threshold`; rejected/superseded/disputed memories are excluded unless `includeRejected`.
- **Scope columns** (`workspace_id`/`project_id`/`visibility`): nullable, forward-compat only — no multi-tenant enforcement yet.

## Commands

```bash
bun run dev          # MCP server
bun run ui           # Web UI
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Apply migrations
bun run health       # Health check all services
bun run test         # Run the test suite (bun test)
bun run typecheck    # tsc --noEmit
```

## Package Manager + Runtime

- **Package manager: `pnpm`** (brew-installed, v11+). Use `pnpm install` / `pnpm add`. Never `npm`/`yarn`/`bun install`.
- **Runtime: `bun`**. The project uses `Bun.serve`, `Bun.spawn`, `Bun.file` throughout — `bun run X` is the right way to execute scripts. Bun reads pnpm's symlinked `node_modules` natively.
- Why split: `bun install` hits a SIP/provenance issue on this Mac that's well-documented and unfixable from inside the repo. `pnpm install` sidesteps it entirely. The runtime is unaffected.
- **Node version**: requires Node 22+ (for `node:sqlite`, used by pnpm 11). LTS v24 is the recommended default.
