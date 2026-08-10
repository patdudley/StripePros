import { json } from "@/lib/api";
import { recordScanCorrection, type ScanCorrectionAction } from "@/lib/scan-corrections/store";

const ACTIONS = new Set<ScanCorrectionAction>(["geometry_edited", "type_changed", "status_changed", "deleted", "manual_added"]);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid correction payload." }, 400);
  }
  const scanId = typeof body.scanId === "string" ? body.scanId.slice(0, 100) : "";
  const address = typeof body.address === "string" ? body.address.slice(0, 300) : "";
  const modelDetectionId = typeof body.modelDetectionId === "string" ? body.modelDetectionId.slice(0, 180) : "";
  const action = body.action as ScanCorrectionAction;
  if (!scanId || !address || !modelDetectionId || !ACTIONS.has(action)) return json({ error: "Correction metadata is incomplete." }, 400);
  const beforeJson = JSON.stringify(body.before ?? null).slice(0, 20_000);
  const afterJson = JSON.stringify(body.after ?? null).slice(0, 20_000);
  await recordScanCorrection({ scanId, address, modelDetectionId, action, beforeJson, afterJson });
  return json({ saved: true });
}
