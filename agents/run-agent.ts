#!/usr/bin/env bun
// Local-only stuffed-prompt agent runner.
//
// Reads a prompt file with JSON frontmatter, queries openbrain for matching
// memories, renders the prompt body with the memories interpolated, calls the
// local mlx-lm server for completion, and (optionally) stores the result back
// as a new memory.
//
// Zero API keys. Zero cloud calls. All traffic stays on localhost.
//
// Usage:
//   bun run agents/run-agent.ts <path-to-prompt.md>

interface SearchSpec {
  source?: string;
  tag?: string;
  type?: string;
  q?: string;
  limit?: number;
  sinceDays?: number;
}

interface OutputSpec {
  memoryType?: string;
  source?: string;
  tags?: string[];
}

interface AgentConfig {
  name: string;
  description?: string;
  model?: string;
  noThink?: boolean;
  maxTokens?: number;
  minMemories?: number;
  search?: SearchSpec;
  output?: OutputSpec;
}

interface Memory {
  id: string;
  content: string;
  summary: string | null;
  source: string | null;
  memoryType: string | null;
  tags: string[] | null;
  effectiveDate: string;
}

// A recorded eval fixture. `memories` mocks fetchMemories() (so openbrain need
// not be running); an optional `llmResponse` mocks callLLM() for fully offline
// replay. See tests/agents/README.md.
interface Fixture {
  search?: SearchSpec;
  memories: Memory[];
  llmResponse?: string;
}

function parseArgs(argv: string[]): { promptPath?: string; fixturesPath?: string } {
  let promptPath: string | undefined;
  let fixturesPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fixtures") {
      fixturesPath = argv[++i];
    } else if (a.startsWith("--fixtures=")) {
      fixturesPath = a.slice("--fixtures=".length);
    } else if (!promptPath && !a.startsWith("-")) {
      promptPath = a;
    }
  }
  return { promptPath, fixturesPath };
}

const UI_BASE = process.env.OPENBRAIN_UI_URL ?? "http://127.0.0.1:6279";
const LLM_URL = process.env.LLM_URL ?? "http://127.0.0.1:8000";
const DEFAULT_MODEL = process.env.LLM_MODEL ?? "mlx-community/Qwen3-8B-4bit";

function splitFrontmatter(raw: string): { config: AgentConfig; body: string } {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Prompt file must start with a `---` JSON frontmatter block.");
  }
  const [, fmRaw, body] = match;
  let config: AgentConfig;
  try {
    config = JSON.parse(fmRaw);
  } catch (err) {
    throw new Error(`Frontmatter must be valid JSON: ${(err as Error).message}`);
  }
  if (!config.name) throw new Error("Frontmatter missing required field: name");
  return { config, body };
}

async function fetchMemories(spec: SearchSpec): Promise<Memory[]> {
  const params = new URLSearchParams();
  if (spec.source) params.set("source", spec.source);
  if (spec.tag) params.set("tag", spec.tag);
  if (spec.type) params.set("type", spec.type);
  if (spec.q) params.set("q", spec.q);
  params.set("limit", String(spec.limit ?? 50));

  const res = await fetch(`${UI_BASE}/api/memories?${params}`);
  if (!res.ok) throw new Error(`Memory fetch failed: ${res.status} ${await res.text()}`);
  let memories = (await res.json()) as Memory[];

  if (spec.sinceDays != null) {
    const cutoff = Date.now() - spec.sinceDays * 86400_000;
    memories = memories.filter((m) => new Date(m.effectiveDate).getTime() >= cutoff);
  }
  return memories;
}

function renderMemoriesBlock(memories: Memory[]): string {
  if (memories.length === 0) return "(no matching memories found)";
  return memories
    .map((m, i) => {
      const header = m.summary?.trim() || m.content.slice(0, 80).replace(/\n/g, " ");
      const tags = (m.tags ?? []).join(", ") || "—";
      return `### Memory ${i + 1}: ${header}\n\nSource: ${m.source ?? "—"} | Tags: ${tags} | Date: ${m.effectiveDate}\n\n${m.content}`;
    })
    .join("\n\n---\n\n");
}

async function callLLM(prompt: string, config: AgentConfig): Promise<string> {
  // Qwen3.x are reasoning models. mlx-lm returns the chain-of-thought in a
  // separate `reasoning` field and the actual answer in `content`. The legacy
  // `/no_think` soft switch is a no-op on Qwen3.6 — the model reasons anyway and,
  // if it exhausts max_tokens mid-thought, returns NO `content` at all. The
  // reliable switch is `chat_template_kwargs.enable_thinking`, which every Qwen3.x
  // chat template honors. Default (noThink !== false) disables thinking.
  const body: Record<string, unknown> = {
    model: config.model ?? DEFAULT_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: config.maxTokens ?? 4096,
    stream: false,
  };
  if (config.noThink !== false) {
    body.chat_template_kwargs = { enable_thinking: false };
  }
  const res = await fetch(`${LLM_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LLM call failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  // Strip inline <think> blocks too, for older Qwen3 gens that emit them.
  const content = (data.choices?.[0]?.message?.content ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
  if (!content) {
    const fr = data.choices?.[0]?.finish_reason ?? "unknown";
    throw new Error(
      `LLM returned empty content (finish_reason=${fr}). A reasoning model likely ` +
        `spent the whole ${body.max_tokens}-token budget thinking. Raise maxTokens, ` +
        `or keep noThink enabled so thinking is disabled.`,
    );
  }
  return content;
}

async function storeBack(result: string, output: OutputSpec, agentName: string): Promise<{ id: string }> {
  const body = {
    content: result,
    source: output.source ?? `agent:${agentName}`,
    sourceId: `${agentName}:${new Date().toISOString()}`,
    memoryType: output.memoryType ?? "learning",
    tags: output.tags ?? [],
  };
  const res = await fetch(`${UI_BASE}/api/memories`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Memory store failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string };
}

async function main() {
  const { promptPath, fixturesPath } = parseArgs(process.argv.slice(2));
  if (!promptPath) {
    console.error("Usage: bun run agents/run-agent.ts <path-to-prompt.md> [--fixtures <path>]");
    process.exit(1);
  }

  const raw = await Bun.file(promptPath).text();
  const { config, body } = splitFrontmatter(raw);

  // When --fixtures is given, replay recorded input instead of hitting live
  // services: fixture.memories stands in for fetchMemories(), and (if present)
  // fixture.llmResponse stands in for callLLM(). Eval runs never store back.
  const fixture: Fixture | null = fixturesPath
    ? (JSON.parse(await Bun.file(fixturesPath).text()) as Fixture)
    : null;

  const memories = fixture ? fixture.memories : await fetchMemories(config.search ?? {});

  // Fail fast rather than synthesize from near-empty input.
  const minMemories = config.minMemories ?? 0;
  if (memories.length < minMemories) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          agent: config.name,
          skipped: true,
          reason: `below minMemories threshold (${memories.length} < ${minMemories})`,
          memoriesUsed: memories.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  const memoriesBlock = renderMemoriesBlock(memories);
  const rendered = body.replace(/\{\{\s*memories\s*\}\}/g, memoriesBlock);

  const startedAt = Date.now();
  const result = fixture?.llmResponse != null ? fixture.llmResponse : await callLLM(rendered, config);
  const elapsedMs = Date.now() - startedAt;

  if (config.output && !fixture) {
    const stored = await storeBack(result, config.output, config.name);
    console.log(
      JSON.stringify(
        {
          ok: true,
          agent: config.name,
          memoriesUsed: memories.length,
          elapsedMs,
          storedMemoryId: stored.id,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`# ${config.name} — ${memories.length} memories, ${elapsedMs}ms\n\n${result}`);
  }
}

main().catch((err) => {
  console.error(`[run-agent] ${err instanceof Error ? err.stack : err}`);
  process.exit(1);
});
