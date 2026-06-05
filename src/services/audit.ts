import { db } from "../db/client.js";
import { memoryAudit } from "../db/schema.js";

export type AuditAction = "capture" | "update" | "review" | "delete" | "supersede";

export interface AuditEntry {
  memoryId: string;
  action: AuditAction;
  source?: string | null;
  actor?: string | null;
  diff?: Record<string, unknown>;
}

/**
 * Append a row to the memory_audit log. Best-effort: audit must never break a
 * memory mutation, so callers fire-and-forget and failures are swallowed
 * (the table may also not exist yet on un-migrated databases).
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(memoryAudit).values({
      memoryId: entry.memoryId,
      action: entry.action,
      source: entry.source ?? null,
      actor: entry.actor ?? null,
      diff: entry.diff ?? {},
    });
  } catch {
    // Audit is advisory — never surface failures to the caller.
  }
}
