import { env } from "cloudflare:workers";
import type { LotLabelCounts, LotLabelInput, StoredLotLabel } from "./record";

let schemaReady: Promise<void> | null = null;

async function labelDb(): Promise<D1Database> {
  if (!env.DB) throw new Error("Training label storage is unavailable.");
  schemaReady ||= (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS lot_labels (
      record_id TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      boundary_json TEXT NOT NULL,
      counts_json TEXT NOT NULL,
      blind INTEGER NOT NULL,
      whole_lot_scope INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS lot_labels_created_idx ON lot_labels(created_at DESC)").run();
  })();
  await schemaReady;
  return env.DB;
}

export async function saveLotLabel(input: LotLabelInput): Promise<StoredLotLabel> {
  const database = await labelDb();
  const createdAt = new Date().toISOString();
  await database.prepare(`INSERT INTO lot_labels
    (record_id, address, lat, lng, boundary_json, counts_json, blind, whole_lot_scope, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(record_id) DO UPDATE SET
      address=excluded.address, lat=excluded.lat, lng=excluded.lng,
      boundary_json=excluded.boundary_json, counts_json=excluded.counts_json,
      blind=excluded.blind, whole_lot_scope=excluded.whole_lot_scope,
      notes=excluded.notes, created_at=excluded.created_at`)
    .bind(
      input.recordId,
      input.address,
      input.lat,
      input.lng,
      JSON.stringify(input.boundary),
      JSON.stringify(input.counts),
      input.blind ? 1 : 0,
      input.wholeLotScope ? 1 : 0,
      input.notes,
      createdAt,
    )
    .run();
  return { ...input, createdAt };
}

export async function listLotLabels(): Promise<StoredLotLabel[]> {
  const database = await labelDb();
  const result = await database.prepare("SELECT * FROM lot_labels ORDER BY created_at ASC").all<Record<string, string | number>>();
  return result.results.map((row) => ({
    recordId: String(row.record_id),
    address: String(row.address),
    lat: Number(row.lat),
    lng: Number(row.lng),
    boundary: JSON.parse(String(row.boundary_json)),
    counts: JSON.parse(String(row.counts_json)) as LotLabelCounts,
    blind: Number(row.blind) === 1,
    wholeLotScope: Number(row.whole_lot_scope) === 1,
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at),
  }));
}
