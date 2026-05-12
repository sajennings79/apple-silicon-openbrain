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
  const messages = [{ role: "user", content: config.noThink === false ? prompt : `/no_think\n${prompt}` }];
  const res = await fetch(`${LLM_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: config.model ?? DEFAULT_MODEL,
      messages,
      max_tokens: config.maxTokens ?? 4096,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`LLM call failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
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
  const promptPath = process.argv[2];
  if (!promptPath) {
    console.error("Usage: bun run agents/run-agent.ts <path-to-prompt.md>");
    process.exit(1);
  }

  const raw = await Bun.file(promptPath).text();
  const { config, body } = splitFrontmatter(raw);

  const memories = await fetchMemories(config.search ?? {});
  const memoriesBlock = renderMemoriesBlock(memories);
  const rendered = body.replace(/\{\{\s*memories\s*\}\}/g, memoriesBlock);

  const startedAt = Date.now();
  const result = await callLLM(rendered, config);
  const elapsedMs = Date.now() - startedAt;

  if (config.output) {
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
