export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://localhost:5432/openbrain",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  embeddingUrl: process.env.EMBEDDING_URL ?? "http://localhost:6278",
  llmUrl: process.env.LLM_URL ?? "http://localhost:8000",
  llmModel: process.env.LLM_MODEL ?? "mlx-community/Qwen3.6-35B-A3B-4bit",
  mcpPort: Number(process.env.MCP_PORT ?? 6277),
  mcpHost: process.env.MCP_HOST ?? "0.0.0.0",
  authToken: process.env.AUTH_TOKEN ?? "",
  firecrawlEnabled: process.env.ENABLE_FIRECRAWL === "true",
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY ?? "",
  obscuraPath: process.env.OBSCURA_PATH ?? "obscura",
} as const;
