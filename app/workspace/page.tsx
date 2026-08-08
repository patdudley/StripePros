import type { Metadata } from "next";
import { QuoteWorkspace } from "./quote-workspace";

export const metadata: Metadata = {
  title: "Quote Workspace — Stripe Pros",
  description: "Measure a parking lot and build a striping proposal from one workspace.",
};

export default function WorkspacePage() {
  return <QuoteWorkspace nearMapEnabled={Boolean(process.env.NEARMAP_API_KEY?.trim())} />;
}
