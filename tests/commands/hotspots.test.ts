import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "../fixtures/create-test-repo.js";
import { cleanupTempDir } from "../helpers/setup.js";
import { resolve } from "path";

describe("hotspots command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("lists top churn files", () => {
    const output = execSync(`node ${cliPath} hotspots`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(output).toContain("src/");
  });

  it("outputs JSON with file_path key", () => {
    const output = execSync(`node ${cliPath} hotspots --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as Array<{ file_path: string }>;
    expect(parsed).toBeInstanceOf(Array);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty("file_path");
  });

  it("respects --limit flag", () => {
    const output = execSync(`node ${cliPath} hotspots --limit 3 --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output);
    expect(parsed.length).toBeLessThanOrEqual(3);
  });

  it("returns files ordered by commits descending", () => {
    const output = execSync(`node ${cliPath} hotspots --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as Array<{ commits: number }>;
    for (let i = 1; i < parsed.length; i++) {
      expect(parsed[i].commits).toBeLessThanOrEqual(parsed[i - 1].commits);
    }
  });
});
