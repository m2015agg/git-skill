import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "./fixtures/create-test-repo.js";
import { cleanupTempDir } from "./helpers/setup.js";
import { openDb } from "../src/util/db.js";
import { join, resolve } from "path";

describe("built-in metrics", () => {
  let repoDir: string;
  let historyDir: string;

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${resolve("dist/index.js")} snapshot`, { cwd: repoDir, encoding: "utf-8" });
    historyDir = join(repoDir, ".git-history");
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("computes revert rate", () => {
    const db = openDb(historyDir);
    const rows = db.prepare("SELECT * FROM metric_values WHERE metric_name = 'revert_rate'").all();
    expect(rows.length).toBeGreaterThan(0);
    db.close();
  });

  it("computes fix-on-fix rate", () => {
    const db = openDb(historyDir);
    const rows = db.prepare("SELECT * FROM metric_values WHERE metric_name = 'fix_on_fix_rate'").all();
    expect(rows.length).toBeGreaterThan(0);
    db.close();
  });

  it("computes scope creep", () => {
    const db = openDb(historyDir);
    const rows = db.prepare("SELECT * FROM metric_values WHERE metric_name = 'scope_creep'").all();
    expect(rows.length).toBeGreaterThan(0);
    db.close();
  });

  it("computes time-to-commit", () => {
    const db = openDb(historyDir);
    const rows = db.prepare("SELECT * FROM metric_values WHERE metric_name = 'time_to_commit'").all();
    expect(rows.length).toBeGreaterThan(0);
    db.close();
  });

  it("detects same-file churn", () => {
    const db = openDb(historyDir);
    const rows = db.prepare("SELECT * FROM metric_values WHERE metric_name = 'same_file_churn'").all();
    expect(rows.length).toBeGreaterThan(0);
    db.close();
  });
});
