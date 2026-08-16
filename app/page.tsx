import type { Metadata } from "next";
import { StripeProsApp } from "./stripe-pros-app";
import { isAiScanningEnabled } from "@/lib/ai-scanning";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stripe Pros — Faster parking lot quotes",
  description: "A measurement-assisted quoting workspace for parking lot striping contractors.",
};

export default function Home() {
  return <StripeProsApp aiScanningEnabled={isAiScanningEnabled()} />;
}
