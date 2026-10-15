import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const configured = process.env.DB_PATH || './data/game.db';
export const DB_PATH = isAbsolute(configured) ? configured : join(serverRoot, configured);

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- One row per game session. The id is generated server-side and is the only
  -- identifier we keep: no IP address, no user agent, no cookies.
  -- "number" is a short public counter (1, 2, 3, ...) for display only; it is
  -- guessable, so the API never accepts it in place of the id.
  CREATE TABLE IF NOT EXISTS game_sessions (
    id         TEXT PRIMARY KEY,
    number     INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata   TEXT NOT NULL DEFAULT '{}'
  );

  -- Current merged progress snapshot for a session. Each progress POST is
  -- deep-merged into this row, so a later POST links onto earlier data.
  CREATE TABLE IF NOT EXISTS progress_state (
    session_id TEXT PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
    state      TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
  );

  -- Append-only event log (starts, completions, scores, ...) for a session.
  CREATE TABLE IF NOT EXISTS progress_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    prototype  TEXT,
    type       TEXT NOT NULL,
    payload    TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_session ON progress_events(session_id);

  -- One survey response per session (re-submitting replaces the previous answers).
  CREATE TABLE IF NOT EXISTS survey_responses (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id       TEXT NOT NULL UNIQUE REFERENCES game_sessions(id) ON DELETE CASCADE,
    template_version TEXT NOT NULL,
    answers          TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );
`);

// Migration for databases created before session numbers existed: add the
// column and number the existing sessions in creation order.
const hasNumber = db.prepare('PRAGMA table_info(game_sessions)').all().some((c) => c.name === 'number');
if (!hasNumber) db.exec('ALTER TABLE game_sessions ADD COLUMN number INTEGER');
const unnumbered = db
  .prepare('SELECT rowid FROM game_sessions WHERE number IS NULL ORDER BY created_at, rowid')
  .all();
if (unnumbered.length) {
  let next = db.prepare('SELECT COALESCE(MAX(number), 0) AS max FROM game_sessions').get().max;
  const setNumber = db.prepare('UPDATE game_sessions SET number = ? WHERE rowid = ?');
  db.exec('BEGIN');
  for (const row of unnumbered) setNumber.run(++next, row.rowid);
  db.exec('COMMIT');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_number ON game_sessions(number)');

export function nowIso() {
  return new Date().toISOString();
}
