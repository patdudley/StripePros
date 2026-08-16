export const SCANNING_SUSPENDED_MESSAGE = "Automated detection is paused while Stripe Pros procures imagery licensed for machine analysis. Manual lot takeoff remains available.";

export function isAiScanningEnabled() {
  const flag = process.env.AI_SCANNING_ENABLED?.trim().toLowerCase();
  if (flag === "false") return false;
  if (flag === "true") return true;
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
