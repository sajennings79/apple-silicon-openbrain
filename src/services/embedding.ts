import { config } from "../lib/config.js";

// Cap embedding input length. Mean-pooled embeddings over very long documents add
// little semantic value but a huge payload (e.g. a 180-page PDF scraped to
// markdown) can OOM the Metal GPU in the embedding service — which made the store
// throw, leaving no row, so the source was re-scraped every cycle. Truncating
// keeps stores reliable; the full content is still persisted in the row.
const MAX_EMBED_CHARS = 8000;

export async function getEmbedding(text: string): Promise<number[]> {
  const input = text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text;
  if (input.length < text.length) {
    console.log(`[embedding] truncated input ${text.length} -> ${MAX_EMBED_CHARS} chars`);
  }

  const res = await fetch(`${config.embeddingUrl}/v1/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    throw new Error(`Embedding service error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    data: { embedding: number[] }[];
  };
  return data.data[0].embedding;
}
