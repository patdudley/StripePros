export const SCANNING_SUSPENDED_MESSAGE = "Automated detection is paused while Stripe Pros procures imagery licensed for machine analysis. Manual lot takeoff remains available.";

export function isAiScanningEnabled() {
  return process.env.AI_SCANNING_ENABLED?.trim().toLowerCase() === "true";
}
