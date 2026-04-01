import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "./fixtures/create-test-repo.js";
import { cleanupTempDir } from "./helpers/setup.js";
import { openDb } from "../src/util/db.js";
import { join, resolve } from "path";

describe("enrichment", () => {
  let repoDir: string;

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${resolve("dist/index.js")} snapshot`, { cwd: repoDir, encoding: "utf-8" });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("enrich --dry-run shows count", () => {
    const output = execSync(`node ${resolve("dist/index.js")} enrich --dry-run`, { cwd: repoDir, encoding: "utf-8" });
    expect(output).toContain("commit");
  });

  it("why command shows commit info", () => {
    const db = openDb(join(repoDir, ".git-history"));
    const commit = db.prepare("SELECT hash FROM commits LIMIT 1").get() as any;
    db.close();
    const output = execSync(`node ${resolve("dist/index.js")} why ${commit.hash}`, { cwd: repoDir, encoding: "utf-8" });
    expect(output).toContain(commit.hash.slice(0, 7));
  });

  it("why --json outputs valid JSON", () => {
    const db = openDb(join(repoDir, ".git-history"));
    const commit = db.prepare("SELECT hash FROM commits LIMIT 1").get() as any;
    db.close();
    const output = execSync(`node ${resolve("dist/index.js")} why ${commit.hash} --json`, { cwd: repoDir, encoding: "utf-8" });
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("hash");
  });
});
