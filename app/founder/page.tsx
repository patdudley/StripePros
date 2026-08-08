import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getFounder, requestFromHeaders } from "@/lib/founder/auth";
import { FounderHQ } from "./founder-hq";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Founder HQ",
  robots: { index: false, follow: false, nocache: true },
};

export default async function FounderPage() {
  let founder = null;
  try {
    founder = await getFounder(requestFromHeaders(await headers()));
  } catch {
    notFound();
  }
  if (!founder) notFound();
  return <FounderHQ founder={founder} />;
}
