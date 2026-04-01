import Database from "better-sqlite3";
import { join } from "path";
import { existsSync } from "fs";

const SCHEMA_VERSION = 1;

export function openDb(historyDir: string): Database.Database {
  const dbPath = join(historyDir, "history.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = OFF");
  initSchema(db);
  return db;
}

export function hasDb(historyDir: string): boolean {
  return existsSync(join(historyDir, "history.db"));
}

function initSchema(db: Database.Database): void {
  const currentVersion = getSchemaVersion(db);
  if (currentVersion >= SCHEMA_VERSION) return;

  db.exec(`
    -- Layer 1: Raw Git Data
    CREATE TABLE IF NOT EXISTS commits (
      hash TEXT PRIMARY KEY,
      message TEXT,
      author TEXT,
      email TEXT,
      timestamp TEXT,
      branch TEXT,
      parent_hash TEXT,
      merge_commit INTEGER DEFAULT 0,
      insertions INTEGER DEFAULT 0,
      deletions INTEGER DEFAULT 0,
      files_changed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS commit_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commit_hash TEXT,
      file_path TEXT,
      status TEXT,
      insertions INTEGER DEFAULT 0,
      deletions INTEGER DEFAULT 0,
      old_path TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_commit_files_hash ON commit_files(commit_hash);
    CREATE INDEX IF NOT EXISTS idx_commit_files_path ON commit_files(file_path);

    CREATE TABLE IF NOT EXISTS branches (
      name TEXT PRIMARY KEY,
      head_hash TEXT,
      created_at TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS tags (
      name TEXT PRIMARY KEY,
      hash TEXT,
      timestamp TEXT,
      message TEXT
    );

    -- Layer 2: Derived Analytics
    CREATE TABLE IF NOT EXISTS file_evolution (
      file_path TEXT PRIMARY KEY,
      first_seen TEXT,
      last_modified TEXT,
      total_commits INTEGER DEFAULT 0,
      total_churn INTEGER DEFAULT 0,
      current_size INTEGER DEFAULT 0,
      growth_rate REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS churn_hotspots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT,
      period TEXT,
      commits INTEGER DEFAULT 0,
      insertions INTEGER DEFAULT 0,
      deletions INTEGER DEFAULT 0,
      unique_authors INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_churn_path ON churn_hotspots(file_path);

    CREATE TABLE IF NOT EXISTS coupling (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_a TEXT,
      file_b TEXT,
      co_commit_count INTEGER DEFAULT 0,
      coupling_score REAL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_coupling_a ON coupling(file_a);
    CREATE INDEX IF NOT EXISTS idx_coupling_b ON coupling(file_b);

    CREATE TABLE IF NOT EXISTS trends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_name TEXT,
      period TEXT,
      value REAL,
      delta REAL,
      direction TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trends_metric ON trends(metric_name);

    CREATE TABLE IF NOT EXISTS decision_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commit_hash TEXT,
      type TEXT,
      impact_score REAL DEFAULT 0,
      files_affected INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS author_expertise (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT,
      file_pattern TEXT,
      commit_count INTEGER DEFAULT 0,
      last_touched TEXT,
      expertise_score REAL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_expertise_author ON author_expertise(author);

    -- Layer 3: LLM Enrichment
    CREATE TABLE IF NOT EXISTS enrichments (
      commit_hash TEXT PRIMARY KEY,
      intent TEXT,
      reasoning TEXT,
      category TEXT,
      alternatives_considered TEXT,
      session_context TEXT
    );

    -- Search Layer
    CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(
      hash, type, path, message, detail,
      tokenize='porter unicode61'
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commit_hash TEXT,
      content_type TEXT,
      vector BLOB,
      model TEXT,
      created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_hash ON embeddings(commit_hash);

    CREATE TABLE IF NOT EXISTS embed_queue (
      commit_hash TEXT PRIMARY KEY,
      queued_at TEXT,
      status TEXT DEFAULT 'pending',
      error TEXT
    );

    -- Metrics Layer
    CREATE TABLE IF NOT EXISTS metric_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commit_hash TEXT,
      metric_name TEXT,
      value REAL,
      captured_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_metric_values_name ON metric_values(metric_name);

    -- Infrastructure
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
}

function getSchemaVersion(db: Database.Database): number {
  try {
    const row = db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}
