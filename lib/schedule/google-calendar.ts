import { SignJWT, jwtVerify } from "jose";
import {
  getScheduledJob,
  linkScheduledJobToGoogle,
  listScheduledJobs,
  scheduleDb,
  type ScheduledJob,
  updateScheduledJobFromGoogle,
} from "./store";

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_API = "https://www.googleapis.com/calendar/v3";

type ConnectionRow = Record<string, string | number | null>;
type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
};

export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  lastSyncedAt: string | null;
};

function config() {
  return {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || "",
    tokenKey: process.env.GOOGLE_CALENDAR_TOKEN_KEY?.trim() || "",
  };
}

export function googleCalendarConfigured() {
  const value = config();
  return Boolean(value.clientId && value.clientSecret && value.tokenKey.length >= 32);
}

async function ensureConnectionTable() {
  const database = await scheduleDb();
  await database.prepare(`CREATE TABLE IF NOT EXISTS google_calendar_connections (
    owner_id TEXT PRIMARY KEY,
    access_token_enc TEXT NOT NULL,
    refresh_token_enc TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    scope TEXT NOT NULL,
    calendar_id TEXT NOT NULL DEFAULT 'primary',
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  return database;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const tokenKey = config().tokenKey;
  if (tokenKey.length < 32) throw new Error("Google Calendar token encryption is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tokenKey));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bytesToBase64Url(combined);
}

async function decrypt(value: string) {
  const combined = base64UrlToBytes(value);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    await encryptionKey(),
    combined.slice(12),
  );
  return new TextDecoder().decode(decrypted);
}

async function connection(ownerId: string) {
  const database = await ensureConnectionTable();
  return database.prepare("SELECT * FROM google_calendar_connections WHERE owner_id = ? LIMIT 1").bind(ownerId).first<ConnectionRow>();
}

export async function getGoogleCalendarStatus(ownerId: string): Promise<GoogleCalendarStatus> {
  if (!googleCalendarConfigured()) return { configured: false, connected: false, lastSyncedAt: null };
  const row = await connection(ownerId);
  return { configured: true, connected: Boolean(row), lastSyncedAt: row?.last_synced_at ? String(row.last_synced_at) : null };
}

function oauthSecret() {
  return new TextEncoder().encode(config().tokenKey);
}

export async function createGoogleOAuthState(ownerId: string) {
  return new SignJWT({ ownerId, nonce: crypto.randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(oauthSecret());
}

export async function verifyGoogleOAuthState(state: string) {
  const verified = await jwtVerify(state, oauthSecret(), { algorithms: ["HS256"] });
  const ownerId = verified.payload.ownerId;
  if (typeof ownerId !== "string" || !ownerId) throw new Error("Invalid Google Calendar connection state.");
  return ownerId;
}

export async function googleAuthorizationUrl(ownerId: string, redirectUri: string) {
  if (!googleCalendarConfigured()) throw new Error("Google Calendar is not configured yet.");
  const params = new URLSearchParams({
    client_id: config().clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: await createGoogleOAuthState(ownerId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(ownerId: string, code: string, redirectUri: string) {
  if (!googleCalendarConfigured()) throw new Error("Google Calendar is not configured yet.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config().clientId,
      client_secret: config().clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const token = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string };
  if (!response.ok || !token.access_token) throw new Error(token.error_description || "Google did not complete the calendar connection.");
  const existing = await connection(ownerId);
  const refreshToken = token.refresh_token || (existing?.refresh_token_enc ? await decrypt(String(existing.refresh_token_enc)) : "");
  if (!refreshToken) throw new Error("Google did not provide offline calendar access. Reconnect and approve access again.");
  const database = await ensureConnectionTable();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString();
  await database.prepare(`INSERT INTO google_calendar_connections
    (owner_id, access_token_enc, refresh_token_enc, expires_at, scope, calendar_id, last_synced_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'primary', NULL, ?, ?)
    ON CONFLICT(owner_id) DO UPDATE SET access_token_enc = excluded.access_token_enc,
      refresh_token_enc = excluded.refresh_token_enc, expires_at = excluded.expires_at,
      scope = excluded.scope, updated_at = excluded.updated_at`).bind(
      ownerId, await encrypt(token.access_token), await encrypt(refreshToken), expiresAt, token.scope || GOOGLE_SCOPE, now, now,
    ).run();
}

async function validAccessToken(ownerId: string) {
  const row = await connection(ownerId);
  if (!row) throw new Error("Connect Google Calendar first.");
  if (new Date(String(row.expires_at)).getTime() > Date.now() + 60_000) return decrypt(String(row.access_token_enc));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config().clientId,
      client_secret: config().clientSecret,
      refresh_token: await decrypt(String(row.refresh_token_enc)),
      grant_type: "refresh_token",
    }),
  });
  const token = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !token.access_token) throw new Error(token.error_description || "Google Calendar access expired. Reconnect it.");
  const database = await ensureConnectionTable();
  await database.prepare("UPDATE google_calendar_connections SET access_token_enc = ?, expires_at = ?, updated_at = ? WHERE owner_id = ?").bind(
    await encrypt(token.access_token),
    new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString(),
    new Date().toISOString(),
    ownerId,
  ).run();
  return token.access_token;
}

function addIsoDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function googleEventFromJob(job: ScheduledJob) {
  return {
    summary: job.title,
    location: job.address,
    description: [
      "Managed by Stripe Pros",
      job.crew ? `Crew: ${job.crew}` : "",
      `Status: ${job.status.replaceAll("_", " ")}`,
      job.notes,
    ].filter(Boolean).join("\n"),
    start: { date: job.startDate },
    end: { date: addIsoDays(job.endDate, 1) },
    extendedProperties: { private: { stripepros_source: "stripepros", stripepros_job_id: job.id } },
  };
}

export function jobPatchFromGoogle(event: GoogleEvent) {
  const startDate = event.start?.date || event.start?.dateTime?.slice(0, 10);
  const googleEnd = event.end?.date || event.end?.dateTime?.slice(0, 10);
  if (!startDate || !googleEnd) return null;
  const allDay = Boolean(event.start?.date && event.end?.date);
  return {
    title: event.summary?.trim() || "Scheduled striping job",
    address: event.location?.trim() || "Address not set in Google Calendar",
    startDate,
    endDate: allDay ? addIsoDays(googleEnd, -1) : googleEnd,
  };
}

async function googleRequest(ownerId: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await validAccessToken(ownerId)}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message || `Google Calendar returned ${response.status}.`);
  }
  return response;
}

export async function syncJobToGoogle(ownerId: string, job: ScheduledJob) {
  const status = await getGoogleCalendarStatus(ownerId);
  if (!status.connected) return job;
  const calendarId = job.googleCalendarId || "primary";
  const base = `${GOOGLE_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  if (job.googleEventId) {
    await googleRequest(ownerId, `${base}/${encodeURIComponent(job.googleEventId)}`, { method: "PUT", body: JSON.stringify(googleEventFromJob(job)) });
    return job;
  }
  const response = await googleRequest(ownerId, base, { method: "POST", body: JSON.stringify(googleEventFromJob(job)) });
  const event = await response.json() as GoogleEvent;
  if (!event.id) throw new Error("Google created the event without returning an ID.");
  return await linkScheduledJobToGoogle(ownerId, job.id, event.id, calendarId) || job;
}

export async function deleteJobFromGoogle(ownerId: string, job: ScheduledJob) {
  if (!job.googleEventId || !(await getGoogleCalendarStatus(ownerId)).connected) return;
  const token = await validAccessToken(ownerId);
  const url = `${GOOGLE_API}/calendars/${encodeURIComponent(job.googleCalendarId || "primary")}/events/${encodeURIComponent(job.googleEventId)}`;
  const response = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error("Google Calendar could not remove the linked event.");
}

async function taggedGoogleEvents(ownerId: string) {
  const events: GoogleEvent[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      singleEvents: "true",
      maxResults: "2500",
      privateExtendedProperty: "stripepros_source=stripepros",
      timeMin: "2020-01-01T00:00:00.000Z",
      timeMax: "2101-01-01T00:00:00.000Z",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await googleRequest(ownerId, `${GOOGLE_API}/calendars/primary/events?${params}`);
    const page = await response.json() as { items?: GoogleEvent[]; nextPageToken?: string };
    events.push(...(page.items || []));
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return events;
}

export async function syncGoogleCalendar(ownerId: string) {
  if (!(await getGoogleCalendarStatus(ownerId)).connected) throw new Error("Connect Google Calendar first.");
  let pulled = 0;
  let pushed = 0;
  for (const event of await taggedGoogleEvents(ownerId)) {
    if (event.status === "cancelled") continue;
    const jobId = event.extendedProperties?.private?.stripepros_job_id;
    const patch = jobPatchFromGoogle(event);
    if (jobId && patch && await getScheduledJob(ownerId, jobId)) {
      await updateScheduledJobFromGoogle(ownerId, jobId, patch);
      pulled += 1;
    }
  }
  const jobs = await listScheduledJobs(ownerId, "2020-01-01", "2100-12-31");
  for (const job of jobs) {
    if (!job.googleEventId) {
      await syncJobToGoogle(ownerId, job);
      pushed += 1;
    }
  }
  const database = await ensureConnectionTable();
  const syncedAt = new Date().toISOString();
  await database.prepare("UPDATE google_calendar_connections SET last_synced_at = ?, updated_at = ? WHERE owner_id = ?").bind(syncedAt, syncedAt, ownerId).run();
  return { pulled, pushed, syncedAt };
}

export async function disconnectGoogleCalendar(ownerId: string) {
  const database = await ensureConnectionTable();
  await database.prepare("DELETE FROM google_calendar_connections WHERE owner_id = ?").bind(ownerId).run();
}
