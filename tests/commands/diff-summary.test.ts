import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "../fixtures/create-test-repo.js";
import { cleanupTempDir } from "../helpers/setup.js";
import { resolve } from "path";

describe("diff-summary command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("shows text summary for a range", () => {
    const output = execSync(`node ${cliPath} diff-summary v1.0..v1.1`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain("v1.0..v1.1");
  });

  it("outputs JSON with commits array", () => {
    const output = execSync(`node ${cliPath} diff-summary v1.0..v1.1 --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as { commits: unknown[]; range: string };
    expect(parsed).toHaveProperty("commits");
    expect(parsed.commits).toBeInstanceOf(Array);
    expect(parsed).toHaveProperty("range", "v1.0..v1.1");
  });

  it("JSON includes author and file stats", () => {
    const output = execSync(`node ${cliPath} diff-summary v1.0..v1.1 --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as {
      authors: string[];
      added_files: string[];
      modified_files: string[];
      deleted_files: string[];
    };
    expect(parsed).toHaveProperty("authors");
    expect(parsed.authors).toBeInstanceOf(Array);
    expect(parsed).toHaveProperty("added_files");
    expect(parsed).toHaveProperty("modified_files");
    expect(parsed).toHaveProperty("deleted_files");
  });

  it("handles HEAD~5..HEAD range", () => {
    const output = execSync(`node ${cliPath} diff-summary HEAD~5..HEAD --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as { commits: unknown[] };
    expect(parsed.commits.length).toBeGreaterThan(0);
  });
});
