import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "../fixtures/create-test-repo.js";
import { cleanupTempDir } from "../helpers/setup.js";
import { resolve, join } from "path";
import { writeFileSync } from "fs";

describe("verify command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    // Run snapshot to populate history
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir, encoding: "utf-8" });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("shows message when nothing staged", () => {
    const output = execSync(`node ${cliPath} verify`, { cwd: repoDir, encoding: "utf-8" });
    expect(output).toContain("Nothing staged");
  });

  it("runs local check on staged file", () => {
    // Modify a file and stage it
    writeFileSync(join(repoDir, "src/auth/index.ts"), "// modified\n", { flag: "a" });
    execSync("git add src/auth/index.ts", { cwd: repoDir, encoding: "utf-8" });
    const output = execSync(`node ${cliPath} verify`, { cwd: repoDir, encoding: "utf-8" });
    // Should show history for this high-churn file
    expect(output).toContain("src/auth/index.ts");
  });

  it("supports --json output", () => {
    const output = execSync(`node ${cliPath} verify --json`, { cwd: repoDir, encoding: "utf-8" });
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
