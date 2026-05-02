import { pgTable, uuid, text, timestamp, jsonb, index, real } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { vector } from "drizzle-orm/pg-core";

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    content: text("content").notNull(),
    summary: text("summary"),
    embedding: vector("embedding", { dimensions: 1024 }),
    source: text("source"),
    sourceId: text("source_id"),
    memoryType: text("memory_type"),
    tags: text("tags").array(),
    entities: jsonb("entities").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    sourceDate: timestamp("source_date", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_memories_tags").using("gin", table.tags),
    index("idx_memories_entities").using("gin", table.entities),
    index("idx_memories_content_fts").using(
      "gin",
      sql`to_tsvector('english', ${table.content})`
    ),
    index("idx_memories_source_date").on(table.sourceDate.desc()),
    index("idx_memories_source_sourceid").on(table.source, table.sourceId),
  ]
);

export const memoryLinks = pgTable(
  "memory_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceMemoryId: uuid("source_memory_id").notNull().references(() => memories.id),
    targetMemoryId: uuid("target_memory_id").notNull().references(() => memories.id),
    similarity: real("similarity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_memory_links_source").on(table.sourceMemoryId),
    index("idx_memory_links_target").on(table.targetMemoryId),
  ]
);
