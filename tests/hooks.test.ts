import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installHook, removeHook, hasHook } from "../src/util/hooks.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

describe("hooks", () => {
  let tmpDir: string;
  let gitDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "git-skill-hook-"));
    execSync("git init", { cwd: tmpDir, encoding: "utf-8" });
    gitDir = join(tmpDir, ".git");
  });
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it("installs hook in fresh repo", () => {
    const result = installHook(gitDir);
    expect(result).toBe("installed");
    expect(hasHook(gitDir)).toBe(true);
  });

  it("detects already installed hook", () => {
    installHook(gitDir);
    expect(installHook(gitDir)).toBe("already_installed");
  });

  it("removes hook", () => {
    installHook(gitDir);
    expect(removeHook(gitDir)).toBe("removed");
    expect(hasHook(gitDir)).toBe(false);
  });

  it("returns not_found for missing hook", () => {
    expect(removeHook(gitDir)).toBe("not_found");
  });
});
