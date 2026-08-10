import { env } from "cloudflare:workers";
import type { OAuthIntegrationProvider } from "./providers";
import { integrationTokenKey } from "./providers";

type ConnectionRow = Record<string, string | number | null>;

export type IntegrationConnection = {
  provider: OAuthIntegrationProvider;
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  externalAccountId: string | null;
  externalAccountName: string | null;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

let schemaReady: Promise<void> | null = null;

async function integrationDb(): Promise<D1Database> {
  if (!env.DB) throw new Error("Integration storage is unavailable.");
  schemaReady ||= (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS integration_connections (
      owner_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      access_token_enc TEXT NOT NULL,
      refresh_token_enc TEXT NOT NULL DEFAULT '',
      expires_at TEXT,
      external_account_id TEXT,
      external_account_name TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_id, provider)
    )`).run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS integration_connections_owner_idx ON integration_connections(owner_id)").run();
  })();
  await schemaReady;
  return env.DB;
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
  const secret = integrationTokenKey();
  if (secret.length < 32) throw new Error("Integration token encryption is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptIntegrationValue(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bytesToBase64Url(combined);
}

export async function decryptIntegrationValue(value: string) {
  if (!value) return "";
  const combined = base64UrlToBytes(value);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    await encryptionKey(),
    combined.slice(12),
  );
  return new TextDecoder().decode(decrypted);
}

function parseMetadata(value: unknown): Record<string, unknown> {
  try { return JSON.parse(String(value || "{}")) as Record<string, unknown>; } catch { return {}; }
}

export async function getIntegrationConnection(ownerId: string, provider: OAuthIntegrationProvider): Promise<IntegrationConnection | null> {
  const database = await integrationDb();
  const row = await database.prepare("SELECT * FROM integration_connections WHERE owner_id = ? AND provider = ? LIMIT 1")
    .bind(ownerId, provider).first<ConnectionRow>();
  if (!row) return null;
  return {
    provider,
    accessToken: await decryptIntegrationValue(String(row.access_token_enc)),
    refreshToken: await decryptIntegrationValue(String(row.refresh_token_enc || "")),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    externalAccountId: row.external_account_id ? String(row.external_account_id) : null,
    externalAccountName: row.external_account_name ? String(row.external_account_name) : null,
    metadata: parseMetadata(row.metadata_json),
    updatedAt: String(row.updated_at),
  };
}

export async function saveIntegrationConnection(ownerId: string, connection: Omit<IntegrationConnection, "updatedAt">) {
  const database = await integrationDb();
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO integration_connections
    (owner_id, provider, access_token_enc, refresh_token_enc, expires_at, external_account_id, external_account_name, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, provider) DO UPDATE SET
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = excluded.refresh_token_enc,
      expires_at = excluded.expires_at,
      external_account_id = excluded.external_account_id,
      external_account_name = excluded.external_account_name,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at`).bind(
      ownerId, connection.provider, await encryptIntegrationValue(connection.accessToken), await encryptIntegrationValue(connection.refreshToken),
      connection.expiresAt, connection.externalAccountId, connection.externalAccountName, JSON.stringify(connection.metadata), now, now,
    ).run();
}

export async function deleteIntegrationConnection(ownerId: string, provider: OAuthIntegrationProvider) {
  const database = await integrationDb();
  await database.prepare("DELETE FROM integration_connections WHERE owner_id = ? AND provider = ?").bind(ownerId, provider).run();
}

