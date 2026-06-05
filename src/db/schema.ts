import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex, real, integer, boolean, check } from "drizzle-orm/pg-core";
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

    // --- Governance / trust ladder (OB1 agent-memory model, adapted) ---
    // Provenance status is the "trust ladder": how this memory came to exist.
    // observed | inferred | user_confirmed | imported | generated | superseded | disputed
    provenanceStatus: text("provenance_status"),
    // Who wrote it: user | agent | system | import
    createdBy: text("created_by"),
    // 0..1 model/extraction confidence for agent-written memories.
    confidence: real("confidence"),
    // Review lifecycle: pending | confirmed | evidence_only | restricted | rejected | stale | merged
    reviewStatus: text("review_status"),
    // Use policy. Core rule: agent-written memory is *evidence*, not *instruction*.
    // can_use_as_instruction may only be true for user_confirmed/imported memory
    // (enforced by the chk_memories_instruction_grade CHECK below).
    canUseAsInstruction: boolean("can_use_as_instruction").notNull().default(false),
    canUseAsEvidence: boolean("can_use_as_evidence").notNull().default(true),
    requiresUserConfirmation: boolean("requires_user_confirmation").notNull().default(true),
    // Soft (advisory) content-dedup key: sha256 of normalized content. NOT unique
    // — the live corpus already contains legitimately-duplicated content, so this
    // is an advisory lookup key used by storeMemory, not a hard DB constraint.
    contentFingerprint: text("content_fingerprint"),
    // Correction chains: this memory supersedes an older one.
    supersedes: uuid("supersedes"),
    // Forward-compat scope columns (single-user today; no enforcement). Designed
    // in now so multi-agent/workspace scoping doesn't require a later repaint.
    workspaceId: text("workspace_id"),
    projectId: text("project_id"),
    visibility: text("visibility"),
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
    // Advisory (non-unique) fingerprint lookup for content dedup.
    index("idx_memories_content_fingerprint")
      .on(table.contentFingerprint)
      .where(sql`${table.contentFingerprint} IS NOT NULL AND ${table.deletedAt} IS NULL`),
    index("idx_memories_review_status")
      .on(table.reviewStatus)
      .where(sql`${table.reviewStatus} IS NOT NULL`),
    index("idx_memories_supersedes")
      .on(table.supersedes)
      .where(sql`${table.supersedes} IS NOT NULL`),
    // Trust rule: instruction-grade memory must be human-confirmed or trusted-imported.
    // NULL-safe: `provenance_status IN (...)` is NULL when provenance_status is NULL,
    // and Postgres treats a NULL CHECK predicate as satisfied — COALESCE(...,false)
    // closes that bypass so can_use_as_instruction=true can't pass with NULL provenance.
    check(
      "chk_memories_instruction_grade",
      sql`${table.canUseAsInstruction} IS NOT TRUE OR COALESCE(${table.provenanceStatus} IN ('user_confirmed', 'imported'), false)`
    ),
  ]
);

// Append-only audit log of memory mutations. `memoryId` is deliberately NOT a
// foreign key so audit rows survive hard deletion of the underlying memory.
export const memoryAudit = pgTable(
  "memory_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memoryId: uuid("memory_id").notNull(),
    action: text("action").notNull(), // capture | update | review | delete | supersede
    source: text("source"), // origin of the write (claude-code, web, mail, ...)
    actor: text("actor"), // created_by/actor label at the time of the action
    diff: jsonb("diff").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_memory_audit_memory").on(table.memoryId),
    index("idx_memory_audit_created").on(table.createdAt.desc()),
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
