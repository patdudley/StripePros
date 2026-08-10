import { env } from "cloudflare:workers";

export type ScanCorrectionAction = "geometry_edited" | "type_changed" | "status_changed" | "deleted" | "manual_added";

export type ScanCorrectionInput = {
  scanId: string;
  address: string;
  modelDetectionId: string;
  action: ScanCorrectionAction;
  beforeJson: string;
  afterJson: string;
};

let schemaReady: Promise<void> | null = null;

async function correctionDb(): Promise<D1Database> {
  if (!env.DB) throw new Error("Scan correction storage is unavailable.");
  schemaReady ||= (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scan_corrections (
      id TEXT PRIMARY KEY,
      scan_id TEXT NOT NULL,
      address TEXT NOT NULL,
      model_detection_id TEXT NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT NOT NULL,
      after_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      provenance_status TEXT NOT NULL DEFAULT 'tainted_unlicensed'
    )`).run();
    const columns = await env.DB.prepare("PRAGMA table_info(scan_corrections)").all<{ name: string }>();
    if (!columns.results.some((column) => column.name === "provenance_status")) {
      await env.DB.prepare("ALTER TABLE scan_corrections ADD COLUMN provenance_status TEXT NOT NULL DEFAULT 'tainted_unlicensed'").run();
    }
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS scan_corrections_address_idx ON scan_corrections(address, created_at DESC)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS scan_corrections_scan_idx ON scan_corrections(scan_id, created_at DESC)").run();
  })();
  await schemaReady;
  return env.DB;
}

export async function recordScanCorrection(input: ScanCorrectionInput) {
  const database = await correctionDb();
  await database.prepare(`INSERT INTO scan_corrections
    (id, scan_id, address, model_detection_id, action, before_json, after_json, created_at, provenance_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'tainted_unlicensed')`)
    .bind(crypto.randomUUID(), input.scanId, input.address, input.modelDetectionId, input.action, input.beforeJson, input.afterJson, new Date().toISOString())
    .run();
}

export async function recentCorrectionExamples(limit = 6) {
  const database = await correctionDb();
  const result = await database.prepare(`SELECT action, before_json, after_json
    FROM scan_corrections
    WHERE provenance_status = 'eligible'
    ORDER BY created_at DESC
    LIMIT ?`).bind(Math.max(1, Math.min(12, limit))).all<{ action: string; before_json: string; after_json: string }>();
  return result.results.map((row) => ({ action: row.action, before: JSON.parse(row.before_json), after: JSON.parse(row.after_json) }));
}
