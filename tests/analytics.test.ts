import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "./fixtures/create-test-repo.js";
import { cleanupTempDir } from "./helpers/setup.js";
import { openDb } from "../src/util/db.js";
import { join, resolve } from "path";

describe("analytics computations", () => {
  let repoDir: string;
  let historyDir: string;

  beforeAll(() => {
    repoDir = createTestRepo();
    const cliPath = resolve("dist/index.js");
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir, encoding: "utf-8" });
    historyDir = join(repoDir, ".git-history");
  });
  afterAll(() => cleanupTempDir(repoDir));

  describe("file_evolution", () => {
    it("computes evolution for files", () => {
      const db = openDb(historyDir);
      const rows = db.prepare("SELECT * FROM file_evolution").all();
      expect(rows.length).toBeGreaterThan(10);
      db.close();
    });

    it("tracks first_seen and last_modified for high-churn file", () => {
      const db = openDb(historyDir);
      const row = db.prepare("SELECT * FROM file_evolution WHERE file_path LIKE '%auth/index%'").get() as any;
      expect(row).toBeTruthy();
      expect(row.total_commits).toBeGreaterThan(2);
      db.close();
    });
  });

  describe("churn_hotspots", () => {
    it("identifies high-churn files", () => {
      const db = openDb(historyDir);
      const rows = db.prepare("SELECT * FROM churn_hotspots ORDER BY commits DESC LIMIT 5").all() as any[];
      expect(rows.length).toBeGreaterThan(0);
      db.close();
    });
  });

  describe("coupling", () => {
    it("detects co-changed files", () => {
      const db = openDb(historyDir);
      const rows = db.prepare("SELECT * FROM coupling ORDER BY coupling_score DESC LIMIT 10").all() as any[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].coupling_score).toBeGreaterThan(0);
      db.close();
    });
  });

  describe("decision_points", () => {
    it("detects reverts", () => {
      const db = openDb(historyDir);
      const reverts = db.prepare("SELECT * FROM decision_points WHERE type = 'revert'").all();
      expect(reverts.length).toBeGreaterThanOrEqual(2);
      db.close();
    });

    it("detects big refactors or architecture changes", () => {
      const db = openDb(historyDir);
      const refactors = db.prepare("SELECT * FROM decision_points WHERE type IN ('big_refactor', 'architecture_change')").all();
      expect(refactors.length).toBeGreaterThanOrEqual(1);
      db.close();
    });
  });

  describe("author_expertise", () => {
    it("computes expertise scores", () => {
      const db = openDb(historyDir);
      const rows = db.prepare("SELECT * FROM author_expertise").all() as any[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].expertise_score).toBeGreaterThan(0);
      db.close();
    });
  });

  describe("trends", () => {
    it("computes trend data", () => {
      const db = openDb(historyDir);
      const rows = db.prepare("SELECT * FROM trends").all();
      expect(rows.length).toBeGreaterThan(0);
      db.close();
    });

    it("tracks direction", () => {
      const db = openDb(historyDir);
      const row = db.prepare("SELECT * FROM trends WHERE direction IS NOT NULL LIMIT 1").get() as any;
      expect(row).toBeTruthy();
      expect(["up", "down", "stable"]).toContain(row.direction);
      db.close();
    });
  });
});
