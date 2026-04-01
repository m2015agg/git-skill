import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "./fixtures/create-test-repo.js";
import { cleanupTempDir } from "./helpers/setup.js";
import { resolve } from "path";

describe("doctor command", () => {
  let repoDir: string;

  beforeAll(() => {
    repoDir = createTestRepo();
    const cliPath = resolve("dist/index.js");
    execSync(`node ${cliPath} init --skip-cron`, { cwd: repoDir, encoding: "utf-8" });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("reports healthy status after clean init", () => {
    const cliPath = resolve("dist/index.js");
    const output = execSync(`node ${cliPath} doctor`, { cwd: repoDir, encoding: "utf-8" });
    expect(output).toContain("git repo");
    expect(output).toContain("post-commit hook");
    expect(output).toContain("history.db");
  });

  it("outputs JSON with --json flag", () => {
    const cliPath = resolve("dist/index.js");
    const output = execSync(`node ${cliPath} doctor --json`, { cwd: repoDir, encoding: "utf-8" });
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("checks");
    expect(Array.isArray(parsed.checks)).toBe(true);
  });
});
