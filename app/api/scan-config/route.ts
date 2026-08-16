import { json } from "@/lib/api";
import { getAiScanningStatus } from "@/lib/ai-scanning";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(getAiScanningStatus());
}
