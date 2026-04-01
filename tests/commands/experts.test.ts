import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "../fixtures/create-test-repo.js";
import { cleanupTempDir } from "../helpers/setup.js";
import { resolve } from "path";

describe("experts command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("shows experts for a path", () => {
    const output = execSync(`node ${cliPath} experts src/auth/`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(output.length).toBeGreaterThan(0);
    // Should contain the author name from the test repo
    expect(output).toContain("Test Author");
  });

  it("outputs JSON with expected keys", () => {
    const output = execSync(`node ${cliPath} experts src/auth/ --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as Array<{
      author: string;
      commit_count: number;
      expertise_score: number;
    }>;
    expect(parsed).toBeInstanceOf(Array);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty("author");
    expect(parsed[0]).toHaveProperty("commit_count");
    expect(parsed[0]).toHaveProperty("expertise_score");
  });

  it("respects --limit flag", () => {
    const output = execSync(`node ${cliPath} experts src/ --limit 1 --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output);
    expect(parsed.length).toBeLessThanOrEqual(1);
  });

  it("returns ordered by expertise score descending", () => {
    const output = execSync(`node ${cliPath} experts src/ --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as Array<{ expertise_score: number }>;
    for (let i = 1; i < parsed.length; i++) {
      expect(parsed[i].expertise_score).toBeLessThanOrEqual(parsed[i - 1].expertise_score);
    }
  });
});
