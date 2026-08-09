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
  googleEventId: string | null;
  googleCalendarId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledJobInput = Omit<ScheduledJob, "id" | "ownerId" | "googleEventId" | "googleCalendarId" | "createdAt" | "updatedAt">;
type Row = Record<string, string | number | null>;

let schemaReady: Promise<void> | null = null;

export async function scheduleDb(): Promise<D1Database> {
  if (!env.DB) throw new Error("Schedule storage is unavailable.");
  schemaReady ||= (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, address TEXT NOT NULL,
      lat REAL NOT NULL, lng REAL NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
      crew TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'scheduled', notes TEXT NOT NULL DEFAULT '',
      google_event_id TEXT, google_calendar_id TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`).run();
    const columns = await env.DB.prepare("PRAGMA table_info(scheduled_jobs)").all<{ name: string }>();
    const names = new Set(columns.results.map((column) => column.name));
    if (!names.has("google_event_id")) await env.DB.prepare("ALTER TABLE scheduled_jobs ADD COLUMN google_event_id TEXT").run();
    if (!names.has("google_calendar_id")) await env.DB.prepare("ALTER TABLE scheduled_jobs ADD COLUMN google_calendar_id TEXT").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS scheduled_jobs_owner_dates_idx ON scheduled_jobs(owner_id, start_date, end_date)").run();
    await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS scheduled_jobs_google_event_idx ON scheduled_jobs(owner_id, google_event_id) WHERE google_event_id IS NOT NULL").run();
  })();
  await schemaReady;
  return env.DB;
}

function mapJob(row: Row): ScheduledJob {
  return {
    id: String(row.id), ownerId: String(row.owner_id), title: String(row.title), address: String(row.address),
    lat: Number(row.lat), lng: Number(row.lng), startDate: String(row.start_date), endDate: String(row.end_date),
    crew: String(row.crew || ""), status: row.status as ScheduledJobStatus, notes: String(row.notes || ""),
    googleEventId: row.google_event_id ? String(row.google_event_id) : null,
    googleCalendarId: row.google_calendar_id ? String(row.google_calendar_id) : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export async function listScheduledJobs(ownerId: string, from: string, to: string) {
  const database = await scheduleDb();
  const result = await database.prepare(`SELECT * FROM scheduled_jobs
    WHERE owner_id = ? AND end_date >= ? AND start_date <= ?
    ORDER BY start_date, title`).bind(ownerId, from, to).all<Row>();
  return result.results.map(mapJob);
}

export async function createScheduledJob(ownerId: string, input: ScheduledJobInput) {
  const database = await scheduleDb();
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
  const database = await scheduleDb();
  const row = await database.prepare("SELECT * FROM scheduled_jobs WHERE id = ? AND owner_id = ? LIMIT 1").bind(id, ownerId).first<Row>();
  return row ? mapJob(row) : null;
}

export async function updateScheduledJob(ownerId: string, id: string, input: ScheduledJobInput) {
  const database = await scheduleDb();
  await database.prepare(`UPDATE scheduled_jobs SET title = ?, address = ?, lat = ?, lng = ?,
    start_date = ?, end_date = ?, crew = ?, status = ?, notes = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?`).bind(
      input.title, input.address, input.lat, input.lng, input.startDate, input.endDate,
      input.crew, input.status, input.notes, new Date().toISOString(), id, ownerId,
    ).run();
  return getScheduledJob(ownerId, id);
}

export async function deleteScheduledJob(ownerId: string, id: string) {
  const database = await scheduleDb();
  const result = await database.prepare("DELETE FROM scheduled_jobs WHERE id = ? AND owner_id = ?").bind(id, ownerId).run();
  return result.meta.changes > 0;
}

export async function linkScheduledJobToGoogle(ownerId: string, id: string, eventId: string, calendarId = "primary") {
  const database = await scheduleDb();
  await database.prepare(`UPDATE scheduled_jobs SET google_event_id = ?, google_calendar_id = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?`).bind(eventId, calendarId, new Date().toISOString(), id, ownerId).run();
  return getScheduledJob(ownerId, id);
}

export async function updateScheduledJobFromGoogle(
  ownerId: string,
  id: string,
  patch: Pick<ScheduledJob, "title" | "address" | "startDate" | "endDate">,
) {
  const database = await scheduleDb();
  await database.prepare(`UPDATE scheduled_jobs SET title = ?, address = ?, start_date = ?, end_date = ?, updated_at = ?
    WHERE id = ? AND owner_id = ?`).bind(
      patch.title, patch.address, patch.startDate, patch.endDate, new Date().toISOString(), id, ownerId,
    ).run();
  return getScheduledJob(ownerId, id);
}
