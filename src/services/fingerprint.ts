import { createHash } from "node:crypto";

/**
 * Normalize content for advisory deduplication: lowercase, collapse all
 * whitespace runs to a single space, and trim. Must stay in lockstep with the
 * SQL backfill in drizzle/0006_governance.sql so JS-fingerprinted new rows
 * match SQL-fingerprinted historical rows.
 */
export function normalizeForFingerprint(content: string): string {
  return content.toLowerCase().replace(/\s+/g, " ").trim();
}

/** sha256 hex of the normalized content. */
export function contentFingerprint(content: string): string {
  return createHash("sha256").update(normalizeForFingerprint(content), "utf8").digest("hex");
}
