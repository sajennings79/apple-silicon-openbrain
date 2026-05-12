import { db } from "../db/client.js";
import { sources } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { syncRssSource } from "./rss.js";
import { syncMailSource } from "./mail.js";
import { scrapeUrl } from "./scrape.js";
import { ingestUrl } from "./ingest.js";

export interface SyncReport {
  sourceId: string;
  kind: string;
  ok: boolean;
  ingested: number;
  duplicates: number;
  error?: string;
  elapsedMs: number;
}

type SourceRow = typeof sources.$inferSelect;

async function dispatch(source: SourceRow): Promise<{ ingested: number; duplicates: number }> {
  switch (source.kind) {
    case "rss":
      return syncRssSource(source);
    case "webpage":
      return syncWebpageSource(source);
    case "mail":
      return syncMailSource(source);
    default:
      throw new Error(`unknown source kind: ${source.kind}`);
  }
}

interface WebpageConfig {
  url?: string;
}

// Extract article links from a scraped landing page.
// Looks for markdown link patterns: [text](url) where the URL is on the same
// origin or is a full https URL, excluding nav/utility links.
const SKIP_WEBPAGE_PATTERNS = [
  /\/(tag|category|author|page|feed|rss|sitemap|search|login|signup|about|contact|privacy|terms)\b/i,
  /\?p=\d/,
  /#/,
  /\.(png|jpg|jpeg|gif|svg|pdf|zip)(\?|$)/i,
];

async function syncWebpageSource(source: SourceRow): Promise<{ ingested: number; duplicates: number }> {
  const cfg = (source.config ?? {}) as WebpageConfig;
  const pageUrl = cfg.url;
  if (!pageUrl) throw new Error(`webpage source ${source.id} missing config.url`);

  const origin = new URL(pageUrl).origin;
  const scraped = await scrapeUrl(pageUrl);

  // Extract all markdown links: [text](url)
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const seen = new Set<string>();
  const links: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(scraped.markdown)) !== null) {
    const href = m[2];
    // Only follow links on the same origin (article URLs, not external)
    try {
      const u = new URL(href);
      if (u.origin !== origin) continue;
    } catch { continue; }
    if (seen.has(href)) continue;
    if (SKIP_WEBPAGE_PATTERNS.some((p) => p.test(href))) continue;
    seen.add(href);
    links.push(href);
  }

  let ingested = 0;
  let duplicates = 0;
  for (const link of links) {
    try {
      const result = await ingestUrl(link);
      if (result.status === "created") ingested++;
      else duplicates++;
    } catch (err) {
      console.warn(`[webpage] failed to ingest ${link}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { ingested, duplicates };
}

export async function syncSource(sourceId: string): Promise<SyncReport> {
  const startedAt = Date.now();
  const [source] = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1);
  if (!source) throw new Error(`source not found: ${sourceId}`);

  try {
    const { ingested, duplicates } = await dispatch(source);
    await db
      .update(sources)
      .set({ lastSyncedAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(sources.id, sourceId));
    return {
      sourceId,
      kind: source.kind,
      ok: true,
      ingested,
      duplicates,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(sources)
      .set({ lastError: message, updatedAt: new Date() })
      .where(eq(sources.id, sourceId));
    return {
      sourceId,
      kind: source.kind,
      ok: false,
      ingested: 0,
      duplicates: 0,
      error: message,
      elapsedMs: Date.now() - startedAt,
    };
  }
}

export async function syncDueSources(): Promise<SyncReport[]> {
  // A source is due when it's enabled AND (last_synced_at IS NULL OR last_synced_at + interval < now)
  const due = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(
        eq(sources.enabled, true),
        sql`(${sources.lastSyncedAt} IS NULL OR ${sources.lastSyncedAt} + (${sources.intervalSeconds} * interval '1 second') < NOW())`,
      ),
    );

  const reports: SyncReport[] = [];
  for (const { id } of due) {
    reports.push(await syncSource(id));
  }
  return reports;
}
