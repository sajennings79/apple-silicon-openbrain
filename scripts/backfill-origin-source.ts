#!/usr/bin/env bun
/**
 * One-time best-effort backfill of memories.origin_source_id.
 *
 *   bun run scripts/backfill-origin-source.ts            # dry-run (default)
 *   bun run scripts/backfill-origin-source.ts --apply    # write changes
 *
 * Attribution rules, in order of confidence:
 *  1. Mail: syncMailSource deterministically writes "Account: <account>" into
 *     the content header — match each mail source by its config.account.
 *  2. Web by domain: match source_id URL host against each rss/webpage
 *     source's configured feed/page URL host (lowercased, www-stripped).
 *     Ambiguous hosts (shared by 2+ sources) and youtube.com/youtu.be are
 *     dropped — YouTube channel feeds all resolve to youtube.com video URLs,
 *     so a video can't be safely attributed to a specific channel source.
 *  3. Everything else (obsidian, blogwatcher, firecrawl, manual, unmatched
 *     web) stays NULL by design.
 */
import { pg } from "../src/db/client.js";

const apply = process.argv.includes("--apply");

function hostOf(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

const UNATTRIBUTABLE_HOSTS = new Set(["youtube.com", "youtu.be"]);

async function main() {
  const sources = (await pg`
    SELECT id, kind, name, config FROM sources
  `) as { id: string; kind: string; name: string; config: Record<string, unknown> }[];

  console.log(`${apply ? "APPLY" : "DRY-RUN"} — ${sources.length} sources\n`);
  let totalAttributed = 0;

  // --- 1. Mail by Account: header -----------------------------------------
  for (const s of sources.filter((s) => s.kind === "mail")) {
    const account = s.config.account as string | undefined;
    if (!account) {
      console.log(`mail   ${s.name}: no config.account, skipped`);
      continue;
    }
    const pattern = `%Account: ${account}%`;
    let count: number;
    if (apply) {
      const res = await pg`
        UPDATE memories SET origin_source_id = ${s.id}
        WHERE source = 'mail' AND origin_source_id IS NULL
          AND deleted_at IS NULL AND content LIKE ${pattern}
      `;
      count = res.count;
    } else {
      const [r] = (await pg`
        SELECT count(*)::int AS c FROM memories
        WHERE source = 'mail' AND origin_source_id IS NULL
          AND deleted_at IS NULL AND content LIKE ${pattern}
      `) as any[];
      count = r.c;
    }
    totalAttributed += count;
    console.log(`mail   ${s.name}: ${count} memories`);
  }

  // --- 2. Web by domain -----------------------------------------------------
  const hostMap = new Map<string, { id: string; name: string } | "ambiguous">();
  for (const s of sources.filter((s) => s.kind === "rss" || s.kind === "webpage")) {
    const host = hostOf((s.config.feedUrl ?? s.config.url) as string | undefined);
    if (!host) {
      console.log(`${s.kind.padEnd(6)} ${s.name}: no usable config URL, skipped`);
      continue;
    }
    if (UNATTRIBUTABLE_HOSTS.has(host)) {
      console.log(`${s.kind.padEnd(6)} ${s.name}: host ${host} unattributable, skipped`);
      continue;
    }
    hostMap.set(host, hostMap.has(host) ? "ambiguous" : { id: s.id, name: s.name });
  }
  for (const [host, v] of hostMap) {
    if (v === "ambiguous") {
      console.log(`web    host ${host}: shared by multiple sources, dropped`);
      hostMap.delete(host);
    }
  }

  const webRows = (await pg`
    SELECT id, source_id FROM memories
    WHERE source = 'web' AND origin_source_id IS NULL
      AND deleted_at IS NULL AND source_id IS NOT NULL
  `) as { id: string; source_id: string }[];

  const bySource = new Map<string, { name: string; ids: string[] }>();
  let unmatched = 0;
  for (const row of webRows) {
    const host = hostOf(row.source_id);
    const match = host ? (hostMap.get(host) as { id: string; name: string } | undefined) : undefined;
    if (!match) {
      unmatched++;
      continue;
    }
    const bucket = bySource.get(match.id) ?? { name: match.name, ids: [] };
    bucket.ids.push(row.id);
    bySource.set(match.id, bucket);
  }

  for (const [sourceId, { name, ids }] of bySource) {
    if (apply) {
      for (let i = 0; i < ids.length; i += 1000) {
        const chunk = ids.slice(i, i + 1000);
        await pg`UPDATE memories SET origin_source_id = ${sourceId} WHERE id = ANY(${chunk}::uuid[])`;
      }
    }
    totalAttributed += ids.length;
    console.log(`web    ${name}: ${ids.length} memories`);
  }

  console.log(`\nAttributed: ${totalAttributed}`);
  console.log(`Unmatched web rows (stay NULL): ${unmatched}`);
  const [nulls] = (await pg`
    SELECT count(*)::int AS c FROM memories
    WHERE origin_source_id IS NULL AND deleted_at IS NULL
  `) as any[];
  console.log(`Total live rows without attribution${apply ? "" : " (before apply)"}: ${nulls.c}`);
  if (!apply) console.log("\nDry-run only. Re-run with --apply to write.");

  await pg.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
