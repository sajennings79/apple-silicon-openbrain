import { db } from "../db/client.js";
import { memories } from "../db/schema.js";
import { eq, and, or, isNull, isNotNull } from "drizzle-orm";
import { scrapeUrl } from "./scrape.js";
import { isYouTubeUrl, fetchYouTubeTranscript } from "./youtube.js";
import { storeMemory } from "../tools/StoreMemory.js";

export interface IngestResult {
  status: "created" | "duplicate";
  id: string;
  title: string;
}

// Trusted sync-path context: attribution to the `sources` row that triggered
// this ingest, and its opt-in retention expiry. Bookmarklet/API callers omit
// both (no attribution, never expires).
export interface IngestOptions {
  originSourceId?: string;
  expiresAt?: Date;
}

export async function ingestUrl(targetUrl: string, opts: IngestOptions = {}): Promise<IngestResult> {
  // A URL maps deterministically to one source, so dedup on (source, source_id)
  // to match the partial unique index and avoid re-scraping known URLs.
  const source = isYouTubeUrl(targetUrl) ? "youtube" : "web";

  const existing = await db
    .select({ id: memories.id, summary: memories.summary })
    .from(memories)
    .where(
      and(
        eq(memories.source, source),
        eq(memories.sourceId, targetUrl),
        // Live rows dedup as before. Soft-deleted rows with an expiry are
        // retention tombstones and ALSO count as duplicates — otherwise a
        // webpage source re-listing an old link would resurrect expired
        // content. User deletes (no expiry) stay re-ingestable.
        or(isNull(memories.deletedAt), isNotNull(memories.expiresAt)),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { status: "duplicate", id: existing[0].id, title: existing[0].summary ?? targetUrl };
  }

  if (source === "youtube") {
    const yt = await fetchYouTubeTranscript(targetUrl);
    const result = await storeMemory(
      {
        content: yt.transcript,
        source: "youtube",
        sourceId: targetUrl,
        memoryType: "fact",
      },
      { createdBy: "import", originSourceId: opts.originSourceId, expiresAt: opts.expiresAt },
    );
    return { status: "created", id: result.id, title: yt.title };
  }

  const scraped = await scrapeUrl(targetUrl);
  const result = await storeMemory(
    {
      content: scraped.markdown,
      source: "web",
      sourceId: targetUrl,
      memoryType: "fact",
    },
    { createdBy: "import", originSourceId: opts.originSourceId, expiresAt: opts.expiresAt },
  );
  return { status: "created", id: result.id, title: scraped.title };
}
