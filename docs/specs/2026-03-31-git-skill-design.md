# Design Spec: @m2015agg/git-skill

**Date:** 2026-03-31
**Status:** Approved
**Author:** Matt + Claude

## Overview

Git history intelligence for LLMs. A standalone CLI tool that gives AI agents institutional memory over a codebase's evolution, decisions, and health trends. Follows the proven `supabase-skill` architecture — SQLite + FTS5 local cache, CLAUDE.md injection, pre-approved read commands.

**Problem:** LLMs start every session with zero knowledge of how a codebase evolved. Git has all the data but it's opaque — querying it requires dozens of slow, token-heavy commands that yield only surface-level results. Nobody tracks whether LLM-assisted development is getting better or worse over time.

**Solution:** A three-layer indexed cache (raw git → derived analytics → LLM enrichments) with BM25 + optional vector hybrid search. Post-commit hook for real-time capture, snapshot for deep analysis, and built-in quality metrics that detect regressions automatically.

## Package

- **Name:** `@m2015agg/git-skill`
- **Binary:** `git-skill`
- **Install:** `npm install -g @m2015agg/git-skill`
- **Setup:** `git-skill init` (one command, working in 30 seconds)

## Dependencies

| Package | Purpose |
|---------|---------|
| `commander` | CLI framework (same as supabase-skill) |
| `better-sqlite3` | SQLite + FTS5 + WAL mode |
| `simple-statistics` | Change-point detection, rolling averages, trend analysis |

Embeddings use `fetch()` against user-configured URL — no SDK dependency.

---

## Data Architecture

### SQLite Schema (`.git-history/history.db`)

#### Layer 1 — Raw Git Data (post-commit hook)

| Table | Columns | Source |
|-------|---------|--------|
| `commits` | hash, message, author, email, timestamp, branch, parent_hash, merge_commit, insertions, deletions, files_changed | `git log --stat` |
| `commit_files` | commit_hash, file_path, status (A/M/D/R), insertions, deletions, old_path (for renames) | `git diff-tree` |
| `branches` | name, head_hash, created_at, is_active | `git branch` |
| `tags` | name, hash, timestamp, message | `git tag` |

#### Layer 2 — Derived Analytics (snapshot/cron)

| Table | Columns | Computed From |
|-------|---------|---------------|
| `file_evolution` | file_path, first_seen, last_modified, total_commits, total_churn, current_size, growth_rate | commits + commit_files |
| `churn_hotspots` | file_path, period (week/month), commits, insertions, deletions, unique_authors | commit_files grouped |
| `coupling` | file_a, file_b, co_commit_count, coupling_score | commit_files co-occurrence (commits with >50 files excluded to avoid noise from bulk refactors) |
| `trends` | metric_name, period, value, delta, direction (up/down/stable) | Aggregated stats |
| `decision_points` | commit_hash, type (revert/big_refactor/merge_conflict/architecture_change), impact_score, files_affected | Heuristic detection |
| `author_expertise` | author, file_pattern, commit_count, last_touched, expertise_score | commit_files by author |

#### Layer 3 — LLM Enrichment (optional, Claude Code)

| Table | Columns | Source |
|-------|---------|--------|
| `enrichments` | commit_hash, intent, reasoning, category (bugfix/feature/refactor/cleanup), alternatives_considered, session_context | Claude Code at commit time |

#### Search Layer

| Table | Columns | Purpose |
|-------|---------|---------|
| `history_fts` | hash, type, path, message, detail | FTS5 virtual table (porter + unicode61 tokenizer) |
| `embeddings` | commit_hash, content_type (message/diff_summary/enrichment), vector (blob), model, created_at | Optional vector search |
| `embed_queue` | commit_hash, queued_at, status (pending/processing/done/failed), error | Queue for async embedding |

#### Metrics Layer

| Table | Columns | Purpose |
|-------|---------|---------|
| `metric_values` | commit_hash, metric_name, value (float), captured_at | Built-in + custom metric storage |

#### Infrastructure

| Table | Columns | Purpose |
|-------|---------|---------|
| `schema_meta` | key, value | Schema version tracking for migrations between versions |

---

## Search: BM25 + Vector Hybrid

| Method | Storage | Use Case |
|--------|---------|----------|
| **BM25** (FTS5) | SQLite built-in | Keyword search, exact matches, fast default that always works |
| **Vector** (embeddings) | `embeddings` table, cosine similarity | Semantic search — "auth changes" finds "login", "session", "JWT" |

**Default:** BM25 only. Zero config required.
**Opt-in:** Vector search via embedding provider configuration.
**Fusion:** When both available, results merged via Reciprocal Rank Fusion (RRF).
**Fallback:** If embedding provider is down, BM25 still works.

### Embedding Configuration (`.git-history/config.json`)

```json
{
  "embedding": {
    "enabled": false,
    "provider": "openai",
    "model": "text-embedding-3-small",
    "url": "http://localhost:11434/api/embed",
    "apiKey": "${GIT_SKILL_EMBED_KEY}",
    "dimensions": 1536
  }
}
```

- `url` — works for OpenAI, Ollama, LMStudio, any OpenAI-compatible endpoint
- `apiKey` — optional, pulled from env var. Not needed for local models

---

## Hook & Indexing Pipeline

### Post-Commit Hook (lightweight, <500ms)

Installed at `.git/hooks/post-commit`:

```sh
#!/bin/sh
git-skill capture --hook 2>/dev/null &
```

- Runs in background — never blocks the commit
- Captures: hash, message, author, timestamp, branch, diff-stat, file list
- Writes one row to `commits` + N rows to `commit_files`
- If embedding enabled, queues commit in `embed_queue` table
- Uses `INSERT OR IGNORE` on commit hash for idempotency (handles rapid commits)
- Opens db with `PRAGMA busy_timeout = 5000` to handle concurrent writes (hook + snapshot)
- Fails silently — never breaks user's workflow

### Snapshot Pipeline (`git-skill snapshot`)

Runs in phases:

1. **Backfill** — scan `git log` for commits not yet in SQLite. Handles existing history on first run.
2. **Analytics** — recompute: `file_evolution`, `churn_hotspots`, `coupling`, `trends`, `decision_points`, `author_expertise`
3. **Embeddings** — process `embed_queue` if provider configured. Batch embed commit messages + diff summaries.
4. **FTS rebuild** — rebuild `history_fts` from all content

First snapshot on large repo (10k+ commits): 30-60s. Incremental: 2-5s.

### Decision Point Detection (heuristics)

| Signal | Type | Detection |
|--------|------|-----------|
| `git revert` in message | revert | Regex |
| 20+ files changed | big_refactor | Threshold |
| Merge conflict markers resolved | merge_conflict | Diff content |
| New top-level directory | architecture_change | commit_files paths |
| Dependency file changed (package.json, requirements.txt, Cargo.toml) | dependency_change | Known filenames |
| `.env`, config, or infra files changed | config_change | Known patterns |
| Deletions > 2x insertions | major_removal | Diff stats |
| First commit touching a file area after 90+ days dormant | resurrection | file_evolution timestamps |

Each gets an `impact_score` based on files affected × churn volume.

---

## Built-in LLM Development Quality Metrics

Always on, zero config. Computed from git data + enrichments.

**Git-derived metrics (always available):**

| Metric | What it measures | Detected from |
|--------|-----------------|---------------|
| Revert rate | How often commits get reverted | `git revert` in commit messages |
| Fix-on-fix rate | Commits fixing previous commit's bug (churn) | Messages ("fix", "oops"), same-file re-edits within N commits |
| Scope creep rate | Commits touching more files over time | `commit_files` count trending up |
| Time-to-commit | Time between commits lengthening | Commit timestamps |
| Same-file churn | Same file 3+ times in a day = thrashing | `commit_files` frequency |
| Dependency churn | Lock files changing too often | package-lock.json edit frequency |

**Enrichment-dependent metrics (require `enrich` — shown as "N/A" when unavailable):**

| Metric | What it measures | Detected from |
|--------|-----------------|---------------|
| Conversation length per commit | Tasks taking more back-and-forth? | Enrichment `session_context` turns |
| Decision reversal rate | Approach changes mid-task | Enrichments where alternatives = previous intent |

Metrics that depend on enrichments display "N/A - requires enrichment data" in `trends` and `doctor` output rather than misleading zeros.

### Alert Examples

```
[WARNING] fix-on-fix rate spiked to 40% this week (baseline: 12%)
  src/auth/ has been edited 6 times in 3 commits — possible thrashing

[WARNING] time-to-commit increasing: 45min avg → 2.1hr avg over last 10 commits
  Coincides with introduction of new payment module (commit abc123)

[WARNING] revert rate: 3 reverts in last 15 commits (20%, baseline 5%)
  All in src/api/middleware — consider reviewing approach
```

### Alert Surfaces

1. `git-skill doctor` — shows active alerts
2. `git-skill trends` — full dashboard
3. CLAUDE.md injection — critical alerts at session start
4. `git-skill release-notes` — health section
5. Post-commit hook output — one-line warning if threshold crossed

---

## Custom Metrics

User-defined metrics in `.git-history/metrics.json`:

```json
{
  "metrics": [
    {
      "name": "build_time_seconds",
      "type": "command",
      "command": "npm run build 2>&1 | grep -oP 'Done in \\K[0-9.]+'",
      "capture": "post-commit",
      "alert": { "direction": "up", "threshold_pct": 50 }
    },
    {
      "name": "test_coverage_pct",
      "type": "file",
      "path": "coverage/coverage-summary.json",
      "jq": ".total.lines.pct",
      "capture": "snapshot",
      "alert": { "direction": "down", "threshold_pct": 10 }
    },
    {
      "name": "src_line_count",
      "type": "git",
      "pattern": "src/**/*.ts",
      "measure": "line_count",
      "capture": "snapshot"
    }
  ]
}
```

### Metric Types

| Source | How | Example |
|--------|-----|---------|
| `command` | Run shell command, capture number | Build time, lint errors |
| `file` | Read number from file (jq path) | Coverage %, bundle size |
| `git` | Computed from repo state | Line count, file count matching pattern |

### Capture Timing

- `"post-commit"` — runs in hook, must be <2s or skipped with warning
- `"snapshot"` — runs during `git-skill snapshot`, can be slow
- `"manual"` — only via `git-skill metric record <name> <value>`

### Setup

`git-skill init` detects project type and suggests defaults:

- **Node.js** → build time, test coverage, dependency count, bundle size
- **Python** → test coverage, lint errors, line count
- **Rust** → build time, clippy warnings, binary size
- **Generic** → line count, file count, TODO count

---

## Command Structure

### Setup Commands

| Command | Description |
|---------|-------------|
| `git-skill install` | Global wizard — configure embedding provider, write `~/.claude/CLAUDE.md` |
| `git-skill init` | Per-project — install hook, initial snapshot, CLAUDE.md, approve commands, optional cron |
| `git-skill doctor` | Health check — hook, snapshot freshness, db integrity, embedding reachable, active alerts |
| `git-skill update` | Self-update |
| `git-skill uninstall` | Remove hooks, cron, CLAUDE.md sections, `.git-history/` |

### Query Commands (pre-approved, no prompts)

| Command | Example | Answers |
|---------|---------|---------|
| `git-skill search <query>` | `search "auth refactor"` | BM25 + vector hybrid, returns commits/files/enrichments |
| `git-skill timeline <path>` | `timeline src/auth/` | Full evolution — every commit, churn, growth |
| `git-skill blame <path>` | `blame src/api.ts` | Enhanced blame — who, when, why (pulls enrichments) |
| `git-skill trends` | `trends --period weekly` | Metrics over time with direction arrows |
| `git-skill hotspots` | `hotspots --period month` | Files with most churn |
| `git-skill coupling` | `coupling src/auth.ts` | Files that always change together |
| `git-skill decisions` | `decisions --type revert` | Big decision points |
| `git-skill experts <path>` | `experts src/payments/` | Who has most context |
| `git-skill diff-summary <range>` | `diff-summary v1.2..v1.3` | LLM-friendly range summary |
| `git-skill why <hash>` | `why abc123` | Pull enrichment — intent, reasoning, alternatives |
| `git-skill regression <metric>` | `regression --files-per-commit` | Detect trend shift, pinpoint the commit |

### Write Commands

| Command | Description |
|---------|-------------|
| `git-skill snapshot` | Full re-index — rebuild all derived analytics |
| `git-skill enrich <range>` | Backfill LLM enrichments for existing commits |
| `git-skill release-notes <range>` | Aggregated release notes from all data sources |
| `git-skill embed` | Generate/refresh embeddings |
| `git-skill metric record <name> <value>` | Manual metric recording |

### Global Flags

- `--json` — structured output for agents
- `--limit N` — cap results
- `--since <date>` / `--until <date>` — time filter
- `--author <name>` — filter by author
- `--branch <name>` — filter by branch
- `--depth N` — traversal depth for timeline/coupling

---

## Release Notes (`git-skill release-notes <range>`)

Aggregates all data sources between two refs:

### Input Sources

1. All commits in range + enrichments (intent, reasoning)
2. Decision points (reverts, refactors, architecture changes)
3. File evolution (growth, deletion, restructuring)
4. Metric trends (improvements, degradations)
5. Author expertise shifts
6. Coupling changes

### Output Format

```markdown
# Release Notes: v1.2 → v1.3

## Summary
[LLM-generated narrative]

## Features
- [Grouped by intent from enrichments]

## Fixes
- [With root cause from enrichments]

## Architecture Changes
- [Decision points with reasoning]

## Health Report
- [WARNING] fix-on-fix rate elevated in src/auth (3 cycles)
- [OK] test coverage up 4%
- [OK] time-to-commit stable

## Decision Log
- Switched from JWT to sessions (abc123) — reasoning: [enrichment]
- Reverted Redis caching (def456) — reasoning: [enrichment]

## File Impact
- Most changed: src/auth/ (47 edits across 12 commits)
- New modules: src/payments/, src/notifications/
- Deleted: src/legacy-auth/
```

---

## Permission Pre-Approval (`git-skill approve`)

Writes to `.claude/settings.json` (project or `--global`):

```json
{
  "permissions": {
    "allow": [
      "Bash(git-skill search:*)",
      "Bash(git-skill timeline:*)",
      "Bash(git-skill blame:*)",
      "Bash(git-skill trends:*)",
      "Bash(git-skill hotspots:*)",
      "Bash(git-skill coupling:*)",
      "Bash(git-skill decisions:*)",
      "Bash(git-skill experts:*)",
      "Bash(git-skill diff-summary:*)",
      "Bash(git-skill why:*)",
      "Bash(git-skill regression:*)",
      "Bash(git-skill doctor:*)",
      "Bash(git-skill metric record:*)"
    ]
  }
}
```

Write commands (`snapshot`, `enrich`, `release-notes`, `embed`) are NOT pre-approved — they modify data and should require user confirmation.

---

## LLM Enrichment Pipeline (`git-skill enrich`)

### How it works

The `enrich` command uses the same embedding provider config pattern to call an LLM for commit analysis:

```json
{
  "enrichment": {
    "enabled": false,
    "url": "https://api.openai.com/v1/chat/completions",
    "model": "gpt-4o-mini",
    "apiKey": "${GIT_SKILL_LLM_KEY}",
    "batchSize": 10,
    "maxTokensPerCommit": 500
  }
}
```

- `url` — any OpenAI-compatible chat endpoint (OpenAI, Ollama, local LLM)
- `apiKey` — optional, from env var
- When run inside Claude Code session, can use Claude directly (no API needed)

### Prompt template

For each commit, sends the diff + message to the LLM with:

```
Analyze this git commit. Respond with JSON:
- intent: one sentence describing WHY this change was made
- reasoning: what problem does this solve
- category: one of [bugfix, feature, refactor, cleanup, docs, test, config]
- alternatives_considered: what other approaches could have been taken (or "none apparent")

Commit: {hash}
Message: {message}
Files changed: {file_list}
Diff (truncated to 2000 chars): {diff}
```

### Controls

- `git-skill enrich --dry-run` — show what would be enriched, estimated token cost
- `git-skill enrich --limit 50` — cap number of commits per run
- `git-skill enrich HEAD~10..HEAD` — specific range only
- Skips already-enriched commits automatically

---

## Security: Custom Command Metrics

Custom metrics with `"type": "command"` execute shell commands. This is a potential vector if `.git-history/metrics.json` is tampered with.

**Mitigations:**

1. Command metrics only run during `git-skill snapshot` (never in the post-commit hook)
2. On first `snapshot` after `metrics.json` changes, display the commands and require user confirmation: "metrics.json changed. New command: `npm run build ...`. Allow? [y/N]"
3. `metrics.json` should be in `.gitignore` by default (project-specific, not shared via git)
4. `git-skill doctor` warns if `metrics.json` contains command metrics

---

## Schema Migration Strategy

`history.db` stores a version in `schema_meta`:

```sql
INSERT INTO schema_meta (key, value) VALUES ('schema_version', '1');
```

On db open, check version and run incremental migrations:

```typescript
const migrations = {
  1: () => { /* initial schema */ },
  2: () => { db.exec('ALTER TABLE commits ADD COLUMN ...'); },
  // ...
};
const current = db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get();
for (let v = current + 1; v <= LATEST; v++) migrations[v]();
```

This preserves months/years of accumulated history across version upgrades.

---

## Trend Analysis Algorithm

`git-skill regression` uses rolling-window z-score for change-point detection:

1. Compute rolling mean + stddev over a configurable window (default: 10 commits)
2. Flag points where the value exceeds 2 standard deviations from the rolling mean
3. The earliest flagged point in a sustained shift is reported as the inflection commit
4. For small datasets (<20 commits), falls back to simple percent-change comparison

This is lightweight (no heavy ML dependencies) and works well for the monotonic metrics we're tracking.

---

## Project Structure

```
@m2015agg/git-skill
├── src/
│   ├── index.ts                    # CLI entry (commander)
│   ├── commands/
│   │   ├── install.ts              # Global wizard
│   │   ├── init.ts                 # Per-project setup + hook install
│   │   ├── doctor.ts               # Health check
│   │   ├── snapshot.ts             # Full re-index + analytics
│   │   ├── capture.ts              # Post-commit hook handler (fast path)
│   │   ├── search.ts               # BM25 + vector hybrid
│   │   ├── timeline.ts             # File/dir evolution
│   │   ├── blame.ts                # Enhanced blame with enrichments
│   │   ├── trends.ts               # Metric trends + dashboard
│   │   ├── regression.ts           # Change-point detection
│   │   ├── hotspots.ts             # Churn analysis
│   │   ├── coupling.ts             # Co-change analysis
│   │   ├── decisions.ts            # Decision point browser
│   │   ├── experts.ts              # Author expertise mapping
│   │   ├── diff-summary.ts         # Range summary
│   │   ├── why.ts                  # Pull enrichment
│   │   ├── enrich.ts               # Backfill LLM enrichments
│   │   ├── embed.ts                # Generate/refresh embeddings
│   │   ├── release-notes.ts        # Aggregated release notes
│   │   ├── metric.ts               # Manual metric recording
│   │   ├── approve.ts              # Pre-approve commands
│   │   ├── cron.ts                 # Nightly automation
│   │   ├── docs.ts                 # CLAUDE.md generation
│   │   ├── update.ts               # Self-update
│   │   └── uninstall.ts            # Clean removal
│   ├── util/
│   │   ├── db.ts                   # SQLite schema + queries
│   │   ├── git.ts                  # Git command wrappers
│   │   ├── config.ts               # Global config management
│   │   ├── env.ts                  # Environment resolution
│   │   ├── claude-md.ts            # CLAUDE.md injection
│   │   ├── detect.ts               # Project type detection
│   │   ├── metrics.ts              # Built-in + custom metric computation
│   │   ├── embedding.ts            # Embedding provider abstraction
│   │   ├── search-hybrid.ts        # BM25 + vector fusion (RRF)
│   │   └── hooks.ts                # Git hook install/remove
│   └── templates/
│       └── walkthrough.ts          # /git-history slash command
├── dist/
├── package.json
├── tsconfig.json
└── tests/
```

### Local Cache Structure

```
.git-history/
├── history.db          # SQLite — all tables
├── config.json         # Embedding provider config
├── metrics.json        # Custom metric definitions
└── index.md            # Human-readable summary
```

---

## Automated Testing Strategy

### Test Infrastructure

Tests create a synthetic git repo with scripted history — deterministic commits, known timestamps, predictable patterns. Every test knows exactly what the data should look like.

#### Fixture Repo (`tests/fixtures/create-test-repo.ts`)

~50 commits across 3 branches over a simulated 30-day timeline:

**Phase 1: "Clean growth" (commits 1-15)**
- Initial project scaffold
- Steady feature additions
- 2-3 files per commit, stable velocity

**Phase 2: "Things go wrong" (commits 16-30)**
- Thrashing: same file edited 5x in 6 commits
- Scope creep: commits go from 3 files → 12 files
- 2 reverts
- Fix-on-fix chain: commit 22 fixes 21 which fixed 20
- Time-to-commit doubles

**Phase 3: "Recovery" (commits 31-45)**
- Refactor decision point (20+ files, new directory structure)
- Metrics stabilize
- Clean commit patterns return

**Phase 4: "Release" (commits 46-50)**
- Tag v1.0 at commit 35, v1.1 at commit 50
- Merge branch
- Final cleanup

### Test Suites

#### Suite 1: Setup & Lifecycle

| Test | Expected |
|------|----------|
| `init` on fresh repo | Creates `.git-history/`, installs hook, builds initial snapshot |
| `init` on already-initialized repo | Updates without data loss |
| `doctor` after clean init | All checks pass |
| `doctor` with missing hook | Reports hook missing |
| `doctor` with stale snapshot | Reports age warning |
| `uninstall` | Removes hook, `.git-history/`, CLAUDE.md sections |
| Post-commit hook fires | New commit appears in SQLite within 1s |
| Hook failure doesn't block commit | Kill db mid-write, next commit still succeeds |

#### Suite 2: Raw Data Integrity

| Test | Expected |
|------|----------|
| All 50 commits indexed | `SELECT COUNT(*) FROM commits` = 50 |
| File statuses correct | Commit 1 has all 'A' (added), later commits have 'M' |
| Rename tracking | Renamed file shows `old_path` populated |
| Branch tracking | 3 branches detected, correct head hashes |
| Tag tracking | v1.0 → commit 35, v1.1 → commit 50 |
| Merge commits flagged | `merge_commit = true` for merge in Phase 4 |
| Incremental capture | Add commit 51, only 1 new row inserted |

#### Suite 3: Search (BM25)

| Test | Expected |
|------|----------|
| `search "auth"` | Returns commits touching `src/auth/` files |
| `search "refactor"` | Returns Phase 3 decision point commit |
| `search "fix login"` | Returns fix-on-fix chain commits (20-22) |
| Empty results | `search "xyznonexistent"` returns empty, no crash |
| `--limit 3` | Exactly 3 results |
| `--since` / `--until` | Filters to correct date range |
| `--json` output | Valid JSON, parseable |

#### Suite 4: Search (Vector)

| Test | Expected |
|------|----------|
| Mock embedding provider | Local HTTP server returning deterministic vectors |
| `embed` populates table | Correct row count in `embeddings` |
| Semantic search finds related | "authentication" finds "login" and "session" commits |
| Hybrid fusion | Both BM25 + vector sources in merged results |
| Fallback when provider down | BM25 results still returned, warning printed |
| No crash when embeddings disabled | Search works, vector layer skipped |

#### Suite 5: Derived Analytics

| Test | Expected |
|------|----------|
| `file_evolution` computed | Known file shows correct first_seen, total_commits |
| `churn_hotspots` correct | Phase 2 thrashing file is #1 hotspot |
| `coupling` detected | Co-committed files have coupling_score > 0.8 |
| `author_expertise` computed | Test author has highest score for most-touched paths |
| `decision_points` detected | Reverts (2), big refactor (1), architecture change (1) |
| Impact scores ranked | Big refactor > single-file revert |

#### Suite 6: Built-in Metrics & Trends

| Test | Expected |
|------|----------|
| Revert rate | Phase 2: 2/15 = 13.3%, Phase 3: 0% |
| Fix-on-fix rate | Commits 20-22 detected as chain |
| Time-to-commit | Phase 2 avg > Phase 1 avg |
| Scope creep | Phase 2 files-per-commit > Phase 1 |
| Same-file churn | Thrashing file flagged in Phase 2 |
| `trends` output | Per-period values with direction arrows |
| `regression` detection | Pinpoints commit 16 as inflection for scope creep |
| `regression` on stable metric | Reports "no significant change detected" |

#### Suite 7: Custom Metrics

| Test | Expected |
|------|----------|
| `metrics.json` loaded | 3 test metrics registered |
| Command metric captured | Runs command → stores value |
| File metric captured | Reads JSON → extracts number |
| Git metric captured | Counts lines matching pattern |
| Alert threshold triggers | Warning on 50% threshold cross |
| Alert below threshold | No warning |
| Manual `metric record` | Value stored with correct commit_hash |

#### Suite 8: Query Commands

| Test | Expected |
|------|----------|
| `timeline src/auth/` | All commits chronological with churn stats |
| `blame src/auth/index.ts` | Enhanced output with enrichment data |
| `hotspots` | Phase 2 thrashing file #1 |
| `hotspots --period month` | Correctly grouped |
| `coupling src/auth/index.ts` | Co-changed files with scores |
| `decisions` | 4 decision points from fixture |
| `decisions --type revert` | Only 2 reverts |
| `experts src/auth/` | Authors sorted by expertise |
| `diff-summary v1.0..v1.1` | Covers commits 36-50 |
| `why <hash>` with enrichment | Returns intent/reasoning |
| `why <hash>` without enrichment | "No enrichment" + raw data |

#### Suite 9: LLM Enrichment

| Test | Expected |
|------|----------|
| `enrich` single commit | Writes to `enrichments` with all fields |
| `enrich` skips duplicates | No duplicate rows |
| Enrichment without LLM | Graceful skip, warning |
| Enrichment searchable | FTS5 indexes intent + reasoning |

#### Suite 10: Release Notes

| Test | Expected |
|------|----------|
| `release-notes v1.0..v1.1` | All sections generated |
| Health section | Phase 2 metrics as warnings |
| Decision log | Reverts and refactor listed |
| File impact | Most-changed, new/deleted modules correct |
| `--json` output | Structured JSON |

#### Suite 11: Edge Cases

| Test | Expected |
|------|----------|
| Empty repo (0 commits) | `init` succeeds, commands return empty |
| Huge commit (500 files) | No timeout, indexes correctly |
| Binary files | Skipped in diff, counted in stats |
| Unicode commit messages | FTS5 handles correctly |
| No branches/tags | Commands work, sections empty |
| Concurrent hook + snapshot | WAL mode prevents locks |
| Corrupted db | `doctor` detects, `snapshot --force` rebuilds |
| `.git-history/` in `.gitignore` | `init` adds automatically |

### Running Tests

```bash
npm test                          # All suites
npm test -- --grep "search"       # Single suite
npm run test:fixture              # Rebuild fixture repo
npm run test:coverage             # With coverage report
```

### CI

GitHub Actions runs full suite on push. Fixture repo built fresh each run.

---

## Integration with Existing Workflow

### CLAUDE.md Injection

Same HTML comment marker pattern as supabase-skill:

```html
<!-- git-skill:start -->
[Full command reference + active alerts]
<!-- git-skill:end -->
```

### `/finalize` Integration

1. Existing finalize runs linters, tests, checklist
2. `git-skill release-notes` generates detailed notes
3. Notes attached to PR description or saved to `docs/releases/`
4. `git-skill snapshot` refreshes index

### Permission Pre-Approval

All query commands pre-approved in `.claude/settings.json` — no prompts for read operations.

---

## Future Considerations (not in v1)

- **CI/CD integration** — optional addon to capture test results, build times, deployment outcomes from GitHub Actions
- **Multi-repo** — cross-repo decision tracking for monorepo or microservice setups
- **Unified dev-skill** — potential merge of git-skill + supabase-skill + context7-skill into single CLI
- **Dashboard** — web UI for trend visualization (like supabase-skill's graph command but richer)
