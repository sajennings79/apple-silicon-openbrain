import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StoreMemorySchema, storeMemory } from "./tools/StoreMemory.js";
import { SearchMemorySchema, searchMemory } from "./tools/SearchMemory.js";
import { RecallMemorySchema, recallMemory } from "./tools/RecallMemory.js";
import { ListMemoriesSchema, listMemories } from "./tools/ListMemories.js";
import { UpdateMemorySchema, updateMemory } from "./tools/UpdateMemory.js";
import { DeleteMemorySchema, deleteMemory } from "./tools/DeleteMemory.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "openbrain",
    version: "0.1.0",
  });

  server.tool(
    "StoreMemory",
    "Store a new memory with semantic embedding. Content is automatically enriched with summary, tags, and entities via LLM.",
    StoreMemorySchema.shape,
    async (input) => {
      const result = await storeMemory(input as any);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "SearchMemory",
    "Semantic search across stored memories. Returns results ranked by cosine similarity with optional filters.",
    SearchMemorySchema.shape,
    async (input) => {
      const result = await searchMemory(input as any);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "RecallMemory",
    "Retrieve a specific memory by its UUID.",
    RecallMemorySchema.shape,
    async (input) => {
      const result = await recallMemory(input as any);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "ListMemories",
    "List memories with optional filters for type, source, and tags. Paginated.",
    ListMemoriesSchema.shape,
    async (input) => {
      const result = await listMemories(input as any);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "UpdateMemory",
    "Update a memory's content or metadata. Content changes trigger re-embedding and re-enrichment.",
    UpdateMemorySchema.shape,
    async (input) => {
      const result = await updateMemory(input as any);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    "DeleteMemory",
    "Soft-delete a memory by UUID. The memory is marked as deleted but not removed from the database.",
    DeleteMemorySchema.shape,
    async (input) => {
      const result = await deleteMemory(input as any);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  );

  return server;
}
