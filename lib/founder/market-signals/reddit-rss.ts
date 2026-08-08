import { XMLParser } from "fast-xml-parser";
import type { MarketSignal, MarketSignalProvider } from "./types";

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanHtml(value: unknown): string {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&(?:nbsp|amp|quot|#39);/g, " ").replace(/\s+/g, " ").trim();
}

export class RedditRssProvider implements MarketSignalProvider {
  readonly id = "reddit-public-rss";

  async search(query: string): Promise<MarketSignal[]> {
    const endpoint = new URL("https://www.reddit.com/search.rss");
    endpoint.searchParams.set("q", query);
    endpoint.searchParams.set("sort", "new");
    endpoint.searchParams.set("t", "month");
    const response = await fetch(endpoint, { headers: { Accept: "application/atom+xml", "User-Agent": "StripePros-FounderHQ/1.0" } });
    if (!response.ok) return [];
    const xml = await response.text();
    const feed = new XMLParser({ ignoreAttributes: false }).parse(xml) as { feed?: { entry?: unknown | unknown[] } };
    return asArray(feed.feed?.entry as Record<string, unknown> | Array<Record<string, unknown>> | undefined).slice(0, 20).map((entry) => {
      const links = asArray(entry.link as Record<string, unknown> | Array<Record<string, unknown>> | undefined);
      const url = String(links.find((link) => link["@_rel"] === "alternate")?.["@_href"] ?? links[0]?.["@_href"] ?? "");
      const content = cleanHtml((entry.content as Record<string, unknown> | undefined)?.["#text"] ?? entry.content);
      return {
        platform: "Reddit",
        title: cleanHtml(entry.title),
        text: content,
        author: cleanHtml((entry.author as Record<string, unknown> | undefined)?.name) || null,
        url,
        publishedAt: String(entry.updated ?? entry.published ?? "") || null,
        source: "Reddit public search RSS",
        rawSnippet: content.slice(0, 800),
        query,
      } satisfies MarketSignal;
    }).filter((item) => item.url);
  }
}
