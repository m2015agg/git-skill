import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "../fixtures/create-test-repo.js";
import { cleanupTempDir } from "../helpers/setup.js";
import { resolve } from "path";

describe("blame command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("shows blame for a file", () => {
    const output = execSync(`node ${cliPath} blame src/auth/index.ts`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain("Test Author");
  });

  it("outputs JSON", () => {
    const output = execSync(`node ${cliPath} blame src/auth/index.ts --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(JSON.parse(output)).toBeInstanceOf(Array);
  });

  it("JSON entries have required fields", () => {
    const output = execSync(`node ${cliPath} blame src/auth/index.ts --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as Array<{
      hash: string;
      author: string;
      lineStart: number;
      lineEnd: number;
    }>;
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty("hash");
    expect(parsed[0]).toHaveProperty("author");
    expect(parsed[0]).toHaveProperty("lineStart");
    expect(parsed[0]).toHaveProperty("lineEnd");
  });
});
