import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "../fixtures/create-test-repo.js";
import { cleanupTempDir } from "../helpers/setup.js";
import { resolve, join } from "path";
import { readFileSync, mkdirSync } from "fs";

describe("approve command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    mkdirSync(join(repoDir, ".claude"), { recursive: true });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("creates settings.json with pre-approved commands", () => {
    execSync(`node ${cliPath} approve`, { cwd: repoDir, encoding: "utf-8" });
    const settings = JSON.parse(readFileSync(join(repoDir, ".claude", "settings.json"), "utf-8"));
    expect(settings.permissions.allow).toContain("Bash(git-skill search:*)");
    expect(settings.permissions.allow).toContain("Bash(git-skill doctor:*)");
  });

  it("does not include write commands", () => {
    const settings = JSON.parse(readFileSync(join(repoDir, ".claude", "settings.json"), "utf-8"));
    expect(settings.permissions.allow).not.toContain("Bash(git-skill snapshot:*)");
    expect(settings.permissions.allow).not.toContain("Bash(git-skill enrich:*)");
  });
});
