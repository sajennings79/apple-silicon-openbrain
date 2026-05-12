import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { memories } from "../db/schema.js";
import { config } from "../lib/config.js";

const SYSTEM_PROMPT = `You are a metadata extraction service. You ALWAYS respond with valid JSON only, no thinking, no explanation.`

const ENRICHMENT_PROMPT = `/no_think
Extract metadata from the following text. Return ONLY a JSON object with these keys:
- "summary": 1-2 sentence summary
- "tags": array of 2-5 lowercase topic tags (no spaces)
- "entities": object with keys "person", "org", "tech", "concept", "location" mapping to arrays of names

Text:
`;

// Cap content sent to the LLM. Long Obsidian sections can tokenize to 10k+
// tokens and OOM the Metal GPU; summary/tag extraction only needs the first
// few paragraphs to be useful.
const MAX_ENRICH_CHARS = 4000;

const ENRICH_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 2_000;

async function postEnrichment(body: string): Promise<Response> {
  return fetch(`${config.llmUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
  });
}

export async function enrichMemory(memoryId: string, content: string): Promise<void> {
  if (process.env.DISABLE_ENRICHMENT === "true") return;
  const truncated =
    content.length > MAX_ENRICH_CHARS
      ? content.slice(0, MAX_ENRICH_CHARS) + "\n\n[...truncated for enrichment...]"
      : content;

  const body = JSON.stringify({
    model: config.llmModel,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: ENRICHMENT_PROMPT + truncated },
    ],
    temperature: 0.1,
    max_tokens: 1024,
  });

  try {
    let res: Response;
    try {
      res = await postEnrichment(body);
    } catch (err) {
      // Network/timeout/abort — single retry. Deterministic errors (4xx, JSON
      // parse) are not retried below.
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      res = await postEnrichment(body);
    }

    if (res.status >= 500) {
      // Server-side transient — retry once.
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      res = await postEnrichment(body);
    }

    if (!res.ok) {
      throw new Error(`Enrichment LLM HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };

    let raw = data.choices[0]?.message?.content ?? "";
    // Strip <think>...</think> blocks from Qwen3 reasoning
    raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    // Extract JSON from potential markdown code blocks
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Enrichment: no JSON found in response");
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string;
      tags?: string[];
      entities?: Record<string, string[]>;
    };

    await db
      .update(memories)
      .set({
        summary: parsed.summary ?? null,
        tags: parsed.tags ?? [],
        entities: parsed.entities ?? {},
        updatedAt: new Date(),
      })
      .where(eq(memories.id, memoryId));
  } catch (err) {
    // Re-throw so callers that await this (bulk enrichment) see failures.
    // The fire-and-forget StoreMemory path uses .catch(() => {}) and still
    // swallows the error there.
    throw err;
  }
}
