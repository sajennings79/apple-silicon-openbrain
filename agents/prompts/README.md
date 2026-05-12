# OpenBrain agents — prompt format

This directory contains **prompts** that the OpenBrain agent runner (`agents/run-agent.ts`) executes on a schedule. Each prompt is a Markdown file with a JSON frontmatter block.

The runner is **fully local**. It queries OpenBrain via REST, calls the local mlx-lm server for completion, and (optionally) writes the result back as a new memory. No Anthropic, OpenAI, or other cloud APIs are involved.

## File format

```markdown
---
{
  "name": "my-agent",
  "description": "Plain English description shown in the GUI.",
  "noThink": true,                              // optional — prefixes /no_think for Qwen3 models. default true
  "maxTokens": 2048,                            // optional — completion cap. default 4096
  "model": "mlx-community/Qwen3-8B-4bit",       // optional — override default model
  "search": {
    "source": "mail",                           // optional — exact match on source field
    "tag": "Newsletter",                        // optional — single-tag filter
    "type": "fact",                             // optional — memoryType filter
    "q": "string to grep in content",           // optional — ILIKE substring match
    "sinceDays": 1,                             // optional — only memories newer than N days
    "limit": 30                                 // optional — default 50, max 500
  },
  "output": {                                   // optional — omit to print to stdout instead of storing
    "memoryType": "learning",                   // 'fact' | 'learning' | 'decision' | 'conversation'
    "source": "agent:my-agent",
    "tags": ["digest"]
  }
}
---

Your prompt body goes here. It can be as long as you want.

Use `{{memories}}` as a placeholder — the runner replaces it with a Markdown
block of the matched memories.

If you don't include `{{memories}}`, the agent ignores the search results.
```

## Running an agent

```bash
# From the openbrain repo:
bun run agents/run-agent.ts agents/prompts/newsletter-digest.md

# Or via the wrapper:
agents/run-agent.sh agents/prompts/newsletter-digest.md

# Or shorthand (looks in agents/prompts/):
agents/run-agent.sh newsletter-digest.md
```

When `output` is set, the runner stores the LLM's response as a new memory and emits a one-line JSON status (`{ok, agent, memoriesUsed, storedMemoryId, elapsedMs}`). When `output` is omitted, the response prints to stdout — useful for testing.

## Writing your own

1. Copy one of the shipped prompts (`newsletter-digest.md`, `product-announcements.md`) into your own user-prompts directory (default location: `~/Developer/claude-cron/prompts/`).
2. Edit the frontmatter. Tighten the `search` filters until `bun run agents/run-agent.ts your-prompt.md` (with `output` omitted) returns the memories you want.
3. Refine the prompt body. The runner inlines `{{memories}}` verbatim, so think about how the model will read your formatting.
4. Add the `output` block when you're happy with the result.
5. Schedule it via the OpenBrain Mac app (Phase 5) or by writing a launchd plist using `agents/launchd/com.openbrain.agent.template.plist` as the starting point.

## Why JSON frontmatter, not YAML?

JSON has zero ambiguity, no parser to ship, no whitespace footguns. The frontmatter is metadata for a machine — it doesn't need to be hand-friendly. The Markdown body below the frontmatter is where you spend your time.
