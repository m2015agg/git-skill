import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getLog,
  getDiffTree,
  getBranches,
  getTags,
  getLastCommitHash,
  isGitRepo,
} from "../src/util/git.js";
import { createTestRepo } from "./fixtures/create-test-repo.js";
import { cleanupTempDir } from "./helpers/setup.js";

describe("git wrappers", () => {
  let repoDir: string;
  beforeAll(() => {
    repoDir = createTestRepo();
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("detects git repo", () => {
    expect(isGitRepo(repoDir)).toBe(true);
    expect(isGitRepo("/tmp")).toBe(false);
  });

  it("gets commit log with all fields", () => {
    const commits = getLog(repoDir);
    expect(commits.length).toBeGreaterThan(40);
    expect(commits[0]).toHaveProperty("hash");
    expect(commits[0]).toHaveProperty("message");
    expect(commits[0]).toHaveProperty("author");
    expect(commits[0]).toHaveProperty("email");
    expect(commits[0]).toHaveProperty("timestamp");
    expect(commits[0]).toHaveProperty("insertions");
    expect(commits[0]).toHaveProperty("deletions");
    expect(commits[0]).toHaveProperty("filesChanged");
  });

  it("gets diff-tree for a commit", () => {
    const commits = getLog(repoDir, { limit: 1 });
    const files = getDiffTree(repoDir, commits[0].hash);
    expect(Array.isArray(files)).toBe(true);
  });

  it("gets branches", () => {
    const branches = getBranches(repoDir);
    expect(branches.length).toBeGreaterThanOrEqual(2);
    expect(branches.find((b) => b.name === "main")).toBeTruthy();
  });

  it("gets tags", () => {
    const tags = getTags(repoDir);
    expect(tags.find((t) => t.name === "v1.0")).toBeTruthy();
    expect(tags.find((t) => t.name === "v1.1")).toBeTruthy();
  });

  it("gets last commit hash", () => {
    const hash = getLastCommitHash(repoDir);
    expect(hash).toMatch(/^[a-f0-9]{40}$/);
  });

  it("respects limit option", () => {
    const commits = getLog(repoDir, { limit: 5 });
    expect(commits.length).toBe(5);
  });

  it("respects since option", () => {
    const commits = getLog(repoDir, { since: "2025-01-20" });
    expect(commits.length).toBeGreaterThan(0);
    expect(commits.length).toBeLessThan(50);
  });

  it("detects merge commits", () => {
    const commits = getLog(repoDir);
    const merges = commits.filter((c) => c.mergeCommit);
    expect(merges.length).toBeGreaterThanOrEqual(1);
  });
});
