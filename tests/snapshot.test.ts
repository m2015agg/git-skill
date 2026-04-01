import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "./fixtures/create-test-repo.js";
import { cleanupTempDir } from "./helpers/setup.js";
import { openDb } from "../src/util/db.js";
import { join, resolve } from "path";
import { existsSync } from "fs";

describe("snapshot command (backfill)", () => {
  let repoDir: string;

  beforeAll(() => {
    repoDir = createTestRepo();
    const cliPath = resolve("dist/index.js");
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir, encoding: "utf-8" });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("creates .git-history directory", () => {
    expect(existsSync(join(repoDir, ".git-history"))).toBe(true);
  });

  it("indexes all commits", () => {
    const db = openDb(join(repoDir, ".git-history"));
    const count = db.prepare("SELECT COUNT(*) as c FROM commits").get() as any;
    expect(count.c).toBeGreaterThanOrEqual(45);
    db.close();
  });

  it("indexes commit files", () => {
    const db = openDb(join(repoDir, ".git-history"));
    const count = db.prepare("SELECT COUNT(*) as c FROM commit_files").get() as any;
    expect(count.c).toBeGreaterThan(50);
    db.close();
  });

  it("indexes branches", () => {
    const db = openDb(join(repoDir, ".git-history"));
    const count = db.prepare("SELECT COUNT(*) as c FROM branches").get() as any;
    expect(count.c).toBeGreaterThanOrEqual(2);
    db.close();
  });

  it("indexes tags", () => {
    const db = openDb(join(repoDir, ".git-history"));
    const tags = db.prepare("SELECT name FROM tags").all() as any[];
    const names = tags.map(t => t.name);
    expect(names).toContain("v1.0");
    expect(names).toContain("v1.1");
    db.close();
  });

  it("populates FTS index", () => {
    const db = openDb(join(repoDir, ".git-history"));
    const results = db.prepare("SELECT COUNT(*) as c FROM history_fts").get() as any;
    expect(results.c).toBeGreaterThan(0);
    db.close();
  });

  it("stores snapshot metadata", () => {
    const db = openDb(join(repoDir, ".git-history"));
    const meta = db.prepare("SELECT value FROM schema_meta WHERE key = 'last_snapshot'").get() as any;
    expect(meta).toBeTruthy();
    db.close();
  });

  it("incremental snapshot only adds new commits", () => {
    const db = openDb(join(repoDir, ".git-history"));
    const before = (db.prepare("SELECT COUNT(*) as c FROM commits").get() as any).c;
    db.close();

    const cliPath = resolve("dist/index.js");
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir, encoding: "utf-8" });

    const db2 = openDb(join(repoDir, ".git-history"));
    const after = (db2.prepare("SELECT COUNT(*) as c FROM commits").get() as any).c;
    expect(after).toBe(before);
    db2.close();
  });
});
