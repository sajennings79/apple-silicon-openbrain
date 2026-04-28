import { config } from "../lib/config.js";

const FIRECRAWL_API = "https://api.firecrawl.dev/v1";

export interface ScrapeResult {
  title: string;
  markdown: string;
  url: string;
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
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
  };
}
