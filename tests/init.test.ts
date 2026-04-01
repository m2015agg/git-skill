import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "./fixtures/create-test-repo.js";
import { cleanupTempDir } from "./helpers/setup.js";
import { join, resolve } from "path";
import { existsSync, readFileSync } from "fs";

describe("init command", () => {
  let repoDir: string;

  beforeAll(() => {
    repoDir = createTestRepo();
    const cliPath = resolve("dist/index.js");
    execSync(`node ${cliPath} init --skip-cron`, { cwd: repoDir, encoding: "utf-8" });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("creates .git-history directory", () => {
    expect(existsSync(join(repoDir, ".git-history"))).toBe(true);
  });

  it("installs post-commit hook", () => {
    const hookPath = join(repoDir, ".git", "hooks", "post-commit");
    expect(existsSync(hookPath)).toBe(true);
    expect(readFileSync(hookPath, "utf-8")).toContain("git-skill");
  });

  it("runs initial snapshot", () => {
    expect(existsSync(join(repoDir, ".git-history", "history.db"))).toBe(true);
  });

  it("adds .git-history to .gitignore", () => {
    const gitignore = readFileSync(join(repoDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".git-history");
  });

  it("is idempotent", () => {
    const cliPath = resolve("dist/index.js");
    expect(() => {
      execSync(`node ${cliPath} init --skip-cron`, { cwd: repoDir, encoding: "utf-8" });
    }).not.toThrow();
  });
});
