# GeorgeWorks: Context Injection via Claude Memory System

**Date:** 2026-04-01
**Status:** Concept
**Codename:** GeorgeWorks

## Problem

Claude starts every session with zero awareness of codebase history. git-skill has all the data but Claude only sees it when the user runs commands. The goal: Claude should start every session already knowing the codebase's health, hotspots, recent decisions, and active alerts.

## How Claude's Memory System Actually Works

Reverse-engineered from claw-code (`rcc/memory` branch) — the `memdir` subsystem has 8 internal modules:

### Module Architecture

| Module | What It Does |
|--------|-------------|
| `memdir.ts` | Core directory operations — read/write memory files to `~/.claude/projects/<path>/memory/` |
| `findRelevantMemories.ts` | **Relevance gate** — decides which memory files to load into context based on conversation topic. Uses the `description` field in frontmatter for matching. Not all memories load — only relevant ones. |
| `memoryScan.ts` | Scans the memory directory, reads `MEMORY.md` index, discovers individual files |
| `memoryTypes.ts` | Type definitions: `user`, `feedback`, `project`, `reference` — strict enum, must be one of these |
| `memoryAge.ts` | Staleness detection — flags memories that haven't been updated. Stale memories may be deprioritized or flagged for review |
| `paths.ts` | Path encoding — `~/.claude/projects/` + cwd with `/` replaced by `-` (e.g., `/home/matt/bibleai` → `-home-matt-bibleai`) |
| `teamMemPaths.ts` | Team-level shared memory paths (multi-user) |
| `teamMemPrompts.ts` | Prompt templates for team memory operations |

### Loading Flow

```
Session Start
    │
    ▼
Load MEMORY.md index (always — it's small, <200 lines)
    │
    ▼
findRelevantMemories()
    │  Matches conversation context against memory file descriptions
    │  Uses frontmatter `description` field as the primary signal
    │
    ▼
Load matched memory files into system prompt
    │  Injected as <system-reminder> blocks
    │
    ▼
memoryAge check
    │  Flags stale entries (old timestamps, outdated info)
    │
    ▼
Claude has context
```

### Critical Design Details

1. **MEMORY.md is the gate.** If a memory file isn't referenced in MEMORY.md, `memoryScan` won't find it. Our `context-update` command MUST update the index.

2. **`description` field drives relevance.** `findRelevantMemories` matches against the one-line description in frontmatter. A vague description like "project info" won't match. A specific one like "Codebase health: hotspots, revert rate, recent decisions from git-skill" will match whenever Claude is working on code.

3. **`memoryAge` penalizes stale data.** Include a timestamp in the memory content. If our git context is 30 days old, it may be deprioritized. Running `snapshot` with `context-update` keeps it fresh.

4. **Type must be valid.** Only `user`, `feedback`, `project`, `reference`. Git context = `project`.

5. **Size matters.** Memory files are designed to be small (1-3KB). The MEMORY.md index truncates after ~200 lines. Keep the index entry under 150 chars.

6. **Not everything loads.** Unlike CLAUDE.md (always fully loaded), memories are selectively loaded based on relevance. This is actually better for us — git context loads when Claude is doing code work, not when answering questions about dinner recipes.

## Implementation

### New command: `git-skill context-update`

1. Compute project memory path: `~/.claude/projects/` + cwd with `/` → `-` encoding
2. Generate summary from SQLite (top hotspots, decisions, metrics, alerts)
3. Write `git_context.md` with frontmatter optimized for `findRelevantMemories`
4. Update `MEMORY.md` index if entry missing — one line, under 150 chars

### Path Encoding

```
/home/matt/bibleai → ~/.claude/projects/-home-matt-bibleai/memory/
/home/matt/git-skill → ~/.claude/projects/-home-matt-git-skill/memory/
```

### Auto-run at end of `snapshot` and `cron`

No user action needed — snapshot keeps context fresh.

### Output file: `git_context.md`

```markdown
---
name: Git History Context
description: Codebase health, churn hotspots, recent decisions, revert rate, and active alerts from git-skill snapshot
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

### MEMORY.md index entry

```markdown
- [Git History Context](git_context.md) — codebase health, hotspots, decisions, alerts from git-skill
```

### Size target: <1KB

Memory files should be concise. The `description` frontmatter field does the heavy lifting for relevance matching. Claude can always `git-skill search/timeline/why` for details.

## Why This Works

The memory system was designed for exactly this use case — tool-generated, auto-updated project context that gets selectively loaded based on relevance. We're not fighting the system:

- **CLAUDE.md** = static command docs (always loaded, size-sensitive)
- **Memory** = dynamic project state (selectively loaded, relevance-matched)
- **Slash commands** = on-demand exploration (user-triggered)

## What This Enables

- Claude starts sessions with awareness: "I see chat.py has been churning"
- Claude warns before touching hotspot files
- Claude references recent decisions without being told
- Claude notices when metrics degrade between sessions
- `findRelevantMemories` ensures this context loads when doing code work, not unrelated tasks
- `memoryAge` ensures Claude knows if the data is fresh or stale
