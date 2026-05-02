import { config } from "../lib/config.js";

const FIRECRAWL_API = "https://api.firecrawl.dev/v1";

export interface ScrapeResult {
  title: string;
  markdown: string;
  url: string;
  source: "obscura" | "firecrawl";
}

async function scrapeWithObscura(url: string): Promise<ScrapeResult> {
  const obscuraPath = config.obscuraPath;

  // Get text content and title in parallel
  const [textProc, titleProc] = await Promise.all([
    Bun.spawn([obscuraPath, "fetch", url, "--dump", "text", "--quiet", "--stealth"], {
      stdout: "pipe",
      stderr: "pipe",
    }),
    Bun.spawn([obscuraPath, "fetch", url, "--eval", "document.title", "--quiet", "--stealth"], {
      stdout: "pipe",
      stderr: "pipe",
    }),
  ]);

  const [textResult, titleResult] = await Promise.all([
    textProc.exited,
    titleProc.exited,
  ]);

  if (textResult !== 0) {
    const stderr = await new Response(textProc.stderr).text();
    throw new Error(`Obscura exited with code ${textResult}: ${stderr.slice(0, 200)}`);
  }

  const text = await new Response(textProc.stdout).text();
  const title = titleResult === 0
    ? (await new Response(titleProc.stdout).text()).trim()
    : url;

  if (!text.trim()) {
    throw new Error("Obscura returned empty content");
  }

  return {
    title: title || url,
    markdown: text.trim(),
    url,
    source: "obscura",
  };
}

async function scrapeWithFirecrawl(url: string): Promise<ScrapeResult> {
  if (!config.firecrawlApiKey) {
    throw new Error("FIRECRAWL_API_KEY is not set");
  }

  const res = await fetch(`${FIRECRAWL_API}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.firecrawlApiKey}`,
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Firecrawl HTTP ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    success: boolean;
    data?: {
      markdown?: string;
      metadata?: { title?: string; sourceURL?: string };
    };
    error?: string;
  };

  if (!data.success) {
    throw new Error(`Firecrawl scrape failed: ${data.error ?? "unknown error"}`);
  }

  return {
    title: data.data?.metadata?.title ?? url,
    markdown: data.data?.markdown ?? "",
    url: data.data?.metadata?.sourceURL ?? url,
    source: "firecrawl",
  };
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  // Try Obscura first (local, free, fast)
  try {
    const result = await scrapeWithObscura(url);
    console.log(`[scrape] Obscura succeeded for ${url} (${result.markdown.length} chars)`);
    return result;
  } catch (err) {
    console.log(`[scrape] Obscura failed for ${url}, falling back to Firecrawl: ${err instanceof Error ? err.message : err}`);
  }

  // Fall back to Firecrawl (cloud, paid, reliable)
  const result = await scrapeWithFirecrawl(url);
  console.log(`[scrape] Firecrawl fallback succeeded for ${url} (${result.markdown.length} chars)`);
  return result;
}
