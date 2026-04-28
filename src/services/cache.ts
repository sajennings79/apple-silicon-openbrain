import Redis from "ioredis";
import { config } from "../lib/config.js";

const redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });

let connected = false;

async function ensureConnected() {
  if (!connected) {
    try {
      await redis.connect();
      connected = true;
    } catch {
      console.warn("Redis unavailable, caching disabled");
    }
  }
  return connected;
}

const PREFIX = "openbrain";

function hashKey(data: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(data);
  return hasher.digest("hex").slice(0, 16);
}

export async function getCachedEmbedding(text: string): Promise<number[] | null> {
  if (!(await ensureConnected())) return null;
  const key = `${PREFIX}:embed:${hashKey(text)}`;
  const cached = await redis.get(key);
  return cached ? JSON.parse(cached) : null;
}

export async function setCachedEmbedding(text: string, embedding: number[]): Promise<void> {
  if (!(await ensureConnected())) return;
  const key = `${PREFIX}:embed:${hashKey(text)}`;
  await redis.set(key, JSON.stringify(embedding), "EX", 86400); // 24h
}

export async function getCachedSearch(queryHash: string): Promise<string | null> {
  if (!(await ensureConnected())) return null;
  const key = `${PREFIX}:search:${queryHash}`;
  return redis.get(key);
}

export async function setCachedSearch(queryHash: string, result: string): Promise<void> {
  if (!(await ensureConnected())) return;
  const key = `${PREFIX}:search:${queryHash}`;
  await redis.set(key, result, "EX", 300); // 5m
}
