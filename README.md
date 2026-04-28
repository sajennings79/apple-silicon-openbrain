# OpenBrain

Fully local AI memory for Apple Silicon. Gives any MCP client persistent semantic memory with vector search — no cloud APIs required.

Everything runs on your Mac: embeddings via MLX on Metal GPU, enrichment via a local LLM, storage in PostgreSQL with pgvector.

Built on the [OB1](https://github.com/NateBJones-Projects/OB1) architecture by [@NateBJones-Projects](https://github.com/NateBJones-Projects).

## Architecture

![OpenBrain Architecture](assets/architecture.png)

A Bun MCP server brokers requests from any MCP client to PostgreSQL+pgvector for storage, a local MLX embedding service for vectorization, and a local mlx-lm server for enrichment. Redis caches embeddings and search results. A separate Bun web UI reads directly from PostgreSQL. Everything runs on-device — no cloud APIs in the data path.

## Requirements

- **Apple Silicon Mac** (M1/M2/M3/M4) — required for MLX GPU inference
- macOS 14+
- [Bun](https://bun.sh) 1.1+
- Python 3.13+ with [uv](https://docs.astral.sh/uv/)
- [PostgreSQL 17](https://www.postgresql.org/) with [pgvector](https://github.com/pgvector/pgvector) extension
- [Redis](https://redis.io/) (optional but recommended)

Install prerequisites with Homebrew:

```bash
brew install postgresql@17 pgvector redis bun uv
brew services start postgresql@17
brew services start redis
```

## Quick Start

```bash
# 1. Clone and enter the repo
git clone https://github.com/sajennings79/apple-silicon-openbrain.git
cd apple-silicon-openbrain

# 2. Configure environment
cp .env.example .env
# Edit .env if needed (defaults work for local setup)

# 3. Run setup (creates database, installs dependencies)
bash scripts/setup.sh

# 4. Set up the Python embedding service
cd embed-service && uv sync && cd ..

# 5. Create a Python venv for the LLM enrichment server
python3 -m venv ~/.mlx-venv
~/.mlx-venv/bin/pip install mlx-lm

# 6. Start all services (installs as launchd daemons)
bash scripts/install-services.sh

# 7. Verify everything is running
bun run health
```

Or start services manually:

```bash
bun run dev                                    # MCP server (port 6277)
cd embed-service && uv run server.py           # Embedding service (port 6278)
~/.mlx-venv/bin/python -m mlx_lm.server \
  --model mlx-community/Qwen3-30B-A3B-4bit \
  --port 8000 --max-tokens 4096               # LLM enrichment (port 8000)
bun run ui                                     # Web UI (port 6279)
```

## MCP Client Configuration

OpenBrain exposes both HTTP and stdio MCP transports. Configure your client to point at whichever it supports.

**HTTP transport** (recommended — one shared server for all clients):

```json
{
  "mcpServers": {
    "openbrain": {
      "type": "http",
      "url": "http://localhost:6277/mcp"
    }
  }
}
```

**stdio transport** (for clients that spawn the server as a subprocess):

```json
{
  "mcpServers": {
    "openbrain": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "/path/to/openbrain/src/stdio.ts"]
    }
  }
}
```

The exact config-file location depends on your client (e.g. `.mcp.json` in a project root, or a global config under your home directory).

## MCP Tools

| Tool | Description |
|------|-------------|
| **StoreMemory** | Store text with automatic embedding and LLM enrichment (summary, tags, entities) |
| **SearchMemory** | Semantic vector search with optional filters (type, source, tags, date range) |
| **RecallMemory** | Retrieve a specific memory by UUID |
| **ListMemories** | Paginated list with filters |
| **UpdateMemory** | Update content or metadata; re-embeds and re-enriches on content changes |
| **DeleteMemory** | Soft-delete a memory by UUID |

## Services

| Service | Port | Purpose |
|---------|------|---------|
| MCP Server | 6277 | MCP protocol + URL ingestion API |
| Embedding Service | 6278 | Local MLX embeddings (Qwen3-Embedding-0.6B, 1024-dim) |
| LLM Server | 8000 | Local MLX enrichment (Qwen3-30B-A3B) |
| Web UI | 6279 | Dashboard for browsing and searching memories |
| PostgreSQL | 5432 | Memory storage with pgvector |
| Redis | 6379 | Embedding + search result caching |

## Web UI

The web UI at `http://localhost:6279` provides:

- Memory search and browsing with tag/source/type filters
- Dashboard with statistics (total memories, per source, per type)
- Monthly histogram and 30-day sparkline
- New memory creation form
- Tag management

## URL Ingestion

Save web pages and YouTube transcripts directly to memory using the bookmarklet.

1. Open `scripts/bookmarklet.html` in your browser
2. Drag the bookmarklet link to your bookmarks bar
3. Click it on any page to save the content to OpenBrain

**Web pages** are scraped via [Firecrawl](https://firecrawl.dev) (requires `FIRECRAWL_API_KEY` in `.env`). The free tier works well for personal use.

**YouTube URLs** are handled locally via `yt-dlp` (install: `brew install yt-dlp`). Transcripts are extracted and stored with video metadata.

## Gradual Setup

You don't need all services running to get started:

1. **Minimum**: PostgreSQL + Embedding Service + MCP Server — gives you store and search
2. **Add enrichment**: Start the mlx-lm server — memories get auto-enriched with summaries and tags
3. **Add caching**: Start Redis — faster repeated searches and embedding lookups
4. **Add UI**: Start the web UI — browse and manage memories visually
5. **Add ingestion**: Set up Firecrawl API key and bookmarklet — save web content from your browser

To skip enrichment entirely (e.g., while setting up), set `DISABLE_ENRICHMENT=true` in `.env`.

## Remote Access via Tailscale

To access OpenBrain from other devices on your network:

```bash
# Expose MCP server over Tailscale HTTPS
tailscale serve --bg --https=6443 http://localhost:6277
```

Then update your bookmarklet URL to use `https://your-machine.tail-xxxxx.ts.net:6443` and set `AUTH_TOKEN` in `.env` to protect the endpoint.

## Development

```bash
bun run dev          # MCP server with auto-reload
bun run ui           # Web UI
bun run health       # Check all service health
bun run db:generate  # Generate Drizzle migration from schema changes
bun run db:migrate   # Apply pending migrations

# Re-enrich memories missing summaries
bun run scripts/enrich-backlog.ts
```

## Managing Services

```bash
# Install as launchd daemons (auto-start on boot)
bash scripts/install-services.sh

# Uninstall all services
bash scripts/uninstall-services.sh

# Restart a single service
kill $(lsof -ti :6277)  # KeepAlive restarts it automatically

# View logs
tail -f logs/mcp.log
tail -f logs/embed.log
tail -f logs/llm.log
```

## License

MIT
