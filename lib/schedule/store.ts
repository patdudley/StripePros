import { env } from "cloudflare:workers";

export type ScheduledJobStatus = "scheduled" | "in_progress" | "completed";

export type ScheduledJob = {
  id: string;
  ownerId: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  startDate: string;
  endDate: string;
  crew: string;
  status: ScheduledJobStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledJobInput = Omit<ScheduledJob, "id" | "ownerId" | "createdAt" | "updatedAt">;
type Row = Record<string, string | number | null>;

let schemaReady: Promise<void> | null = null;

async function db(): Promise<D1Database> {
  if (!env.DB) throw new Error("Schedule storage is unavailable.");
  schemaReady ||= (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, address TEXT NOT NULL,
      lat REAL NOT NULL, lng REAL NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      crew TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'scheduled', notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS scheduled_jobs_owner_dates_idx ON scheduled_jobs(owner_id, start_date, end_date)").run();
  })();
  await schemaReady;
  return env.DB;
}

function mapJob(row: Row): ScheduledJob {
  return {
    id: String(row.id), ownerId: String(row.owner_id), title: String(row.title), address: String(row.address),
    lat: Number(row.lat), lng: Number(row.lng), startDate: String(row.start_date), endDate: String(row.end_date),
    crew: String(row.crew || ""), status: row.status as ScheduledJobStatus, notes: String(row.notes || ""),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export async function listScheduledJobs(ownerId: string, from: string, to: string) {
  const database = await db();
  const result = await database.prepare(`SELECT * FROM scheduled_jobs
    WHERE owner_id = ? AND end_date >= ? AND start_date <= ?
    ORDER BY start_date, title`).bind(ownerId, from, to).all<Row>();
  return result.results.map(mapJob);
}

export async function createScheduledJob(ownerId: string, input: ScheduledJobInput) {
  const database = await db();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO scheduled_jobs
    (id, owner_id, title, address, lat, lng, start_date, end_date, crew, status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id, ownerId, input.title, input.address, input.lat, input.lng, input.startDate, input.endDate,
      input.crew, input.status, input.notes, now, now,
    ).run();
  return getScheduledJob(ownerId, id);
}

export async function getScheduledJob(ownerId: string, id: string) {
  const database = await db();
  const row = await database.prepare("SELECT * FROM scheduled_jobs WHERE id = ? AND owner_id = ? LIMIT 1").bind(id, ownerId).first<Row>();
  return row ? mapJob(row) : null;
}

export async function updateScheduledJob(ownerId: string, id: string, input: ScheduledJobInput) {
  const database = await db();
  await database.prepare(`UPDATE scheduled_jobs SET title = ?, address = ?, lat = ?, lng = ?,
    start_date = ?, end_date = ?, crew = ?, status = ?, notes = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?`).bind(
      input.title, input.address, input.lat, input.lng, input.startDate, input.endDate,
      input.crew, input.status, input.notes, new Date().toISOString(), id, ownerId,
    ).run();
  return getScheduledJob(ownerId, id);
}

export async function deleteScheduledJob(ownerId: string, id: string) {
  const database = await db();
  const result = await database.prepare("DELETE FROM scheduled_jobs WHERE id = ? AND owner_id = ?").bind(id, ownerId).run();
  return result.meta.changes > 0;
}
