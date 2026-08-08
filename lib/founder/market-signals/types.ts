export type MarketSignal = {
  platform: string;
  title: string;
  text: string;
  author: string | null;
  url: string;
  publishedAt: string | null;
  source: string;
  rawSnippet: string;
  query: string;
};

export type ScoredMarketSignal = MarketSignal & {
  score: number;
  rationale: string;
  suggestedResponse: string;
};

export interface MarketSignalProvider {
  readonly id: string;
  search(query: string): Promise<MarketSignal[]>;
}
