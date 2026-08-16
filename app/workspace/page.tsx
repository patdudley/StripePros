import type { Metadata } from "next";
import { QuoteWorkspace } from "./quote-workspace";
import { isAiScanningEnabled } from "@/lib/ai-scanning";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quote Workspace — Stripe Pros",
  description: "Measure a parking lot and build a striping proposal from one workspace.",
};

export default function WorkspacePage() {
  return <QuoteWorkspace aiScanningEnabled={isAiScanningEnabled()} />;
}
