import { describe, it, expect, afterAll } from "vitest";
import { createTestRepo } from "./create-test-repo.js";
import { cleanupTempDir, git } from "../helpers/setup.js";

describe("test fixture repo", () => {
  let repoDir: string;

  afterAll(() => { if (repoDir) cleanupTempDir(repoDir); });

  it("creates a repo with ~50 commits", () => {
    repoDir = createTestRepo();
    const count = parseInt(git(repoDir, "rev-list --count HEAD"), 10);
    expect(count).toBeGreaterThanOrEqual(45);
    expect(count).toBeLessThanOrEqual(55);
  });

  it("has tags v1.0 and v1.1", () => {
    const tags = git(repoDir, "tag -l").split("\n");
    expect(tags).toContain("v1.0");
    expect(tags).toContain("v1.1");
  });

  it("has multiple branches", () => {
    const branches = git(repoDir, "branch -a").split("\n").map(b => b.trim().replace("* ", ""));
    expect(branches.length).toBeGreaterThanOrEqual(2);
  });

  it("has revert commits", () => {
    const log = git(repoDir, 'log --oneline --grep="Revert"');
    expect(log).toContain("Revert");
  });
});
