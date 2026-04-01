import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "../fixtures/create-test-repo.js";
import { cleanupTempDir } from "../helpers/setup.js";
import { resolve } from "path";

describe("release-notes command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir, encoding: "utf-8" });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("generates notes for tag range", () => {
    const output = execSync(`node ${cliPath} release-notes v1.0..v1.1`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(output).toContain("Release Notes");
    expect(output).toContain("v1.0");
  });

  it("outputs JSON", () => {
    const output = execSync(`node ${cliPath} release-notes v1.0..v1.1 --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("range");
    expect(parsed).toHaveProperty("commits");
  });
});
