import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "../fixtures/create-test-repo.js";
import { cleanupTempDir } from "../helpers/setup.js";
import { resolve } from "path";

describe("coupling command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("shows coupling for a file with known co-changes", () => {
    // src/core/app.ts and src/core/router.ts are changed together 3 times
    const output = execSync(`node ${cliPath} coupling src/core/app.ts`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(output).toContain("src/core/router.ts");
  });

  it("outputs JSON", () => {
    const output = execSync(`node ${cliPath} coupling src/core/app.ts --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as Array<{ paired_file: string; coupling_score: number }>;
    expect(parsed).toBeInstanceOf(Array);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty("paired_file");
    expect(parsed[0]).toHaveProperty("coupling_score");
  });

  it("respects --limit flag", () => {
    const output = execSync(`node ${cliPath} coupling src/core/app.ts --limit 1 --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output);
    expect(parsed.length).toBeLessThanOrEqual(1);
  });

  it("returns 'no coupling' message for untracked path", () => {
    const output = execSync(`node ${cliPath} coupling src/does-not-exist.ts`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(output).toContain("No coupling data found");
  });
});
