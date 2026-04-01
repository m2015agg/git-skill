import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "./fixtures/create-test-repo.js";
import { cleanupTempDir } from "./helpers/setup.js";
import { resolve } from "path";

describe("search command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir, encoding: "utf-8" });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("finds commits by keyword", () => {
    const output = execSync(`node ${cliPath} search "auth"`, { cwd: repoDir, encoding: "utf-8" });
    expect(output.toLowerCase()).toContain("auth");
  });

  it("returns no results for nonexistent query", () => {
    const output = execSync(`node ${cliPath} search "xyznonexistent123"`, { cwd: repoDir, encoding: "utf-8" });
    expect(output).toContain("No results");
  });

  it("respects --limit flag", () => {
    const output = execSync(`node ${cliPath} search "add" --limit 3 --json`, { cwd: repoDir, encoding: "utf-8" });
    const results = JSON.parse(output);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("outputs valid JSON with --json", () => {
    const output = execSync(`node ${cliPath} search "auth" --json`, { cwd: repoDir, encoding: "utf-8" });
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
