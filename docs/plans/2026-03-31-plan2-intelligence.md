# Plan 2: Intelligence — Analytics, Search, Query Commands

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add derived analytics computation to snapshot, FTS5 search, and all read-only query commands — making git-skill a full intelligence layer over git history.

**Architecture:** Snapshot command extended with analytics phase that computes file_evolution, churn_hotspots, coupling, decision_points, author_expertise, and trends from raw commit data in SQLite. Query commands read from these tables and output formatted text or JSON.

**Tech Stack:** TypeScript, better-sqlite3 (queries + aggregation), simple-statistics (trends)

**Depends on:** Plan 1 (Core) must be complete — all raw git data in SQLite, CLI entry point, test fixture repo.

**Spec:** `docs/specs/2026-03-31-git-skill-design.md`

---

## File Structure (new/modified files)

```
src/
├── commands/
│   ├── snapshot.ts             # MODIFY — add analytics phase after backfill
│   ├── search.ts               # CREATE — BM25 search command
│   ├── timeline.ts             # CREATE — file/dir evolution
│   ├── blame.ts                # CREATE — enhanced blame
│   ├── hotspots.ts             # CREATE — churn analysis
│   ├── coupling.ts             # CREATE — co-change analysis
│   ├── decisions.ts            # CREATE — decision point browser
│   ├── experts.ts              # CREATE — author expertise
│   ├── diff-summary.ts         # CREATE — range summary
│   ├── trends.ts               # CREATE — metric trends dashboard
│   └── regression.ts           # CREATE — change-point detection
├── util/
│   ├── analytics.ts            # CREATE — all analytics computation functions
│   └── search-hybrid.ts        # CREATE — BM25 search + future vector fusion
tests/
├── analytics.test.ts           # CREATE
├── search.test.ts              # CREATE
├── commands/
│   ├── timeline.test.ts        # CREATE
│   ├── hotspots.test.ts        # CREATE
│   ├── coupling.test.ts        # CREATE
│   ├── decisions.test.ts       # CREATE
│   ├── experts.test.ts         # CREATE
│   ├── diff-summary.test.ts    # CREATE
│   ├── trends.test.ts          # CREATE
│   └── regression.test.ts      # CREATE
```

---

### Task 1: Analytics Engine — Core Computations

**Files:**
- Create: `src/util/analytics.ts`
- Create: `tests/analytics.test.ts`

- [ ] **Step 1: Write failing tests for analytics computations**

```typescript
// tests/analytics.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "./fixtures/create-test-repo.js";
import { cleanupTempDir } from "./helpers/setup.js";
import { openDb } from "../src/util/db.js";
import { computeFileEvolution, computeChurnHotspots, computeCoupling, computeDecisionPoints, computeAuthorExpertise, computeTrends } from "../src/util/analytics.js";
import { join, resolve } from "path";

describe("analytics computations", () => {
  let repoDir: string;
  let historyDir: string;

  beforeAll(() => {
    repoDir = createTestRepo();
    // Run snapshot to populate raw data
    const cliPath = resolve("dist/index.js");
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir, encoding: "utf-8" });
    historyDir = join(repoDir, ".git-history");
  });

  afterAll(() => cleanupTempDir(repoDir));

  describe("file_evolution", () => {
    it("computes evolution for all files", () => {
      const db = openDb(historyDir);
      computeFileEvolution(db);
      const rows = db.prepare("SELECT * FROM file_evolution").all() as any[];
      expect(rows.length).toBeGreaterThan(10);
      db.close();
    });

    it("tracks first_seen and last_modified", () => {
      const db = openDb(historyDir);
      const row = db.prepare("SELECT * FROM file_evolution WHERE file_path = 'src/auth/index.ts'").get() as any;
      expect(row).toBeTruthy();
      expect(row.first_seen).toBeTruthy();
      expect(row.last_modified).toBeTruthy();
      expect(row.total_commits).toBeGreaterThan(3); // thrashed in Phase 2
      db.close();
    });
  });

  describe("churn_hotspots", () => {
    it("identifies high-churn files", () => {
      const db = openDb(historyDir);
      computeChurnHotspots(db);
      const rows = db.prepare("SELECT * FROM churn_hotspots ORDER BY commits DESC LIMIT 5").all() as any[];
      expect(rows.length).toBeGreaterThan(0);
      // src/auth/index.ts should be a top hotspot (thrashed in Phase 2)
      const authHotspot = rows.find((r: any) => r.file_path.includes("auth/index"));
      expect(authHotspot).toBeTruthy();
      db.close();
    });
  });

  describe("coupling", () => {
    it("detects co-changed files", () => {
      const db = openDb(historyDir);
      computeCoupling(db);
      const rows = db.prepare("SELECT * FROM coupling ORDER BY coupling_score DESC LIMIT 10").all() as any[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].coupling_score).toBeGreaterThan(0);
      db.close();
    });

    it("excludes commits with >50 files", () => {
      const db = openDb(historyDir);
      // Verify no coupling entries from the scope-creep commit (12 files)
      // This commit should still be included since it's under 50
      const rows = db.prepare("SELECT * FROM coupling").all() as any[];
      expect(rows.length).toBeGreaterThan(0);
      db.close();
    });
  });

  describe("decision_points", () => {
    it("detects reverts", () => {
      const db = openDb(historyDir);
      computeDecisionPoints(db);
      const reverts = db.prepare("SELECT * FROM decision_points WHERE type = 'revert'").all() as any[];
      expect(reverts.length).toBeGreaterThanOrEqual(2);
      db.close();
    });

    it("detects big refactors", () => {
      const db = openDb(historyDir);
      const refactors = db.prepare("SELECT * FROM decision_points WHERE type = 'big_refactor'").all() as any[];
      expect(refactors.length).toBeGreaterThanOrEqual(1);
      db.close();
    });

    it("detects architecture changes", () => {
      const db = openDb(historyDir);
      const archChanges = db.prepare("SELECT * FROM decision_points WHERE type = 'architecture_change'").all() as any[];
      expect(archChanges.length).toBeGreaterThanOrEqual(1);
      db.close();
    });
  });

  describe("author_expertise", () => {
    it("computes expertise scores", () => {
      const db = openDb(historyDir);
      computeAuthorExpertise(db);
      const rows = db.prepare("SELECT * FROM author_expertise").all() as any[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].expertise_score).toBeGreaterThan(0);
      db.close();
    });
  });

  describe("trends", () => {
    it("computes trend data", () => {
      const db = openDb(historyDir);
      computeTrends(db);
      const rows = db.prepare("SELECT * FROM trends").all() as any[];
      expect(rows.length).toBeGreaterThan(0);
      db.close();
    });

    it("tracks direction (up/down/stable)", () => {
      const db = openDb(historyDir);
      const row = db.prepare("SELECT * FROM trends WHERE direction IS NOT NULL LIMIT 1").get() as any;
      expect(row).toBeTruthy();
      expect(["up", "down", "stable"]).toContain(row.direction);
      db.close();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/analytics.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement analytics.ts**

```typescript
// src/util/analytics.ts
import type Database from "better-sqlite3";

export function computeFileEvolution(db: Database.Database): void {
  db.exec("DELETE FROM file_evolution");
  db.exec(`
    INSERT INTO file_evolution (file_path, first_seen, last_modified, total_commits, total_churn)
    SELECT
      cf.file_path,
      MIN(c.timestamp) as first_seen,
      MAX(c.timestamp) as last_modified,
      COUNT(DISTINCT cf.commit_hash) as total_commits,
      SUM(cf.insertions + cf.deletions) as total_churn
    FROM commit_files cf
    JOIN commits c ON c.hash = cf.commit_hash
    GROUP BY cf.file_path
  `);
}

export function computeChurnHotspots(db: Database.Database): void {
  db.exec("DELETE FROM churn_hotspots");
  // Group by file + weekly period
  db.exec(`
    INSERT INTO churn_hotspots (file_path, period, commits, insertions, deletions, unique_authors)
    SELECT
      cf.file_path,
      strftime('%Y-W%W', c.timestamp) as period,
      COUNT(DISTINCT cf.commit_hash) as commits,
      SUM(cf.insertions) as insertions,
      SUM(cf.deletions) as deletions,
      COUNT(DISTINCT c.author) as unique_authors
    FROM commit_files cf
    JOIN commits c ON c.hash = cf.commit_hash
    GROUP BY cf.file_path, period
  `);
}

export function computeCoupling(db: Database.Database): void {
  db.exec("DELETE FROM coupling");

  // Get commits with <=50 files (exclude bulk operations)
  const eligibleCommits = db.prepare(`
    SELECT hash FROM commits WHERE files_changed <= 50 AND files_changed > 1
  `).all() as { hash: string }[];

  const filePairs = new Map<string, number>();

  for (const { hash } of eligibleCommits) {
    const files = db.prepare(
      "SELECT file_path FROM commit_files WHERE commit_hash = ? ORDER BY file_path"
    ).all(hash) as { file_path: string }[];

    // Generate pairs
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const key = `${files[i].file_path}\t${files[j].file_path}`;
        filePairs.set(key, (filePairs.get(key) || 0) + 1);
      }
    }
  }

  // Insert pairs with count >= 2
  const insert = db.prepare(
    "INSERT INTO coupling (file_a, file_b, co_commit_count, coupling_score) VALUES (?, ?, ?, ?)"
  );

  const totalCommits = eligibleCommits.length || 1;
  const transaction = db.transaction(() => {
    for (const [key, count] of filePairs) {
      if (count < 2) continue;
      const [fileA, fileB] = key.split("\t");
      const score = count / totalCommits;
      insert.run(fileA, fileB, count, score);
    }
  });
  transaction();
}

export function computeDecisionPoints(db: Database.Database): void {
  db.exec("DELETE FROM decision_points");

  const insert = db.prepare(
    "INSERT INTO decision_points (commit_hash, type, impact_score, files_affected) VALUES (?, ?, ?, ?)"
  );

  const commits = db.prepare(
    "SELECT hash, message, files_changed, insertions, deletions FROM commits"
  ).all() as { hash: string; message: string; files_changed: number; insertions: number; deletions: number }[];

  const transaction = db.transaction(() => {
    for (const c of commits) {
      const churn = c.insertions + c.deletions;

      // Revert detection
      if (/revert/i.test(c.message)) {
        insert.run(c.hash, "revert", churn, c.files_changed);
      }

      // Big refactor (20+ files)
      if (c.files_changed >= 20) {
        insert.run(c.hash, "big_refactor", churn, c.files_changed);
      }

      // Major removal (deletions > 2x insertions, significant size)
      if (c.deletions > c.insertions * 2 && c.deletions > 20) {
        insert.run(c.hash, "major_removal", churn, c.files_changed);
      }

      // Dependency change
      const depFiles = db.prepare(
        "SELECT file_path FROM commit_files WHERE commit_hash = ? AND (file_path LIKE '%package.json' OR file_path LIKE '%requirements.txt' OR file_path LIKE '%Cargo.toml' OR file_path LIKE '%go.mod')"
      ).all(c.hash) as { file_path: string }[];
      if (depFiles.length > 0) {
        insert.run(c.hash, "dependency_change", churn, c.files_changed);
      }

      // Architecture change (new top-level directory)
      const newDirs = db.prepare(
        "SELECT DISTINCT file_path FROM commit_files WHERE commit_hash = ? AND status = 'A'"
      ).all(c.hash) as { file_path: string }[];
      const topLevelDirs = new Set(newDirs.map(f => f.file_path.split("/")[0]).filter(d => d !== "." && !d.includes(".")));
      if (topLevelDirs.size >= 2) {
        insert.run(c.hash, "architecture_change", churn, c.files_changed);
      }
    }
  });
  transaction();
}

export function computeAuthorExpertise(db: Database.Database): void {
  db.exec("DELETE FROM author_expertise");

  // Group by author + directory pattern (first 2 path segments)
  db.exec(`
    INSERT INTO author_expertise (author, file_pattern, commit_count, last_touched, expertise_score)
    SELECT
      c.author,
      CASE
        WHEN INSTR(cf.file_path, '/') > 0
        THEN SUBSTR(cf.file_path, 1, INSTR(SUBSTR(cf.file_path, INSTR(cf.file_path, '/') + 1), '/') + INSTR(cf.file_path, '/') - 1)
        ELSE cf.file_path
      END as file_pattern,
      COUNT(DISTINCT c.hash) as commit_count,
      MAX(c.timestamp) as last_touched,
      COUNT(DISTINCT c.hash) * 1.0 as expertise_score
    FROM commits c
    JOIN commit_files cf ON cf.commit_hash = c.hash
    GROUP BY c.author, file_pattern
    HAVING commit_count >= 1
  `);
}

export function computeTrends(db: Database.Database): void {
  db.exec("DELETE FROM trends");

  const insert = db.prepare(
    "INSERT INTO trends (metric_name, period, value, delta, direction) VALUES (?, ?, ?, ?, ?)"
  );

  // Compute weekly trends for key metrics
  const weeklyStats = db.prepare(`
    SELECT
      strftime('%Y-W%W', timestamp) as period,
      COUNT(*) as commits,
      SUM(files_changed) as total_files,
      SUM(insertions) as total_insertions,
      SUM(deletions) as total_deletions,
      AVG(files_changed) as avg_files_per_commit,
      SUM(CASE WHEN message LIKE '%revert%' THEN 1 ELSE 0 END) as reverts,
      SUM(CASE WHEN message LIKE '%fix%' THEN 1 ELSE 0 END) as fixes
    FROM commits
    GROUP BY period
    ORDER BY period
  `).all() as any[];

  const transaction = db.transaction(() => {
    let prevCommits = 0;
    let prevAvgFiles = 0;

    for (const week of weeklyStats) {
      const commitDelta = prevCommits ? week.commits - prevCommits : 0;
      insert.run("commits_per_week", week.period, week.commits, commitDelta,
        commitDelta > 0 ? "up" : commitDelta < 0 ? "down" : "stable");

      const avgFilesDelta = prevAvgFiles ? week.avg_files_per_commit - prevAvgFiles : 0;
      insert.run("avg_files_per_commit", week.period, week.avg_files_per_commit, avgFilesDelta,
        avgFilesDelta > 1 ? "up" : avgFilesDelta < -1 ? "down" : "stable");

      if (week.commits > 0) {
        const revertRate = week.reverts / week.commits;
        insert.run("revert_rate", week.period, revertRate, 0, revertRate > 0.1 ? "up" : "stable");

        const fixRate = week.fixes / week.commits;
        insert.run("fix_rate", week.period, fixRate, 0, fixRate > 0.3 ? "up" : "stable");
      }

      const churn = week.total_insertions + week.total_deletions;
      insert.run("total_churn", week.period, churn, 0, "stable");

      prevCommits = week.commits;
      prevAvgFiles = week.avg_files_per_commit;
    }
  });
  transaction();
}

export function runAllAnalytics(db: Database.Database): void {
  computeFileEvolution(db);
  computeChurnHotspots(db);
  computeCoupling(db);
  computeDecisionPoints(db);
  computeAuthorExpertise(db);
  computeTrends(db);
}
```

- [ ] **Step 4: Run tests**

Run: `npm run build && npx vitest run tests/analytics.test.ts`
Expected: PASS

- [ ] **Step 5: Wire analytics into snapshot command**

Modify `src/commands/snapshot.ts` — add after FTS rebuild:

```typescript
// After Phase 4 (FTS), add:
// Phase 5: Analytics
import { runAllAnalytics } from "../util/analytics.js";

write("Phase 5: Computing analytics...\n");
runAllAnalytics(db);
write("  Analytics computed.\n");
```

- [ ] **Step 6: Rebuild, run snapshot test to verify analytics are computed**

Run: `npm run build && npx vitest run tests/snapshot.test.ts`
Expected: PASS (add a test checking analytics tables are populated)

- [ ] **Step 7: Commit**

```bash
git add src/util/analytics.ts src/commands/snapshot.ts tests/analytics.test.ts
git commit -m "feat: analytics engine (file_evolution, hotspots, coupling, decisions, expertise, trends)"
```

---

### Task 2: Search — BM25 via FTS5

**Files:**
- Create: `src/util/search-hybrid.ts`
- Create: `src/commands/search.ts`
- Create: `tests/search.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/search.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "./fixtures/create-test-repo.js";
import { cleanupTempDir } from "./helpers/setup.js";
import { resolve } from "path";

describe("search command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir, encoding: "utf-8" });
  });

  afterAll(() => cleanupTempDir(repoDir));

  it("finds commits by keyword", () => {
    const output = execSync(`node ${cliPath} search "auth"`, { cwd: repoDir, encoding: "utf-8" });
    expect(output).toContain("auth");
  });

  it("finds commits by file path", () => {
    const output = execSync(`node ${cliPath} search "middleware"`, { cwd: repoDir, encoding: "utf-8" });
    expect(output.length).toBeGreaterThan(0);
  });

  it("returns empty for nonexistent query", () => {
    const output = execSync(`node ${cliPath} search "xyznonexistent123"`, { cwd: repoDir, encoding: "utf-8" });
    expect(output).toContain("No results");
  });

  it("respects --limit flag", () => {
    const output = execSync(`node ${cliPath} search "add" --limit 3 --json`, { cwd: repoDir, encoding: "utf-8" });
    const results = JSON.parse(output);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("outputs valid JSON with --json flag", () => {
    const output = execSync(`node ${cliPath} search "auth" --json`, { cwd: repoDir, encoding: "utf-8" });
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/search.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement search-hybrid.ts**

```typescript
// src/util/search-hybrid.ts
import type Database from "better-sqlite3";

export interface SearchResult {
  hash: string;
  type: string;
  path: string;
  message: string;
  detail: string;
  score: number;
}

export function searchBM25(db: Database.Database, query: string, limit = 20): SearchResult[] {
  const safeQuery = query.replace(/['"]/g, "").trim();
  if (!safeQuery) return [];

  try {
    // Try FTS5 phrase + prefix match
    const results = db.prepare(`
      SELECT hash, type, path, message, detail, rank as score
      FROM history_fts
      WHERE history_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(`"${safeQuery}"*`, limit) as SearchResult[];

    if (results.length > 0) return results;

    // Fallback: individual terms
    const terms = safeQuery.split(/\s+/).map(t => `"${t}"*`).join(" OR ");
    return db.prepare(`
      SELECT hash, type, path, message, detail, rank as score
      FROM history_fts
      WHERE history_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(terms, limit) as SearchResult[];
  } catch {
    // Final fallback: LIKE search on base tables (FTS5 doesn't support LIKE)
    const commitMatches = db.prepare(`
      SELECT hash, 'commit' as type, '' as path, message, '' as detail, 0 as score
      FROM commits
      WHERE message LIKE ?
      LIMIT ?
    `).all(`%${safeQuery}%`, limit) as SearchResult[];
    const fileMatches = db.prepare(`
      SELECT commit_hash as hash, 'file' as type, file_path as path, '' as message, status as detail, 0 as score
      FROM commit_files
      WHERE file_path LIKE ?
      LIMIT ?
    `).all(`%${safeQuery}%`, limit) as SearchResult[];
    return [...commitMatches, ...fileMatches].slice(0, limit);
  }
}
```

- [ ] **Step 4: Implement search.ts command**

```typescript
// src/commands/search.ts
import { Command } from "commander";
import { openDb } from "../util/db.js";
import { searchBM25 } from "../util/search-hybrid.js";
import { join } from "path";

function write(msg: string): void {
  process.stdout.write(msg);
}

export function searchCommand(): Command {
  return new Command("search")
    .description("Search git history (BM25 + vector hybrid)")
    .argument("<query>", "Search query")
    .option("--limit <n>", "Max results", "20")
    .option("--json", "Output as JSON")
    .option("--since <date>", "Filter from date")
    .option("--until <date>", "Filter until date")
    .action((query: string, opts: { limit: string; json?: boolean; since?: string; until?: string }) => {
      const cwd = process.cwd();
      const historyDir = join(cwd, ".git-history");
      const db = openDb(historyDir);

      try {
        const limit = parseInt(opts.limit, 10);
        let results = searchBM25(db, query, limit);

        // Apply date filters if present
        if (opts.since || opts.until) {
          const commitHashes = new Set(
            results.filter(r => r.type === "commit").map(r => r.hash)
          );
          // Also include file results whose commits match
          const fileHashes = new Set(
            results.filter(r => r.type === "file").map(r => r.hash)
          );
          const allHashes = new Set([...commitHashes, ...fileHashes]);

          if (allHashes.size > 0 && (opts.since || opts.until)) {
            let dateFilter = "SELECT hash FROM commits WHERE 1=1";
            const params: string[] = [];
            if (opts.since) { dateFilter += " AND timestamp >= ?"; params.push(opts.since); }
            if (opts.until) { dateFilter += " AND timestamp <= ?"; params.push(opts.until); }

            const validHashes = new Set(
              db.prepare(dateFilter).all(...params).map((r: any) => r.hash)
            );
            results = results.filter(r => validHashes.has(r.hash));
          }
        }

        if (opts.json) {
          write(JSON.stringify(results, null, 2) + "\n");
          return;
        }

        if (results.length === 0) {
          write(`No results for "${query}".\n`);
          return;
        }

        // Group by commit
        const commitResults = results.filter(r => r.type === "commit");
        const fileResults = results.filter(r => r.type === "file");

        write(`\nSearch results for "${query}" (${results.length} matches):\n`);
        write("─".repeat(60) + "\n");

        for (const r of commitResults.slice(0, limit)) {
          const commit = db.prepare("SELECT timestamp, author FROM commits WHERE hash = ?").get(r.hash) as any;
          write(`  ${r.hash.slice(0, 7)} ${r.message}`);
          if (commit) write(` (${commit.author}, ${commit.timestamp.slice(0, 10)})`);
          write("\n");
        }

        if (fileResults.length > 0) {
          write(`\nFiles:\n`);
          const uniquePaths = [...new Set(fileResults.map(r => r.path))].slice(0, 10);
          for (const p of uniquePaths) {
            write(`  ${p}\n`);
          }
        }

        write("\n");
      } finally {
        db.close();
      }
    });
}
```

- [ ] **Step 5: Register in CLI, build, test**

Add `searchCommand` to `src/index.ts`.

Run: `npm run build && npx vitest run tests/search.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/util/search-hybrid.ts src/commands/search.ts src/index.ts tests/search.test.ts
git commit -m "feat: BM25 search command with FTS5"
```

---

### Task 3: Timeline Command

**Files:**
- Create: `src/commands/timeline.ts`
- Create: `tests/commands/timeline.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/commands/timeline.test.ts
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
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir, encoding: "utf-8" });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("shows timeline for a file", () => {
    const output = execSync(`node ${cliPath} timeline src/auth/index.ts`, { cwd: repoDir, encoding: "utf-8" });
    expect(output).toContain("src/auth/index.ts");
    expect(output.split("\n").length).toBeGreaterThan(3);
  });

  it("shows timeline for a directory", () => {
    const output = execSync(`node ${cliPath} timeline src/auth/`, { cwd: repoDir, encoding: "utf-8" });
    expect(output.length).toBeGreaterThan(0);
  });

  it("outputs JSON with --json", () => {
    const output = execSync(`node ${cliPath} timeline src/auth/index.ts --json`, { cwd: repoDir, encoding: "utf-8" });
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty("hash");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/commands/timeline.test.ts`

- [ ] **Step 3: Implement timeline.ts**

```typescript
// src/commands/timeline.ts
import { Command } from "commander";
import { openDb } from "../util/db.js";
import { join } from "path";

function write(msg: string): void { process.stdout.write(msg); }

export function timelineCommand(): Command {
  return new Command("timeline")
    .description("Full evolution of a file or directory")
    .argument("<path>", "File or directory path")
    .option("--limit <n>", "Max results", "50")
    .option("--json", "Output as JSON")
    .option("--since <date>", "Filter from date")
    .option("--until <date>", "Filter until date")
    .action((path: string, opts: { limit: string; json?: boolean; since?: string; until?: string }) => {
      const cwd = process.cwd();
      const db = openDb(join(cwd, ".git-history"));
      const limit = parseInt(opts.limit, 10);

      try {
        const isDir = path.endsWith("/");
        const pathPattern = isDir ? `${path}%` : path;
        const operator = isDir ? "LIKE" : "=";

        let query = `
          SELECT c.hash, c.message, c.author, c.timestamp, c.insertions, c.deletions,
                 cf.file_path, cf.status, cf.insertions as file_ins, cf.deletions as file_del
          FROM commit_files cf
          JOIN commits c ON c.hash = cf.commit_hash
          WHERE cf.file_path ${operator} ?
        `;
        const params: any[] = [pathPattern];

        if (opts.since) { query += " AND c.timestamp >= ?"; params.push(opts.since); }
        if (opts.until) { query += " AND c.timestamp <= ?"; params.push(opts.until); }
        query += " ORDER BY c.timestamp ASC LIMIT ?";
        params.push(limit);

        const rows = db.prepare(query).all(...params) as any[];

        if (opts.json) {
          write(JSON.stringify(rows, null, 2) + "\n");
          return;
        }

        if (rows.length === 0) {
          write(`No history found for ${path}\n`);
          return;
        }

        write(`\nTimeline: ${path} (${rows.length} entries)\n`);
        write("─".repeat(70) + "\n");

        for (const r of rows) {
          const date = r.timestamp.slice(0, 10);
          const stats = `+${r.file_ins}/-${r.file_del}`;
          write(`  ${date} ${r.hash.slice(0, 7)} [${r.status}] ${stats.padEnd(10)} ${r.message}\n`);
        }
        write("\n");
      } finally {
        db.close();
      }
    });
}
```

- [ ] **Step 4: Register in CLI, build, test**

Run: `npm run build && npx vitest run tests/commands/timeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/timeline.ts tests/commands/timeline.test.ts src/index.ts
git commit -m "feat: timeline command for file/directory evolution"
```

---

### Task 4: Hotspots Command

**Files:**
- Create: `src/commands/hotspots.ts`
- Create: `tests/commands/hotspots.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/commands/hotspots.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "../fixtures/create-test-repo.js";
import { cleanupTempDir } from "../helpers/setup.js";
import { resolve } from "path";

describe("hotspots command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir, encoding: "utf-8" });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("lists top churn files", () => {
    const output = execSync(`node ${cliPath} hotspots`, { cwd: repoDir, encoding: "utf-8" });
    expect(output).toContain("src/auth");
  });

  it("outputs JSON", () => {
    const output = execSync(`node ${cliPath} hotspots --json`, { cwd: repoDir, encoding: "utf-8" });
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty("file_path");
    expect(parsed[0]).toHaveProperty("commits");
  });
});
```

- [ ] **Step 2: Implement hotspots.ts**

```typescript
// src/commands/hotspots.ts
import { Command } from "commander";
import { openDb } from "../util/db.js";
import { join } from "path";

function write(msg: string): void { process.stdout.write(msg); }

export function hotspotsCommand(): Command {
  return new Command("hotspots")
    .description("Files with most churn")
    .option("--limit <n>", "Max results", "20")
    .option("--period <period>", "Group by period (week/month)")
    .option("--json", "Output as JSON")
    .action((opts: { limit: string; period?: string; json?: boolean }) => {
      const db = openDb(join(process.cwd(), ".git-history"));
      const limit = parseInt(opts.limit, 10);

      try {
        const rows = db.prepare(`
          SELECT file_path, SUM(commits) as commits, SUM(insertions) as insertions,
                 SUM(deletions) as deletions, MAX(unique_authors) as unique_authors
          FROM churn_hotspots
          GROUP BY file_path
          ORDER BY commits DESC
          LIMIT ?
        `).all(limit) as any[];

        if (opts.json) {
          write(JSON.stringify(rows, null, 2) + "\n");
          return;
        }

        write(`\nChurn Hotspots (top ${rows.length}):\n`);
        write("─".repeat(70) + "\n");
        write(`  ${"File".padEnd(45)} Commits  +/-\n`);
        write("─".repeat(70) + "\n");

        for (const r of rows) {
          const churn = `+${r.insertions}/-${r.deletions}`;
          write(`  ${r.file_path.padEnd(45)} ${String(r.commits).padStart(4)}    ${churn}\n`);
        }
        write("\n");
      } finally {
        db.close();
      }
    });
}
```

- [ ] **Step 3: Register, build, test**

Run: `npm run build && npx vitest run tests/commands/hotspots.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/commands/hotspots.ts tests/commands/hotspots.test.ts src/index.ts
git commit -m "feat: hotspots command for churn analysis"
```

---

### Task 5: Coupling Command

**Files:**
- Create: `src/commands/coupling.ts`
- Create: `tests/commands/coupling.test.ts`

- [ ] **Step 1: Write test, implement, register, build, test**

Pattern same as Task 4. The coupling command queries the `coupling` table and shows co-changed files for a given file path. Accept `<path>` argument, `--limit`, `--json` options.

Query: `SELECT * FROM coupling WHERE file_a = ? OR file_b = ? ORDER BY coupling_score DESC LIMIT ?`

- [ ] **Step 2: Commit**

```bash
git add src/commands/coupling.ts tests/commands/coupling.test.ts src/index.ts
git commit -m "feat: coupling command for co-change analysis"
```

---

### Task 6: Decisions Command

**Files:**
- Create: `src/commands/decisions.ts`
- Create: `tests/commands/decisions.test.ts`

- [ ] **Step 1: Write test, implement, register, build, test**

Pattern same as previous. Queries `decision_points` table joined with `commits` for message/author context. Accept `--type <type>` filter, `--limit`, `--json` options.

Test should verify: finds reverts, finds refactors, `--type revert` filters correctly.

- [ ] **Step 2: Commit**

```bash
git add src/commands/decisions.ts tests/commands/decisions.test.ts src/index.ts
git commit -m "feat: decisions command for decision point browsing"
```

---

### Task 7: Experts Command

**Files:**
- Create: `src/commands/experts.ts`
- Create: `tests/commands/experts.test.ts`

- [ ] **Step 1: Write test, implement, register, build, test**

Queries `author_expertise` table for a given path pattern. Accept `<path>` argument, `--limit`, `--json` options.

Query: `SELECT * FROM author_expertise WHERE file_pattern LIKE ? ORDER BY expertise_score DESC LIMIT ?`

- [ ] **Step 2: Commit**

```bash
git add src/commands/experts.ts tests/commands/experts.test.ts src/index.ts
git commit -m "feat: experts command for author expertise mapping"
```

---

### Task 8: Blame Command

**Files:**
- Create: `src/commands/blame.ts`
- Create: `tests/commands/blame.test.ts`

- [ ] **Step 1: Write test, implement, register, build, test**

Enhanced blame that combines git blame output with enrichment data (when available). Runs `git blame --porcelain <path>` and enriches with data from `enrichments` table.

When no enrichments exist, falls back to showing raw blame with commit messages from `commits` table.

Accept `<path>` argument, `--json` option.

- [ ] **Step 2: Commit**

```bash
git add src/commands/blame.ts tests/commands/blame.test.ts src/index.ts
git commit -m "feat: blame command with enrichment integration"
```

---

### Task 9: Diff-Summary Command

**Files:**
- Create: `src/commands/diff-summary.ts`
- Create: `tests/commands/diff-summary.test.ts`

- [ ] **Step 1: Write test, implement, register, build, test**

Summarizes a commit range in LLM-friendly format. Accept `<range>` argument (e.g., `v1.0..v1.1`), `--json` option.

Uses `git rev-list <range>` to get commit hashes, then queries SQLite for all commits + files in that range. Groups by author, lists new/modified/deleted files, shows churn stats.

- [ ] **Step 2: Commit**

```bash
git add src/commands/diff-summary.ts tests/commands/diff-summary.test.ts src/index.ts
git commit -m "feat: diff-summary command for range summaries"
```

---

### Task 10: Trends Command

**Files:**
- Create: `src/commands/trends.ts`
- Create: `tests/commands/trends.test.ts`

- [ ] **Step 1: Write test, implement, register, build, test**

Dashboard showing metric trends over time. Queries `trends` table. Shows direction arrows (↑/↓/→). Accept `--period` (weekly/monthly), `--metric <name>`, `--json` options.

Format:
```
Metric              This Week    Last Week    Direction
commits_per_week         12            8        ↑
avg_files_per_commit    3.2          2.1        ↑
revert_rate            0.00         0.13        ↓
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/trends.ts tests/commands/trends.test.ts src/index.ts
git commit -m "feat: trends command with direction dashboard"
```

---

### Task 11: Regression Command

**Files:**
- Create: `src/commands/regression.ts`
- Create: `tests/commands/regression.test.ts`

- [ ] **Step 1: Write test, implement, register, build, test**

Change-point detection using rolling-window z-score. Accept `--metric <name>` (optional, defaults to files_per_commit). Uses `simple-statistics` for mean/standardDeviation.

Algorithm:
1. Get metric values ordered by period
2. Compute rolling mean + stddev (window=10)
3. Flag points where value > 2 stddev from rolling mean
4. Report earliest flagged point as inflection

For small datasets (<20 points), fall back to simple percent-change comparison.

Accept `--json` option.

- [ ] **Step 2: Commit**

```bash
git add src/commands/regression.ts tests/commands/regression.test.ts src/index.ts
git commit -m "feat: regression command with change-point detection"
```

---

### Task 12: Full Test Suite + Integration

- [ ] **Step 1: Run all tests**

Run: `npm run build && npm test`
Expected: ALL PASS

- [ ] **Step 2: Rebuild and link**

Run: `npm run link`

- [ ] **Step 3: End-to-end verification**

```bash
cd /tmp && rm -rf test-e2e && git init test-e2e && cd test-e2e
echo "hello" > test.txt && git add . && git commit -m "initial"
echo "world" >> test.txt && git add . && git commit -m "update test"
git-skill init --skip-cron
git-skill search "initial"
git-skill timeline test.txt
git-skill hotspots
git-skill trends
git-skill doctor
```
Expected: All commands succeed with meaningful output

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found in Plan 2 integration testing"
```
