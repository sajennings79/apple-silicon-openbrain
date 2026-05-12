import { db } from "../db/client.js";
import { memories } from "../db/schema.js";
import { eq, and, isNull } from "drizzle-orm";
import { scrapeUrl } from "./scrape.js";
import { isYouTubeUrl, fetchYouTubeTranscript } from "./youtube.js";
import { storeMemory } from "../tools/StoreMemory.js";

export interface IngestResult {
  status: "created" | "duplicate";
  id: string;
  title: string;
}

export async function ingestUrl(targetUrl: string): Promise<IngestResult> {
  const existing = await db
    .select({ id: memories.id, summary: memories.summary })
    .from(memories)
    .where(and(eq(memories.sourceId, targetUrl), isNull(memories.deletedAt)))
    .limit(1);

  if (existing.length > 0) {
    return { status: "duplicate", id: existing[0].id, title: existing[0].summary ?? targetUrl };
  }

  if (isYouTubeUrl(targetUrl)) {
    const yt = await fetchYouTubeTranscript(targetUrl);
    const result = await storeMemory({
      content: yt.transcript,
      source: "youtube",
      sourceId: targetUrl,
      memoryType: "fact",
    });
    return { status: "created", id: result.id, title: yt.title };
  }

  const scraped = await scrapeUrl(targetUrl);
  const result = await storeMemory({
    content: scraped.markdown,
    source: "web",
    sourceId: targetUrl,
    memoryType: "fact",
  });
  return { status: "created", id: result.id, title: scraped.title };
}
