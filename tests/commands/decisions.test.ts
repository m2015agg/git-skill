import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "../fixtures/create-test-repo.js";
import { cleanupTempDir } from "../helpers/setup.js";
import { resolve } from "path";

describe("decisions command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("shows decision points", () => {
    const output = execSync(`node ${cliPath} decisions`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    // Should contain some decision type keyword
    expect(output.length).toBeGreaterThan(0);
    const hasType = output.includes("revert") || output.includes("refactor") || output.includes("architecture");
    expect(hasType).toBe(true);
  });

  it("filters by --type revert", () => {
    const output = execSync(`node ${cliPath} decisions --type revert --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as Array<{ type: string }>;
    expect(parsed).toBeInstanceOf(Array);
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    for (const row of parsed) {
      expect(row.type).toBe("revert");
    }
  });

  it("outputs JSON with expected keys", () => {
    const output = execSync(`node ${cliPath} decisions --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as Array<{
      commit_hash: string;
      type: string;
      impact_score: number;
      files_affected: number;
    }>;
    expect(parsed).toBeInstanceOf(Array);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty("commit_hash");
    expect(parsed[0]).toHaveProperty("type");
    expect(parsed[0]).toHaveProperty("impact_score");
    expect(parsed[0]).toHaveProperty("files_affected");
  });

  it("respects --limit flag", () => {
    const output = execSync(`node ${cliPath} decisions --limit 2 --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output);
    expect(parsed.length).toBeLessThanOrEqual(2);
  });
});
