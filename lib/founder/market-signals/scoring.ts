import type { MarketSignal, ScoredMarketSignal } from "./types";

function matches(text: string, terms: RegExp): boolean {
  return terms.test(text.toLowerCase());
}

export function isEligibleMarketSignal(signal: MarketSignal): boolean {
  const text = `${signal.title} ${signal.text}`.toLowerCase();
  const directlyRelevant = matches(text, /striping|pavement marking|line marking|sealcoat|parking lot|asphalt/);
  const contractorContext = matches(text, /contractor|field service|trade business|service business|crew|jobsite/);
  const workflowContext = matches(text, /crm|quote|quoting|estimate|estimating|invoice|invoicing|schedule|scheduling|dispatch|jobber|quoteiq|lotquote|pavementsoft|bitumio/);
  const painOrIntent = matches(text, /pain|problem|hate|slow|manual|spreadsheet|frustrat|struggl|difficult|waste|mess|switch|alternative|recommend|looking for|what do you use|need .*software|pricing/);
  return directlyRelevant || (contractorContext && workflowContext && painOrIntent);
}

export function scoreMarketSignal(signal: MarketSignal, now = new Date()): ScoredMarketSignal {
  const text = `${signal.title} ${signal.text}`.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  if (matches(text, /striping|pavement marking|sealcoat|parking lot|asphalt/)) { score += 30; reasons.push("directly relevant to pavement contractors"); }
  else if (matches(text, /contractor|field service|estimating/)) { score += 15; reasons.push("adjacent contractor workflow"); }

  if (matches(text, /i own|my company|my business|our crew|our guys|contractor here|business owner|run a .*business/)) { score += 15; reasons.push("owner/operator language"); }
  if (matches(text, /crm|quote|quoting|estimate|estimating|invoice|invoicing|schedule|scheduling|crew|dispatch/) && matches(text, /pain|problem|hate|slow|manual|spreadsheet|frustrat|struggl|difficult|waste|mess/)) { score += 15; reasons.push("clear workflow pain"); }
  if (matches(text, /jobber|quoteiq|lotquote|pavementsoft|bitumio|service titan|housecall pro/) && matches(text, /switch|alternative|cancel|expensive|bad|hate|doesn.t work|missing|looking for/)) { score += 10; reasons.push("competitor dissatisfaction"); }
  if (matches(text, /recommend|looking for|what do you use|which software|need a crm|need software|ready to buy|trial|pricing/)) { score += 10; reasons.push("active solution search"); }

  const published = signal.publishedAt ? new Date(signal.publishedAt) : null;
  const ageDays = published && !Number.isNaN(published.getTime()) ? Math.max(0, (now.getTime() - published.getTime()) / 86_400_000) : 31;
  if (ageDays <= 3) { score += 10; reasons.push("posted in the last 3 days"); }
  else if (ageDays <= 7) { score += 8; reasons.push("posted this week"); }
  else if (ageDays <= 30) { score += 5; reasons.push("posted this month"); }

  const replyOpportunity = matches(text, /\?|anyone|recommend|how do|what do|struggl|frustrat|pain|looking for/);
  score += replyOpportunity ? 10 : 4;
  if (replyOpportunity) reasons.push("a useful reply could answer a real question");

  const suggestedResponse = matches(text, /recommend|looking for|what do you use|which software/)
    ? "The biggest thing I’d pressure-test is how fast it gets you from site measurements to a quote your customer can approve. Most generic CRMs handle contacts fine, but the striping-specific quantities are where the extra work sneaks back in. What part of your current process is taking the longest?"
    : "This is exactly the kind of operational friction that gets underestimated. The software isn’t helping if your crew still has to re-enter measurements, scope, and pricing in three places. Where does the handoff break most often for you—estimating, scheduling, or invoicing?";

  return { ...signal, score: Math.min(100, score), rationale: reasons.length ? reasons.join("; ") : "adjacent industry discussion with a possible learning opportunity", suggestedResponse };
}

export function rankMarketSignals(signals: MarketSignal[], limit = 5): ScoredMarketSignal[] {
  const unique = new Map<string, MarketSignal>();
  for (const signal of signals) if (!unique.has(signal.url)) unique.set(signal.url, signal);
  return Array.from(unique.values()).filter(isEligibleMarketSignal).map((signal) => scoreMarketSignal(signal)).sort((a, b) => b.score - a.score).slice(0, limit);
}
