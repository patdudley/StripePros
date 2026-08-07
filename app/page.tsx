import type { Metadata } from "next";
import { StripeProsApp } from "./stripe-pros-app";

export const metadata: Metadata = {
  title: "Stripe Pros — Faster parking lot quotes",
  description: "A measurement-assisted quoting workspace for parking lot striping contractors.",
};

export default function Home() {
  return <StripeProsApp />;
}
