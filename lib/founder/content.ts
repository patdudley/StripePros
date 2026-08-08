import type { GitHubActivity } from "./github";

export type DraftCategory = "Build/Product" | "GTM/Learning" | "Founder/Industry Insight";
export type GeneratedDraft = { category: DraftCategory; body: string };
export type FounderMetrics = {
  dials: number;
  ownerConversations: number;
  demosBooked: number;
  demosHeld: number;
  trials: number;
  customers: number;
  mrr: number;
};

function compact(text: string, fallback: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 180);
}

export function generateFounderDrafts(input: {
  commits: GitHubActivity[];
  note: string;
  metrics: FounderMetrics;
  previousPosts: string[];
}): GeneratedDraft[] {
  const shipped = input.commits.slice(0, 3).map((commit) => commit.message.replace(/^(add|build|fix|update|create)\s+/i, "")).join(", ");
  const buildDetail = compact(shipped, "the first end-to-end parking lot quoting workflow");
  const founderNote = compact(input.note, "The product gets better every time I watch a contractor work through a real estimate.");
  const hadSimilarBuildPost = input.previousPosts.some((post) => post.toLowerCase().includes(buildDetail.toLowerCase().slice(0, 30)));
  const buildLead = hadSimilarBuildPost ? "A less obvious lesson from today’s build:" : "Shipped another piece of Stripe Pros today:";

  return [
    {
      category: "Build/Product",
      body: `${buildLead} ${buildDetail}. The goal is simple: turn a parking lot address into a defensible quote without burning half a day driving and counting lines by hand.`,
    },
    {
      category: "GTM/Learning",
      body: `Today’s Stripe Pros GTM scoreboard: ${input.metrics.dials} dials, ${input.metrics.ownerConversations} owner conversations, ${input.metrics.demosBooked} demos booked, ${input.metrics.demosHeld} held, ${input.metrics.trials} trials, ${input.metrics.customers} customers, $${input.metrics.mrr.toLocaleString("en-US", { maximumFractionDigits: 2 })} MRR. The useful part isn’t the vanity number—it’s hearing exactly where quoting breaks down in the field.`,
    },
    {
      category: "Founder/Industry Insight",
      body: `${founderNote} Striping software should understand stalls, curb footage, ADA work, mobilization, and weather-sensitive crews. Contractors shouldn’t have to bend a generic CRM until it almost fits their business.`,
    },
  ];
}
