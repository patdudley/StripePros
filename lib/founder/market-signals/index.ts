import { RedditRssProvider } from "./reddit-rss";
import { rankMarketSignals } from "./scoring";
import type { MarketSignalProvider, ScoredMarketSignal } from "./types";

export const MARKET_QUERIES = [
  '"parking lot striping" OR "line striping" estimating',
  '"pavement marking" CRM OR quoting OR scheduling',
  'QuoteIQ OR Jobber OR LotQuote striping',
  'contractor CRM quoting invoicing scheduling pain',
];

export async function searchMarketSignals(providers: MarketSignalProvider[] = [new RedditRssProvider()]): Promise<ScoredMarketSignal[]> {
  const batches = await Promise.all(providers.flatMap((provider) => MARKET_QUERIES.map((query) => provider.search(query).catch(() => []))));
  return rankMarketSignals(batches.flat(), 5);
}

export type { MarketSignal, MarketSignalProvider, ScoredMarketSignal } from "./types";
