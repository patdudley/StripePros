import { env } from "cloudflare:workers";

export type FounderDailyEntry = {
  id: string;
  ownerId: string;
  entryDate: string;
  note: string;
  dials: number;
  ownerConversations: number;
  demosBooked: number;
  demosHeld: number;
  trials: number;
  customers: number;
  mrr: number;
  createdAt: string;
  updatedAt: string;
};

export type FounderDraft = {
  id: string;
  ownerId: string;
  category: string;
  body: string;
  status: "draft" | "saved" | "posted";
  sourceDate: string;
  createdAt: string;
  updatedAt: string;
  postedAt: string | null;
};

export type FounderConversation = {
  id: string;
  ownerId: string;
  provider: string;
  platform: string;
  title: string;
  author: string | null;
  url: string;
  publishedAt: string | null;
  source: string;
  rawSnippet: string;
  query: string;
  score: number;
  rationale: string;
  suggestedResponse: string;
  status: "surfaced" | "saved" | "ignored" | "responded";
  createdAt: string;
  updatedAt: string;
};

type D1Row = Record<string, string | number | null>;

function rawDb(): D1Database {
  if (!env.DB) throw new Error("Founder HQ storage is unavailable.");
  return env.DB;
}

let schemaReady: Promise<void> | null = null;

async function db(): Promise<D1Database> {
  const database = rawDb();
  schemaReady ||= (async () => {
    const statements = [
      `CREATE TABLE IF NOT EXISTS founder_daily_entries (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, entry_date TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
        dials INTEGER NOT NULL DEFAULT 0, owner_conversations INTEGER NOT NULL DEFAULT 0,
        demos_booked INTEGER NOT NULL DEFAULT 0, demos_held INTEGER NOT NULL DEFAULT 0,
        trials INTEGER NOT NULL DEFAULT 0, customers INTEGER NOT NULL DEFAULT 0, mrr REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(owner_id, entry_date)
      )`,
      `CREATE TABLE IF NOT EXISTS founder_content_drafts (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, category TEXT NOT NULL, body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft', source_date TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, posted_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS founder_conversations (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, provider TEXT NOT NULL, platform TEXT NOT NULL,
        title TEXT NOT NULL, author TEXT, url TEXT NOT NULL, published_at TEXT, source TEXT NOT NULL,
        raw_snippet TEXT NOT NULL, query TEXT NOT NULL, score INTEGER NOT NULL, rationale TEXT NOT NULL,
        suggested_response TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'surfaced', created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, UNIQUE(owner_id, url)
      )`,
      "CREATE INDEX IF NOT EXISTS founder_drafts_owner_created_idx ON founder_content_drafts(owner_id, created_at)",
      "CREATE INDEX IF NOT EXISTS founder_conversations_owner_score_idx ON founder_conversations(owner_id, score)",
    ];
    for (const statement of statements) await database.prepare(statement).run();
  })();
  await schemaReady;
  return database;
}

function mapDaily(row: D1Row): FounderDailyEntry {
  return {
    id: String(row.id), ownerId: String(row.owner_id), entryDate: String(row.entry_date),
    note: String(row.note || ""), dials: Number(row.dials), ownerConversations: Number(row.owner_conversations),
    demosBooked: Number(row.demos_booked), demosHeld: Number(row.demos_held), trials: Number(row.trials),
    customers: Number(row.customers), mrr: Number(row.mrr), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function mapDraft(row: D1Row): FounderDraft {
  return {
    id: String(row.id), ownerId: String(row.owner_id), category: String(row.category), body: String(row.body),
    status: row.status as FounderDraft["status"], sourceDate: String(row.source_date), createdAt: String(row.created_at),
    updatedAt: String(row.updated_at), postedAt: row.posted_at ? String(row.posted_at) : null,
  };
}

function mapConversation(row: D1Row): FounderConversation {
  return {
    id: String(row.id), ownerId: String(row.owner_id), provider: String(row.provider), platform: String(row.platform),
    title: String(row.title), author: row.author ? String(row.author) : null, url: String(row.url),
    publishedAt: row.published_at ? String(row.published_at) : null, source: String(row.source),
    rawSnippet: String(row.raw_snippet), query: String(row.query), score: Number(row.score),
    rationale: String(row.rationale), suggestedResponse: String(row.suggested_response),
    status: row.status as FounderConversation["status"], createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export async function getDailyEntry(ownerId: string, entryDate: string) {
  const database = await db();
  const row = await database.prepare("SELECT * FROM founder_daily_entries WHERE owner_id = ? AND entry_date = ? LIMIT 1").bind(ownerId, entryDate).first<D1Row>();
  return row ? mapDaily(row) : null;
}

export async function saveDailyEntry(ownerId: string, entryDate: string, input: Omit<FounderDailyEntry, "id" | "ownerId" | "entryDate" | "createdAt" | "updatedAt">) {
  const database = await db();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO founder_daily_entries
    (id, owner_id, entry_date, note, dials, owner_conversations, demos_booked, demos_held, trials, customers, mrr, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, entry_date) DO UPDATE SET note=excluded.note, dials=excluded.dials,
      owner_conversations=excluded.owner_conversations, demos_booked=excluded.demos_booked,
      demos_held=excluded.demos_held, trials=excluded.trials, customers=excluded.customers,
      mrr=excluded.mrr, updated_at=excluded.updated_at`).bind(
    id, ownerId, entryDate, input.note, input.dials, input.ownerConversations, input.demosBooked,
    input.demosHeld, input.trials, input.customers, input.mrr, now, now,
  ).run();
  return getDailyEntry(ownerId, entryDate);
}

export async function listDrafts(ownerId: string, sourceDate: string, limit = 12) {
  const database = await db();
  const result = await database.prepare("SELECT * FROM founder_content_drafts WHERE owner_id = ? AND source_date = ? ORDER BY created_at DESC LIMIT ?").bind(ownerId, sourceDate, limit).all<D1Row>();
  return result.results.map(mapDraft);
}

export async function listPostedDrafts(ownerId: string, limit = 20) {
  const database = await db();
  const result = await database.prepare("SELECT * FROM founder_content_drafts WHERE owner_id = ? AND status = 'posted' ORDER BY posted_at DESC LIMIT ?").bind(ownerId, limit).all<D1Row>();
  return result.results.map(mapDraft);
}

export async function insertDrafts(ownerId: string, sourceDate: string, drafts: Array<{ category: string; body: string }>) {
  const database = await db();
  const now = new Date().toISOString();
  await database.batch(drafts.map((draft) => database.prepare(`INSERT INTO founder_content_drafts
    (id, owner_id, category, body, status, source_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`).bind(crypto.randomUUID(), ownerId, draft.category, draft.body, sourceDate, now, now)));
  return listDrafts(ownerId, sourceDate, drafts.length);
}

export async function updateDraft(ownerId: string, id: string, input: { body?: string; status?: FounderDraft["status"] }) {
  const database = await db();
  const current = await database.prepare("SELECT * FROM founder_content_drafts WHERE id = ? AND owner_id = ? LIMIT 1").bind(id, ownerId).first<D1Row>();
  if (!current) return null;
  const now = new Date().toISOString();
  const status = input.status || String(current.status);
  const postedAt = status === "posted" ? (current.posted_at || now) : current.posted_at;
  await database.prepare("UPDATE founder_content_drafts SET body = ?, status = ?, posted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(input.body ?? current.body, status, postedAt, now, id, ownerId).run();
  const row = await database.prepare("SELECT * FROM founder_content_drafts WHERE id = ? AND owner_id = ? LIMIT 1").bind(id, ownerId).first<D1Row>();
  return row ? mapDraft(row) : null;
}

export async function listConversations(ownerId: string, limit = 5) {
  const database = await db();
  const result = await database.prepare("SELECT * FROM founder_conversations WHERE owner_id = ? AND status != 'ignored' ORDER BY score DESC, created_at DESC LIMIT ?").bind(ownerId, limit).all<D1Row>();
  return result.results.map(mapConversation);
}

export async function upsertConversations(ownerId: string, signals: Array<{
  provider: string; platform: string; title: string; author?: string | null; url: string; publishedAt?: string | null;
  source: string; rawSnippet: string; query: string; score: number; rationale: string; suggestedResponse: string;
}>) {
  const database = await db();
  const now = new Date().toISOString();
  await database.prepare("DELETE FROM founder_conversations WHERE owner_id = ? AND status = 'surfaced'").bind(ownerId).run();
  if (!signals.length) return;
  await database.batch(signals.map((signal) => database.prepare(`INSERT INTO founder_conversations
    (id, owner_id, provider, platform, title, author, url, published_at, source, raw_snippet, query, score, rationale, suggested_response, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'surfaced', ?, ?)
    ON CONFLICT(owner_id, url) DO UPDATE SET score=excluded.score, rationale=excluded.rationale,
      suggested_response=excluded.suggested_response, raw_snippet=excluded.raw_snippet, updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), ownerId, signal.provider, signal.platform, signal.title, signal.author || null,
      signal.url, signal.publishedAt || null, signal.source, signal.rawSnippet, signal.query, signal.score,
      signal.rationale, signal.suggestedResponse, now, now)));
}

export async function updateConversation(ownerId: string, id: string, input: { status: FounderConversation["status"]; suggestedResponse?: string }) {
  const database = await db();
  const current = await database.prepare("SELECT suggested_response FROM founder_conversations WHERE id = ? AND owner_id = ? LIMIT 1").bind(id, ownerId).first<D1Row>();
  if (!current) return null;
  await database.prepare("UPDATE founder_conversations SET status = ?, suggested_response = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(input.status, input.suggestedResponse ?? current.suggested_response, new Date().toISOString(), id, ownerId).run();
  const row = await database.prepare("SELECT * FROM founder_conversations WHERE id = ? AND owner_id = ? LIMIT 1").bind(id, ownerId).first<D1Row>();
  return row ? mapConversation(row) : null;
}
