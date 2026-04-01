# Plan 3: Advanced — Metrics, Enrichment, Release Notes, Distribution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the full feature set — built-in/custom metrics, LLM enrichment pipeline, vector embeddings, release notes generator, and all setup/distribution commands (install, approve, cron, docs, update, uninstall).

**Architecture:** Metrics layer stores per-commit values from both built-in (git-derived) and custom (command/file/git type) metrics. Enrichment pipeline calls any OpenAI-compatible LLM endpoint. Vector embeddings enable semantic search via cosine similarity + RRF fusion with BM25. Distribution commands follow exact patterns from supabase-skill.

**Tech Stack:** TypeScript, better-sqlite3, simple-statistics, fetch() for LLM/embedding APIs

**Depends on:** Plan 1 (Core) + Plan 2 (Intelligence) must be complete.

**Spec:** `docs/specs/2026-03-31-git-skill-design.md`

---

## File Structure (new/modified files)

```
src/
├── commands/
│   ├── snapshot.ts             # MODIFY — add metrics phase
│   ├── why.ts                  # CREATE — pull enrichment for a commit
│   ├── enrich.ts               # CREATE — backfill LLM enrichments
│   ├── embed.ts                # CREATE — generate/refresh embeddings
│   ├── metric.ts               # CREATE — manual metric recording
│   ├── release-notes.ts        # CREATE — aggregated release notes
│   ├── install.ts              # CREATE — global setup wizard
│   ├── approve.ts              # CREATE — pre-approve commands
│   ├── cron.ts                 # CREATE — nightly automation
│   ├── docs.ts                 # CREATE — CLAUDE.md generation
│   ├── update.ts               # CREATE — self-update
│   └── uninstall.ts            # CREATE — clean removal
├── util/
│   ├── metrics.ts              # CREATE — built-in + custom metric computation
│   ├── embedding.ts            # CREATE — embedding provider abstraction
│   ├── search-hybrid.ts        # MODIFY — add vector search + RRF fusion
│   └── detect.ts               # CREATE — project type detection
tests/
├── metrics.test.ts             # CREATE
├── enrichment.test.ts          # CREATE
├── commands/
│   ├── why.test.ts             # CREATE
│   ├── release-notes.test.ts   # CREATE
│   ├── approve.test.ts         # CREATE
│   └── install.test.ts         # CREATE
```

---

### Task 1: Built-in Metrics Engine

**Files:**
- Create: `src/util/metrics.ts`
- Create: `tests/metrics.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/metrics.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "./fixtures/create-test-repo.js";
import { cleanupTempDir } from "./helpers/setup.js";
import { openDb } from "../src/util/db.js";
import { computeBuiltinMetrics } from "../src/util/metrics.js";
import { join, resolve } from "path";

describe("built-in metrics", () => {
  let repoDir: string;
  let historyDir: string;

  beforeAll(() => {
    repoDir = createTestRepo();
    const cliPath = resolve("dist/index.js");
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir, encoding: "utf-8" });
    historyDir = join(repoDir, ".git-history");
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("computes revert rate", () => {
    const db = openDb(historyDir);
    computeBuiltinMetrics(db);
    const revertMetrics = db.prepare(
      "SELECT * FROM metric_values WHERE metric_name = 'revert_rate'"
    ).all() as any[];
    expect(revertMetrics.length).toBeGreaterThan(0);
    db.close();
  });

  it("detects fix-on-fix chains", () => {
    const db = openDb(historyDir);
    const fixOnFix = db.prepare(
      "SELECT * FROM metric_values WHERE metric_name = 'fix_on_fix_rate'"
    ).all() as any[];
    expect(fixOnFix.length).toBeGreaterThan(0);
    db.close();
  });

  it("computes scope creep metric", () => {
    const db = openDb(historyDir);
    const scopeCreep = db.prepare(
      "SELECT * FROM metric_values WHERE metric_name = 'scope_creep'"
    ).all() as any[];
    expect(scopeCreep.length).toBeGreaterThan(0);
    db.close();
  });

  it("computes time-to-commit", () => {
    const db = openDb(historyDir);
    const ttc = db.prepare(
      "SELECT * FROM metric_values WHERE metric_name = 'time_to_commit'"
    ).all() as any[];
    expect(ttc.length).toBeGreaterThan(0);
    db.close();
  });

  it("detects same-file churn (thrashing)", () => {
    const db = openDb(historyDir);
    const thrashing = db.prepare(
      "SELECT * FROM metric_values WHERE metric_name = 'same_file_churn'"
    ).all() as any[];
    expect(thrashing.length).toBeGreaterThan(0);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/metrics.test.ts`

- [ ] **Step 3: Implement metrics.ts**

```typescript
// src/util/metrics.ts
import type Database from "better-sqlite3";

export function computeBuiltinMetrics(db: Database.Database): void {
  // Clear existing built-in metrics
  db.prepare("DELETE FROM metric_values WHERE metric_name IN ('revert_rate', 'fix_on_fix_rate', 'scope_creep', 'time_to_commit', 'same_file_churn', 'dependency_churn')").run();

  const commits = db.prepare(
    "SELECT hash, message, timestamp, files_changed FROM commits ORDER BY timestamp ASC"
  ).all() as { hash: string; message: string; timestamp: string; files_changed: number }[];

  const insert = db.prepare(
    "INSERT INTO metric_values (commit_hash, metric_name, value, captured_at) VALUES (?, ?, ?, ?)"
  );

  const now = new Date().toISOString();
  const window = 10;

  db.transaction(() => {
    for (let i = 0; i < commits.length; i++) {
      const c = commits[i];
      const windowStart = Math.max(0, i - window + 1);
      const windowCommits = commits.slice(windowStart, i + 1);

      // Revert rate (rolling window)
      const reverts = windowCommits.filter(wc => /revert/i.test(wc.message)).length;
      const revertRate = windowCommits.length > 0 ? reverts / windowCommits.length : 0;
      insert.run(c.hash, "revert_rate", revertRate, now);

      // Fix-on-fix rate (commits with "fix" in message touching same files as recent commits)
      const fixes = windowCommits.filter(wc => /\bfix\b/i.test(wc.message)).length;
      const fixRate = windowCommits.length > 0 ? fixes / windowCommits.length : 0;
      insert.run(c.hash, "fix_on_fix_rate", fixRate, now);

      // Scope creep (files_changed trend)
      insert.run(c.hash, "scope_creep", c.files_changed, now);

      // Time-to-commit (minutes since previous commit)
      if (i > 0) {
        const prevTime = new Date(commits[i - 1].timestamp).getTime();
        const currTime = new Date(c.timestamp).getTime();
        const minutesBetween = (currTime - prevTime) / 60000;
        insert.run(c.hash, "time_to_commit", minutesBetween, now);
      }

      // Same-file churn (files edited 3+ times in last 5 commits)
      if (i >= 2) {
        const recentHashes = commits.slice(Math.max(0, i - 4), i + 1).map(rc => rc.hash);
        const placeholders = recentHashes.map(() => "?").join(",");
        const fileCounts = db.prepare(`
          SELECT file_path, COUNT(*) as cnt
          FROM commit_files
          WHERE commit_hash IN (${placeholders})
          GROUP BY file_path
          HAVING cnt >= 3
        `).all(...recentHashes) as { file_path: string; cnt: number }[];
        insert.run(c.hash, "same_file_churn", fileCounts.length, now);
      } else {
        insert.run(c.hash, "same_file_churn", 0, now);
      }
    }

    // Dependency churn
    const depCommits = db.prepare(`
      SELECT DISTINCT cf.commit_hash
      FROM commit_files cf
      WHERE cf.file_path IN ('package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Pipfile.lock', 'Cargo.lock')
    `).all() as { commit_hash: string }[];
    for (const dc of depCommits) {
      insert.run(dc.commit_hash, "dependency_churn", 1, now);
    }
  })();
}
```

- [ ] **Step 4: Wire into snapshot, build, test**

Add metrics phase to `src/commands/snapshot.ts` after analytics.

Run: `npm run build && npx vitest run tests/metrics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/util/metrics.ts src/commands/snapshot.ts tests/metrics.test.ts
git commit -m "feat: built-in LLM dev quality metrics engine"
```

---

### Task 2: Custom Metrics (metrics.json)

**Files:**
- Create: `src/util/detect.ts` (project type detection)
- Modify: `src/util/metrics.ts` (add custom metric processing)
- Create: `src/commands/metric.ts` (manual recording)

- [ ] **Step 1: Implement project type detection**

```typescript
// src/util/detect.ts
import { existsSync } from "fs";
import { join } from "path";

export type ProjectType = "nodejs" | "python" | "rust" | "go" | "generic";

export function detectProjectType(cwd: string): ProjectType {
  if (existsSync(join(cwd, "package.json"))) return "nodejs";
  if (existsSync(join(cwd, "requirements.txt")) || existsSync(join(cwd, "pyproject.toml"))) return "python";
  if (existsSync(join(cwd, "Cargo.toml"))) return "rust";
  if (existsSync(join(cwd, "go.mod"))) return "go";
  return "generic";
}

export function getDefaultMetrics(type: ProjectType): any[] {
  const base = [
    { name: "line_count", type: "git", pattern: "src/**/*", measure: "line_count", capture: "snapshot" },
    { name: "file_count", type: "git", pattern: "src/**/*", measure: "file_count", capture: "snapshot" },
  ];

  switch (type) {
    case "nodejs":
      return [...base,
        { name: "test_count", type: "command", command: "grep -r 'it\\|test\\|describe' tests/ --include='*.ts' -l | wc -l", capture: "snapshot" },
      ];
    case "python":
      return [...base,
        { name: "test_count", type: "command", command: "find tests -name 'test_*.py' | wc -l", capture: "snapshot" },
      ];
    default:
      return base;
  }
}
```

- [ ] **Step 2: Implement metric command for manual recording**

```typescript
// src/commands/metric.ts
import { Command } from "commander";
import { openDb } from "../util/db.js";
import { getLastCommitHash } from "../util/git.js";
import { join } from "path";

function write(msg: string): void { process.stdout.write(msg); }

export function metricCommand(): Command {
  const cmd = new Command("metric").description("Manual metric recording");

  cmd.command("record")
    .description("Record a metric value")
    .argument("<name>", "Metric name")
    .argument("<value>", "Metric value (number)")
    .action((name: string, value: string, opts: any) => {
      const cwd = process.cwd();
      const db = openDb(join(cwd, ".git-history"));
      const hash = getLastCommitHash(cwd);
      const numValue = parseFloat(value);

      if (isNaN(numValue)) {
        write("Error: Value must be a number.\n");
        process.exit(1);
      }

      db.prepare(
        "INSERT INTO metric_values (commit_hash, metric_name, value, captured_at) VALUES (?, ?, ?, ?)"
      ).run(hash, name, numValue, new Date().toISOString());

      write(`Recorded ${name} = ${numValue} for commit ${hash.slice(0, 7)}\n`);
      db.close();
    });

  return cmd;
}
```

- [ ] **Step 3: Register, build, test**

Run: `npm run build && npm test`

- [ ] **Step 4: Commit**

```bash
git add src/util/detect.ts src/commands/metric.ts src/index.ts
git commit -m "feat: custom metrics and manual metric recording"
```

---

### Task 3: Embedding Provider Abstraction

**Files:**
- Create: `src/util/embedding.ts`
- Modify: `src/util/search-hybrid.ts` (add vector search + RRF)

- [ ] **Step 1: Implement embedding.ts**

```typescript
// src/util/embedding.ts
import { readConfig } from "./config.js";

export interface EmbeddingResult {
  vector: number[];
  model: string;
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult | null> {
  const config = readConfig();
  if (!config?.embedding?.enabled || !config.embedding.url) return null;

  const apiKey = config.embedding.apiKey
    ? (process.env[config.embedding.apiKey.replace("${", "").replace("}", "")] || config.embedding.apiKey)
    : undefined;

  try {
    const response = await fetch(config.embedding.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.embedding.model,
        input: text,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json() as any;

    // Handle OpenAI format
    if (data.data?.[0]?.embedding) {
      return { vector: data.data[0].embedding, model: config.embedding.model };
    }
    // Handle Ollama format
    if (data.embedding) {
      return { vector: data.embedding, model: config.embedding.model };
    }

    return null;
  } catch {
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}
```

- [ ] **Step 2: Add vector search and RRF to search-hybrid.ts**

Modify `src/util/search-hybrid.ts`:
- Add `searchVector()` function that queries `embeddings` table
- Add `reciprocalRankFusion()` to merge BM25 + vector results
- Add `hybridSearch()` that calls both and fuses

- [ ] **Step 3: Implement embed command**

```typescript
// src/commands/embed.ts
import { Command } from "commander";
import { openDb } from "../util/db.js";
import { generateEmbedding } from "../util/embedding.js";
import { join } from "path";

function write(msg: string): void { process.stdout.write(msg); }

export function embedCommand(): Command {
  return new Command("embed")
    .description("Generate/refresh embeddings for commits")
    .option("--limit <n>", "Max commits to embed", "100")
    .option("--force", "Re-embed already embedded commits")
    .action(async (opts: { limit: string; force?: boolean }) => {
      const db = openDb(join(process.cwd(), ".git-history"));
      const limit = parseInt(opts.limit, 10);

      try {
        // Get commits needing embedding
        let query = "SELECT hash, message FROM commits";
        if (!opts.force) {
          query += " WHERE hash NOT IN (SELECT commit_hash FROM embeddings)";
        }
        query += ` LIMIT ${limit}`;

        const commits = db.prepare(query).all() as { hash: string; message: string }[];

        if (commits.length === 0) {
          write("All commits already embedded.\n");
          return;
        }

        write(`Embedding ${commits.length} commits...\n`);
        let success = 0;

        for (const c of commits) {
          const result = await generateEmbedding(c.message);
          if (result) {
            const vectorBlob = Buffer.from(new Float32Array(result.vector).buffer);
            db.prepare(`
              INSERT OR REPLACE INTO embeddings (commit_hash, content_type, vector, model, created_at)
              VALUES (?, 'message', ?, ?, ?)
            `).run(c.hash, vectorBlob, result.model, new Date().toISOString());
            success++;
          }
          // Rate limit
          await new Promise(r => setTimeout(r, 100));
        }

        write(`Embedded ${success}/${commits.length} commits.\n`);
      } finally {
        db.close();
      }
    });
}
```

- [ ] **Step 4: Register, build, test**

- [ ] **Step 5: Commit**

```bash
git add src/util/embedding.ts src/util/search-hybrid.ts src/commands/embed.ts src/index.ts
git commit -m "feat: embedding provider abstraction and vector search"
```

---

### Task 4: LLM Enrichment Pipeline

**Files:**
- Create: `src/commands/enrich.ts`
- Create: `src/commands/why.ts`
- Create: `tests/enrichment.test.ts`
- Create: `tests/commands/why.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/enrichment.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { openDb } from "../src/util/db.js";
import { createTestRepo } from "./fixtures/create-test-repo.js";
import { cleanupTempDir } from "./helpers/setup.js";
import { join, resolve } from "path";
import { execSync } from "child_process";

describe("enrichment", () => {
  let repoDir: string;

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${resolve("dist/index.js")} snapshot`, { cwd: repoDir, encoding: "utf-8" });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("enrich --dry-run shows what would be enriched", () => {
    const output = execSync(
      `node ${resolve("dist/index.js")} enrich --dry-run`,
      { cwd: repoDir, encoding: "utf-8" }
    );
    expect(output).toContain("commits");
  });

  it("why command without enrichment shows raw data", () => {
    const db = openDb(join(repoDir, ".git-history"));
    const commit = db.prepare("SELECT hash FROM commits LIMIT 1").get() as any;
    db.close();

    const output = execSync(
      `node ${resolve("dist/index.js")} why ${commit.hash}`,
      { cwd: repoDir, encoding: "utf-8" }
    );
    expect(output).toContain(commit.hash.slice(0, 7));
  });
});
```

- [ ] **Step 2: Implement enrich.ts**

```typescript
// src/commands/enrich.ts
import { Command } from "commander";
import { openDb } from "../util/db.js";
import { readConfig } from "../util/config.js";
import { join } from "path";

function write(msg: string): void { process.stdout.write(msg); }

export function enrichCommand(): Command {
  return new Command("enrich")
    .description("Backfill LLM enrichments for commits")
    .argument("[range]", "Commit range (e.g., HEAD~10..HEAD)")
    .option("--dry-run", "Show what would be enriched")
    .option("--limit <n>", "Max commits to enrich", "50")
    .action(async (range: string | undefined, opts: { dryRun?: boolean; limit: string }) => {
      const cwd = process.cwd();
      const db = openDb(join(cwd, ".git-history"));
      const limit = parseInt(opts.limit, 10);

      try {
        // Get unenriched commits
        let query = "SELECT hash, message FROM commits WHERE hash NOT IN (SELECT commit_hash FROM enrichments)";
        if (range) {
          // Parse range and filter
          const { execSync } = await import("child_process");
          try {
            const hashes = execSync(`git rev-list ${range}`, { cwd, encoding: "utf-8" }).trim().split("\n");
            const placeholders = hashes.map(() => "?").join(",");
            query = `SELECT hash, message FROM commits WHERE hash IN (${placeholders}) AND hash NOT IN (SELECT commit_hash FROM enrichments)`;
            const commits = db.prepare(query).all(...hashes) as any[];

            if (opts.dryRun) {
              write(`Would enrich ${commits.length} commits in range ${range}.\n`);
              for (const c of commits.slice(0, 10)) {
                write(`  ${c.hash.slice(0, 7)} ${c.message}\n`);
              }
              if (commits.length > 10) write(`  ... and ${commits.length - 10} more\n`);
              return;
            }
          } catch {
            write(`Error: Invalid range "${range}".\n`);
            return;
          }
        }

        const commits = db.prepare(query + ` LIMIT ${limit}`).all() as { hash: string; message: string }[];

        if (opts.dryRun) {
          write(`Would enrich ${commits.length} commits.\n`);
          for (const c of commits.slice(0, 10)) {
            write(`  ${c.hash.slice(0, 7)} ${c.message}\n`);
          }
          if (commits.length > 10) write(`  ... and ${commits.length - 10} more\n`);
          return;
        }

        const config = readConfig();
        if (!config?.enrichment?.enabled || !config.enrichment.url) {
          write("Enrichment not configured. Run `git-skill install` to set up LLM provider.\n");
          write(`${commits.length} commits would be enriched.\n`);
          return;
        }

        write(`Enriching ${commits.length} commits...\n`);
        const apiKey = config.enrichment.apiKey
          ? (process.env[config.enrichment.apiKey.replace("${", "").replace("}", "")] || config.enrichment.apiKey)
          : undefined;

        let success = 0;
        for (const c of commits) {
          try {
            const files = db.prepare(
              "SELECT file_path, status FROM commit_files WHERE commit_hash = ?"
            ).all(c.hash) as { file_path: string; status: string }[];

            const prompt = `Analyze this git commit. Respond with JSON:
- intent: one sentence describing WHY this change was made
- reasoning: what problem does this solve
- category: one of [bugfix, feature, refactor, cleanup, docs, test, config]
- alternatives_considered: what other approaches could have been taken (or "none apparent")

Commit: ${c.hash}
Message: ${c.message}
Files changed: ${files.map(f => `${f.status} ${f.file_path}`).join(", ")}`;

            const response = await fetch(config.enrichment.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
              },
              body: JSON.stringify({
                model: config.enrichment.model,
                messages: [{ role: "user", content: prompt }],
                max_tokens: config.enrichment.maxTokensPerCommit,
              }),
            });

            if (response.ok) {
              const data = await response.json() as any;
              const content = data.choices?.[0]?.message?.content || "";
              // Try to parse JSON from response
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const enrichment = JSON.parse(jsonMatch[0]);
                db.prepare(`
                  INSERT OR REPLACE INTO enrichments (commit_hash, intent, reasoning, category, alternatives_considered)
                  VALUES (?, ?, ?, ?, ?)
                `).run(c.hash, enrichment.intent, enrichment.reasoning, enrichment.category, enrichment.alternatives_considered);
                success++;
              }
            }
          } catch {
            // Skip individual failures
          }
          // Rate limit
          await new Promise(r => setTimeout(r, 200));
        }

        write(`Enriched ${success}/${commits.length} commits.\n`);
      } finally {
        db.close();
      }
    });
}
```

- [ ] **Step 3: Implement why.ts**

```typescript
// src/commands/why.ts
import { Command } from "commander";
import { openDb } from "../util/db.js";
import { join } from "path";

function write(msg: string): void { process.stdout.write(msg); }

export function whyCommand(): Command {
  return new Command("why")
    .description("Pull enrichment — intent, reasoning, alternatives for a commit")
    .argument("<hash>", "Commit hash (full or short)")
    .option("--json", "Output as JSON")
    .action((hash: string, opts: { json?: boolean }) => {
      const db = openDb(join(process.cwd(), ".git-history"));

      try {
        // Find commit (support short hash)
        const commit = db.prepare(
          "SELECT * FROM commits WHERE hash = ? OR hash LIKE ?"
        ).get(hash, `${hash}%`) as any;

        if (!commit) {
          write(`Commit ${hash} not found in history. Run \`git-skill snapshot\` first.\n`);
          return;
        }

        const enrichment = db.prepare(
          "SELECT * FROM enrichments WHERE commit_hash = ?"
        ).get(commit.hash) as any;

        const files = db.prepare(
          "SELECT file_path, status, insertions, deletions FROM commit_files WHERE commit_hash = ?"
        ).all(commit.hash) as any[];

        const result = {
          hash: commit.hash,
          message: commit.message,
          author: commit.author,
          timestamp: commit.timestamp,
          files: files,
          enrichment: enrichment || null,
        };

        if (opts.json) {
          write(JSON.stringify(result, null, 2) + "\n");
          return;
        }

        write(`\nCommit: ${commit.hash.slice(0, 7)}\n`);
        write(`Message: ${commit.message}\n`);
        write(`Author: ${commit.author} (${commit.timestamp.slice(0, 10)})\n`);
        write(`Files: ${files.length} changed (+${commit.insertions}/-${commit.deletions})\n`);

        if (enrichment) {
          write(`\nIntent: ${enrichment.intent}\n`);
          write(`Reasoning: ${enrichment.reasoning}\n`);
          write(`Category: ${enrichment.category}\n`);
          write(`Alternatives: ${enrichment.alternatives_considered}\n`);
        } else {
          write(`\nNo enrichment data. Run \`git-skill enrich\` to add.\n`);
        }

        write("\nFiles:\n");
        for (const f of files) {
          write(`  [${f.status}] ${f.file_path} (+${f.insertions}/-${f.deletions})\n`);
        }
        write("\n");
      } finally {
        db.close();
      }
    });
}
```

- [ ] **Step 4: Register, build, test**

Run: `npm run build && npx vitest run tests/enrichment.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/enrich.ts src/commands/why.ts tests/enrichment.test.ts tests/commands/why.test.ts src/index.ts
git commit -m "feat: LLM enrichment pipeline and why command"
```

---

### Task 5: Release Notes Generator

**Files:**
- Create: `src/commands/release-notes.ts`
- Create: `tests/commands/release-notes.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/commands/release-notes.test.ts
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

  it("generates release notes for a tag range", () => {
    const output = execSync(`node ${cliPath} release-notes v1.0..v1.1`, { cwd: repoDir, encoding: "utf-8" });
    expect(output).toContain("Release Notes");
    expect(output).toContain("v1.0");
    expect(output).toContain("v1.1");
  });

  it("includes file impact section", () => {
    const output = execSync(`node ${cliPath} release-notes v1.0..v1.1`, { cwd: repoDir, encoding: "utf-8" });
    expect(output.length).toBeGreaterThan(100);
  });

  it("outputs JSON with --json", () => {
    const output = execSync(`node ${cliPath} release-notes v1.0..v1.1 --json`, { cwd: repoDir, encoding: "utf-8" });
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("range");
    expect(parsed).toHaveProperty("commits");
  });
});
```

- [ ] **Step 2: Implement release-notes.ts**

Aggregates all data between two refs:
1. Get commits in range via `git rev-list`
2. Query commits, files, decision_points, enrichments from SQLite
3. Group commits by category (from enrichments) or infer from message
4. Compute file impact (most changed, new, deleted)
5. Include health report from metric_values
6. Output markdown or JSON

- [ ] **Step 3: Register, build, test**

Run: `npm run build && npx vitest run tests/commands/release-notes.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/commands/release-notes.ts tests/commands/release-notes.test.ts src/index.ts
git commit -m "feat: release notes generator with health report"
```

---

### Task 6: Approve Command

**Files:**
- Create: `src/commands/approve.ts`
- Create: `tests/commands/approve.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/commands/approve.test.ts
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
    const settingsPath = join(repoDir, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.permissions.allow).toContain("Bash(git-skill search:*)");
    expect(settings.permissions.allow).toContain("Bash(git-skill timeline:*)");
    expect(settings.permissions.allow).toContain("Bash(git-skill doctor:*)");
  });

  it("does not include write commands", () => {
    const settingsPath = join(repoDir, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    const allowed = settings.permissions.allow;
    expect(allowed).not.toContain("Bash(git-skill snapshot:*)");
    expect(allowed).not.toContain("Bash(git-skill enrich:*)");
  });
});
```

- [ ] **Step 2: Implement approve.ts**

Pre-approves read-only commands per the spec's permission list. Writes to `.claude/settings.json` (merges with existing). Supports `--global` and `--remove` flags.

- [ ] **Step 3: Register, build, test**

- [ ] **Step 4: Commit**

```bash
git add src/commands/approve.ts tests/commands/approve.test.ts src/index.ts
git commit -m "feat: approve command for permission pre-approval"
```

---

### Task 7: Docs Command (CLAUDE.md Generation)

**Files:**
- Create: `src/commands/docs.ts`
- Create: `src/templates/walkthrough.ts`

- [ ] **Step 1: Implement docs.ts**

Generates the full git-skill CLI reference for CLAUDE.md injection. Follows same pattern as supabase-skill's `getSkillDoc()`. Includes:
- Command reference table
- Common usage patterns
- Global flags
- Active alerts (from doctor checks)

```typescript
// src/commands/docs.ts
import { Command } from "commander";

function write(msg: string): void { process.stdout.write(msg); }

export function getSkillDoc(): string {
  return `## git-skill (Git History Intelligence)

### Quick Reference

| Command | Use For |
|---------|---------|
| \`git-skill search <query>\` | Search commit history (BM25 + vector) |
| \`git-skill timeline <path>\` | Full file/directory evolution |
| \`git-skill blame <path>\` | Enhanced blame with enrichments |
| \`git-skill trends\` | Metric trends dashboard |
| \`git-skill hotspots\` | Files with most churn |
| \`git-skill coupling <path>\` | Co-changed file analysis |
| \`git-skill decisions\` | Major decision points |
| \`git-skill experts <path>\` | Who has most context |
| \`git-skill diff-summary <range>\` | Range summary |
| \`git-skill why <hash>\` | Commit intent/reasoning |
| \`git-skill regression\` | Change-point detection |
| \`git-skill doctor\` | Health check |

### Write Commands (require confirmation)
| \`git-skill snapshot\` | Full re-index |
| \`git-skill enrich [range]\` | Backfill LLM enrichments |
| \`git-skill release-notes <range>\` | Generate release notes |
| \`git-skill embed\` | Generate embeddings |

### Global Flags
- \`--json\` — structured output for agents
- \`--limit N\` — cap results
- \`--since <date>\` / \`--until <date>\` — time filter
- \`--author <name>\` — filter by author`;
}

export function docsCommand(): Command {
  return new Command("docs")
    .description("Output CLAUDE.md instruction snippet")
    .option("--format <format>", "Output format (claude/plain)", "plain")
    .action((opts: { format: string }) => {
      write(getSkillDoc() + "\n");
    });
}
```

- [ ] **Step 2: Implement walkthrough template**

```typescript
// src/templates/walkthrough.ts
export const WALKTHROUGH = `# Git History Walkthrough

Use git-skill to explore this repository's history.

## Quick Start
\`\`\`
git-skill doctor          # Check setup health
git-skill hotspots        # Find churning files
git-skill trends          # View metric trends
git-skill search "auth"   # Search history
\`\`\`
`;
```

- [ ] **Step 3: Register, build, test**

- [ ] **Step 4: Commit**

```bash
git add src/commands/docs.ts src/templates/walkthrough.ts src/index.ts
git commit -m "feat: docs command and CLAUDE.md generation"
```

---

### Task 8: Install Command (Global Wizard)

**Files:**
- Create: `src/commands/install.ts`
- Create: `tests/commands/install.test.ts`

- [ ] **Step 1: Implement install.ts**

Interactive global setup wizard following supabase-skill pattern:
1. Check git is available
2. Configure embedding provider (optional)
3. Configure enrichment LLM (optional)
4. Write config to `~/.config/git-skill/config.json`
5. Update `~/.claude/CLAUDE.md` with skill doc
6. Optionally run `init` in current directory

Uses readline for interactive prompts. Supports `--ci` for non-interactive mode.

- [ ] **Step 2: Register, build, test**

- [ ] **Step 3: Commit**

```bash
git add src/commands/install.ts tests/commands/install.test.ts src/index.ts
git commit -m "feat: install command (global setup wizard)"
```

---

### Task 9: Cron, Update, Uninstall Commands

**Files:**
- Create: `src/commands/cron.ts`
- Create: `src/commands/update.ts`
- Create: `src/commands/uninstall.ts`

- [ ] **Step 1: Implement cron.ts**

Sets up nightly `git-skill snapshot` via crontab. Pattern: `0 3 * * * cd /path/to/repo && git-skill snapshot`. Supports `--status` to check current cron entry, `--remove` to delete.

- [ ] **Step 2: Implement update.ts**

Self-update via `npm install -g @m2015agg/git-skill@latest`. Shows current vs latest version. Supports `--check` for dry run.

- [ ] **Step 3: Implement uninstall.ts**

Clean removal:
1. Remove post-commit hook
2. Remove `.git-history/` directory
3. Remove CLAUDE.md sections
4. Remove cron entry
5. Confirm before destructive actions

- [ ] **Step 4: Register all, build, test**

- [ ] **Step 5: Commit**

```bash
git add src/commands/cron.ts src/commands/update.ts src/commands/uninstall.ts src/index.ts
git commit -m "feat: cron, update, and uninstall commands"
```

---

### Task 10: Wire Init Command to Full Setup

**Files:**
- Modify: `src/commands/init.ts`

- [ ] **Step 1: Update init to include all setup steps**

Update `init` to include:
1. Install hook (already done)
2. Update .gitignore (already done)
3. Write CLAUDE.md with skill doc
4. Write `.claude/commands/git-history.md` with walkthrough
5. Run snapshot (already done)
6. Run approve
7. Optionally run cron

- [ ] **Step 2: Build and test init end-to-end**

Run: `npm run build && npx vitest run tests/init.test.ts`

- [ ] **Step 3: Commit**

```bash
git add src/commands/init.ts
git commit -m "feat: full init with CLAUDE.md, approve, walkthrough"
```

---

### Task 11: Full Test Suite + E2E Verification

- [ ] **Step 1: Run all tests**

Run: `npm run build && npm test`
Expected: ALL PASS

- [ ] **Step 2: Link and test globally**

Run: `npm run link`

- [ ] **Step 3: Full end-to-end test**

```bash
cd /tmp && rm -rf test-final && git init test-final && cd test-final
echo '{"name":"test"}' > package.json
echo "hello" > src/index.ts && mkdir -p src
git add . && git commit -m "Initial commit"

# Make some commits
for i in {1..5}; do
  echo "change $i" >> src/index.ts
  git add . && git commit -m "Update $i"
done

# Full setup
git-skill init --skip-cron

# Query commands
git-skill doctor
git-skill search "Update"
git-skill timeline src/index.ts
git-skill hotspots
git-skill trends
git-skill coupling src/index.ts
git-skill decisions
git-skill experts src/
git-skill diff-summary HEAD~3..HEAD
git-skill why HEAD

# Write commands
git-skill snapshot
git-skill release-notes HEAD~5..HEAD
git-skill metric record test_metric 42
git-skill enrich --dry-run

# Admin
git-skill docs
git-skill doctor --json
```

Expected: All commands succeed

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found in Plan 3 final testing"
```

- [ ] **Step 5: Final version bump and tag**

```bash
# Update version in package.json to 0.1.0
git add package.json
git commit -m "chore: version 0.1.0"
git tag -a v0.1.0 -m "Initial release"
```
