# Context Injection via Claude Memory System

**Date:** 2026-04-01
**Status:** Concept

## Problem

Claude starts every session with zero awareness of codebase history. git-skill has all the data but Claude only sees it when the user runs commands. The goal: Claude should start every session already knowing the codebase's health, hotspots, recent decisions, and active alerts.

## Mechanism

Write a memory file to `~/.claude/projects/<project-path>/memory/` during `git-skill snapshot`. Claude auto-loads MEMORY.md index at session start — no startup hooks needed.

**Why memory, not CLAUDE.md:** CLAUDE.md is for static command docs (already 23KB+). Memory is designed for persistent, evolving project context. Keeps concerns separated.

## Implementation

### New command: `git-skill context-update`

1. Compute project memory path: `~/.claude/projects/` + cwd with `/` → `-` encoding
2. Generate summary from SQLite (top hotspots, decisions, metrics, alerts)
3. Write `git_context.md` with frontmatter
4. Update `MEMORY.md` index if entry missing

### Auto-run at end of `snapshot` and `cron`

No user action needed — snapshot keeps context fresh.

### Output file: `git_context.md`

```markdown
---
name: Git History Context
description: Codebase health and evolution summary from git-skill
type: project
---

## Codebase State (2026-04-01)
2093 commits | 27 branches | 26 tags | last snapshot: 2m ago

## Hotspots (most churn, last 30 days)
1. chat.py — 209 commits, +3.2k/-2.8k (being cleaned up)
2. request_pipeline.py — 70 commits (routing core)
3. rag.py — 45 commits

## Recent Decisions
- Reverted RAG truncation (e0137be) — prod migration risk
- Removed phase system (767076c) — simplification
- Service layer refactor (3 weeks ago) — 20+ files

## Health
- Revert rate: 3.2% (elevated, baseline 1.5%)
- Fix-on-fix: 8% in services/ (watch)
- Time-to-commit: stable
- Scope creep: trending down (good)

## Active Alerts
- [WARN] fix-on-fix rate elevated in BibleLizi_API/app/services/
```

### Size target: <1KB

Memory files should be concise. Claude can always `git-skill search/timeline/why` for details.

## What This Enables

- Claude starts sessions saying "I see chat.py has been churning — what are we working on there?"
- Claude warns before touching hotspot files
- Claude references recent decisions without being told
- Claude notices when metrics degrade between sessions
