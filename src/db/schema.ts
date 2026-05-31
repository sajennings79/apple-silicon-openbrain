import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex, real, integer, boolean } from "drizzle-orm/pg-core";
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
    // Partial UNIQUE: enforces dedup for externally-identified memories (URLs,
    // mail message ids) while leaving freeform NULL-source_id memories alone.
    // Excludes soft-deleted rows so a deleted URL can be re-ingested later.
    uniqueIndex("idx_memories_source_sourceid_unique")
      .on(table.source, table.sourceId)
      .where(sql`${table.sourceId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
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

// Recurring ingestion sources: mail accounts, RSS feeds, watched web pages.
// The Mac app's scheduler periodically POSTs /api/sources/poll-due, which
// fans out to per-kind handlers (rss.ts, mail.ts, ...) for any rows whose
// lastSyncedAt + intervalSeconds is in the past and `enabled = true`.
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // 'mail' | 'rss' | 'webpage'
    name: text("name").notNull(),
    config: jsonb("config").notNull().default({}),
    intervalSeconds: integer("interval_seconds").notNull().default(900),
    enabled: boolean("enabled").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_sources_kind").on(table.kind),
    index("idx_sources_enabled_synced").on(table.enabled, table.lastSyncedAt),
  ]
);
