# git-skill Implementation Plan Tracker

**Project:** `@m2015agg/git-skill` — Git history intelligence for LLMs
**Spec:** `docs/specs/2026-03-31-git-skill-design.md`
**Started:** 2026-03-31
**Completed:** 2026-04-01
**Published:** `@m2015agg/git-skill@0.2.3` on npm

---

# Implementation Report

**Review Date:** 2026-04-01
**Status:** Code Review Complete

## Quality Assessment
- Tests: 105 passing across 23 test files
- Build: Clean TypeScript compilation (strict mode)
- Security: All `execSync` → `execFileSync`, parameterized SQL, shared env utils
- Patterns: Follows supabase-skill/context7-skill ecosystem patterns

## Issues Found and Fixed

### Critical
- **C1: Shell injection** — All `execSync` calls with user input replaced with `execFileSync` → Fixed in `3d816e2`
- **C2: SQL injection** — LIMIT clauses with string interpolation replaced with parameterized queries → Fixed in `3d816e2`

### Major
- **M1: Version mismatch** — `index.ts` hardcoded `0.1.0`, now reads from `package.json` → Fixed in `3d816e2`
- **M2: Code duplication** — `loadDotEnv`/`resolveEnvVar` duplicated in 2 files, extracted to `src/util/env.ts` → Fixed in `3d816e2`
- **M3: Capture FTS gap** — Post-commit hook didn't update FTS index, commits invisible to search until snapshot → Fixed in `85a6cfd`

### Major (Deferred — spec gaps for future versions)
- **M4: `dependency_churn` metric** — Referenced but never computed
- **M5: Missing spec features** — `resurrection` and `merge_conflict` decision types, custom metrics (`metrics.json`), `.git-history/index.md`, `--depth` flag, post-commit alerts, enrichment-dependent metrics
- **M6: No tests for `context-update`** — Writes to user home directory, should be tested
- **M7: No tests for hook upgrade path** — Regex replacement could fail on edge cases

### Minor (Not Fixed)
- m1: Dead conditional in enrich.ts (identical Anthropic/non-Anthropic body)
- m2: `search-hybrid.ts` has no vector search implementation (embeddings generated but never queried)
- m3: Duplicate interface definitions across commands (CommitRow, FileRow)
- m4: `regression` and `metric record` don't check for db existence
- m5: `capture --hash` may record wrong commit (HEAD instead of specified hash)

## Post-Implementation Additions (beyond original spec)
- **GeorgeWorks (`context-update`)** — Writes codebase health to Claude's memory system
- **Post-commit memory refresh** — Hook runs `context-update` on every commit
- **Anthropic API support** — Native `x-api-key` header + `anthropic-version`
- **`.env` file loading** — Auto-loads API keys from `~/.env` and project `.env`
- **Enriched LLM prompt** — Diff, file list, session context, 5000 max tokens
- **`maxBuffer: 50MB`** — Supports repos with 2000+ commits

---

## Plan Overview

| Plan | Name | Status | Tasks | Tests |
|------|------|--------|-------|-------|
| 1 | [Core](2026-03-31-plan1-core.md) | Complete | 10/10 | 43 |
| 2 | [Intelligence](2026-03-31-plan2-intelligence.md) | Complete | 12/12 | 50 |
| 3 | [Advanced](2026-03-31-plan3-advanced.md) | Complete | 11/11 | 12 |

**Total: 105 tests passing across 23 test files**

---

## Completion Criteria

- [x] All tests pass (`npm test`) — 105/105
- [x] CLI linked and functional (`npm run link && git-skill doctor`)
- [x] E2E test on fresh repo succeeds (all 15 commands verified)
- [x] Tagged v0.1.0

## Commands Implemented (22)

**Setup:** init, install, doctor, approve, cron, update, uninstall, docs
**Query (pre-approved):** search, timeline, blame, trends, hotspots, coupling, decisions, experts, diff-summary, why, regression
**Write:** snapshot, enrich, embed, release-notes, metric record
