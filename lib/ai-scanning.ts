export const SCANNING_SUSPENDED_MESSAGE = "Automated detection is paused while Stripe Pros procures imagery licensed for machine analysis. Manual lot takeoff remains available.";

export function getAiScanningStatus() {
  const aiScanningFlag = process.env.AI_SCANNING_ENABLED?.trim().toLowerCase() ?? null;
  const scanningSuspended = process.env.AI_SCANNING_SUSPENDED?.trim().toLowerCase() === "true";
  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const enabled = isAiScanningEnabled();
  let reason = "disabled";
  if (enabled) reason = "ready";
  else if (scanningSuspended) reason = "suspended";
  else if (!hasOpenAiKey) reason = "missing_openai_key";
  else if (aiScanningFlag === "false") reason = "flag_disabled_without_key";
  return { enabled, reason, hasOpenAiKey, aiScanningFlag, scanningSuspended };
}

export function isAiScanningEnabled() {
  if (process.env.AI_SCANNING_SUSPENDED?.trim().toLowerCase() === "true") return false;
  const flag = process.env.AI_SCANNING_ENABLED?.trim().toLowerCase();
  if (flag === "true") return true;
  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (hasKey) return true;
  return false;
}
