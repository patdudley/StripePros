ALTER TABLE scheduled_jobs ADD COLUMN google_event_id TEXT;
ALTER TABLE scheduled_jobs ADD COLUMN google_calendar_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS scheduled_jobs_google_event_idx
  ON scheduled_jobs(owner_id, google_event_id)
  WHERE google_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS google_calendar_connections (
  owner_id TEXT PRIMARY KEY,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  scope TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
