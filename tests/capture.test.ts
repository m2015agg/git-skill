import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "./fixtures/create-test-repo.js";
import { cleanupTempDir } from "./helpers/setup.js";
import { openDb } from "../src/util/db.js";
import { join, resolve } from "path";
import { mkdirSync } from "fs";

describe("capture command", () => {
  let repoDir: string;

  beforeAll(() => {
    repoDir = createTestRepo();
    mkdirSync(join(repoDir, ".git-history"), { recursive: true });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("captures the latest commit into SQLite", () => {
    const cliPath = resolve("dist/index.js");
    execSync(`node ${cliPath} capture --hook`, { cwd: repoDir, encoding: "utf-8" });
    const db = openDb(join(repoDir, ".git-history"));
    const count = db.prepare("SELECT COUNT(*) as c FROM commits").get() as any;
    expect(count.c).toBe(1);
    db.close();
  });

  it("captures commit files", () => {
    const db = openDb(join(repoDir, ".git-history"));
    const files = db.prepare("SELECT COUNT(*) as c FROM commit_files").get() as any;
    expect(files.c).toBeGreaterThan(0);
    db.close();
  });

  it("is idempotent — running twice doesn't duplicate", () => {
    const cliPath = resolve("dist/index.js");
    execSync(`node ${cliPath} capture --hook`, { cwd: repoDir, encoding: "utf-8" });
    const db = openDb(join(repoDir, ".git-history"));
    const count = db.prepare("SELECT COUNT(*) as c FROM commits").get() as any;
    expect(count.c).toBe(1);
    db.close();
  });
});
