import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDb, hasDb } from "../src/util/db.js";
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("database", () => {
  let tmpDir: string;
  let historyDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "git-skill-db-"));
    historyDir = join(tmpDir, ".git-history");
    mkdirSync(historyDir, { recursive: true });
  });

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it("creates history.db with all tables", () => {
    const db = openDb(historyDir);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map((r: any) => r.name);

    expect(tables).toContain("commits");
    expect(tables).toContain("commit_files");
    expect(tables).toContain("branches");
    expect(tables).toContain("tags");
    expect(tables).toContain("file_evolution");
    expect(tables).toContain("churn_hotspots");
    expect(tables).toContain("coupling");
    expect(tables).toContain("trends");
    expect(tables).toContain("decision_points");
    expect(tables).toContain("author_expertise");
    expect(tables).toContain("enrichments");
    expect(tables).toContain("embeddings");
    expect(tables).toContain("embed_queue");
    expect(tables).toContain("metric_values");
    expect(tables).toContain("schema_meta");
    db.close();
  });

  it("creates FTS5 virtual table", () => {
    const db = openDb(historyDir);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='history_fts'"
    ).all();
    expect(tables.length).toBe(1);
    db.close();
  });

  it("sets WAL mode", () => {
    const db = openDb(historyDir);
    const mode = db.pragma("journal_mode", { simple: true });
    expect(mode).toBe("wal");
    db.close();
  });

  it("hasDb returns false for missing db", () => {
    expect(hasDb(join(tmpDir, "nonexistent"))).toBe(false);
  });

  it("hasDb returns true after openDb", () => {
    openDb(historyDir).close();
    expect(hasDb(historyDir)).toBe(true);
  });

  it("stores and retrieves schema version", () => {
    const db = openDb(historyDir);
    const version = db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as any;
    expect(parseInt(version.value)).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it("insert and query commits", () => {
    const db = openDb(historyDir);
    db.prepare(`INSERT INTO commits (hash, message, author, email, timestamp, branch, parent_hash, merge_commit, insertions, deletions, files_changed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "abc123", "test commit", "Test", "test@test.com", "2026-01-01T00:00:00Z", "main", "", 0, 10, 5, 2
    );
    const row = db.prepare("SELECT * FROM commits WHERE hash = ?").get("abc123") as any;
    expect(row.message).toBe("test commit");
    expect(row.deletions).toBe(5);
    db.close();
  });

  it("INSERT OR IGNORE prevents duplicate commits", () => {
    const db = openDb(historyDir);
    const insert = db.prepare(`INSERT OR IGNORE INTO commits (hash, message, author, email, timestamp, branch, parent_hash, merge_commit, insertions, deletions, files_changed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insert.run("abc123", "first", "Test", "t@t.com", "2026-01-01", "main", "", 0, 0, 0, 0);
    insert.run("abc123", "duplicate", "Test", "t@t.com", "2026-01-01", "main", "", 0, 0, 0, 0);
    const count = db.prepare("SELECT COUNT(*) as c FROM commits").get() as any;
    expect(count.c).toBe(1);
    db.close();
  });
});
