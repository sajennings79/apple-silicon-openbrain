import { config } from "../lib/config.js";

export async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch(`${config.embeddingUrl}/v1/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: text }),
  });

  if (!res.ok) {
    throw new Error(`Embedding service error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    data: { embedding: number[] }[];
  };
  return data.data[0].embedding;
}
