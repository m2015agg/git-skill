import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "../fixtures/create-test-repo.js";
import { cleanupTempDir } from "../helpers/setup.js";
import { resolve } from "path";

describe("timeline command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("shows timeline for a file", () => {
    const output = execSync(`node ${cliPath} timeline src/auth/index.ts`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(output).toContain("src/auth/index.ts");
  });

  it("shows timeline for a directory", () => {
    const output = execSync(`node ${cliPath} timeline src/auth/`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(output.length).toBeGreaterThan(0);
  });

  it("outputs JSON", () => {
    const output = execSync(`node ${cliPath} timeline src/auth/index.ts --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output);
    expect(parsed).toBeInstanceOf(Array);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("respects --limit flag", () => {
    const output = execSync(`node ${cliPath} timeline src/auth/ --limit 2 --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output);
    expect(parsed.length).toBeLessThanOrEqual(2);
  });

  it("orders results chronologically", () => {
    const output = execSync(`node ${cliPath} timeline src/auth/index.ts --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as Array<{ timestamp: string }>;
    for (let i = 1; i < parsed.length; i++) {
      expect(parsed[i].timestamp >= parsed[i - 1].timestamp).toBe(true);
    }
  });
});
