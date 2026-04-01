# GeorgeWorks: Context Injection via Claude Memory System

**Date:** 2026-04-01
**Status:** Concept
**Codename:** GeorgeWorks

## Problem

Claude starts every session with zero awareness of codebase history. git-skill has all the data but Claude only sees it when the user runs commands. The goal: Claude should start every session already knowing the codebase's health, hotspots, recent decisions, and active alerts.

## How Claude's Memory System Actually Works

Compiled from claw-code reverse engineering (`rcc/memory` branch), source code analysis (v2.1.88 source map leak), and public documentation. This is the most complete picture available.

---

### The Four Memory Layers

Claude Code has four distinct memory layers, each with different loading behavior:

| Layer | What | Loaded When | Written By |
|-------|------|-------------|------------|
| **CLAUDE.md** | Static instructions, command refs | Always, fully | User / tools (via markers) |
| **Auto Memory** | Notes Claude writes during sessions | Selectively, by relevance | Claude (automatic) |
| **Session Memory** | Conversation transcripts | Selectively, past session summaries | System (JSONL files) |
| **GeorgeWorks** | Background consolidation of all layers | After consolidation cycle | Forked sub-agent |

---

### Layer 1: CLAUDE.md (Static Instructions)

- **Discovery:** `getMemoryFiles()` in `utils/claudemd.ts` walks filesystem from CWD to root, collecting files at each level
- **Loading order:** Lower-priority first (global → project → local)
- **Always fully loaded** into system prompt as `<system-reminder>` blocks
- **Size constraint:** Already 23KB+ for our projects. Not suitable for dynamic data.
- **Our usage:** Command reference only (static). Already implemented via `<!-- git-skill:start -->` markers.

### Layer 2: Auto Memory (Session Notes)

- **Location:** `~/.claude/projects/<project-path>/memory/`
- **Trigger:** First extraction after ~10,000 tokens of conversation, then every ~5,000 tokens or after every 3 tool calls
- **What it captures:** Build commands, debugging insights, architecture notes, style preferences, user corrections
- **Loading:** Selective — `findRelevantMemories()` matches conversation context against the `description` field in frontmatter
- **Size limits:**
  - Per file: `MAX_INSTRUCTION_FILE_CHARS = 4,000`
  - Total across all files: `MAX_TOTAL_INSTRUCTION_CHARS = 12,000`
  - MEMORY.md index: first 200 lines or 25KB, whichever comes first
- **Our target layer.** git-skill writes here.

### Layer 3: Session Memory (Transcripts)

- **Location:** `~/.claude/projects/<project-hash>/sessions/<uuid>.jsonl`
- **Format:** Parent-child chains linked by UUIDs
- **Loading:** Relevant past session summaries injected with note: "from PAST sessions that might not be related to the current task"
- **Not writable by tools.** System-managed.

### Layer 4: GeorgeWorks (Background Consolidation)

The consolidation system that synthesizes all layers during idle time.

---

## GeorgeWorks: The Consolidation System (Detailed)

### What It Is

A background memory consolidation system that activates during idle time. It spins up a forked sub-agent with limited tool access that reads MEMORY.md, scans recent session transcripts, and synthesizes observations into durable long-term context. It is part of the KAIROS always-on background agent architecture.

### Trigger Conditions (Dual-Gate)

Both conditions must be true simultaneously:

| Condition | Threshold | Why |
|-----------|-----------|-----|
| Time since last consolidation | ≥ 24 hours | Prevents unnecessary frequent runs |
| Sessions since last consolidation | ≥ 5 sessions | Ensures enough new signal to justify the cost |
| Consolidation lock available | No other consolidation running | Prevents merge conflicts across instances |

**Why dual-gate:** One long session over two days won't trigger it (not enough sessions). Ten quick sessions in two hours won't trigger it (not enough time). This prevents unnecessary runs on light-usage projects while ensuring active projects get regular cleanup.

**Manual trigger:** `/dream` command (not rolled out to all users yet). Saying "consolidate my memory files" also works.

### The Four Phases

**Phase 1 — Orient**
- Read current memory directory
- Open MEMORY.md index
- Scan the list of topic files
- Build a map of current memory state

**Phase 2 — Gather Signal**
- Search through recent session transcripts (JSONL files)
- "Grep narrowly" looking for high-value patterns:
  - User corrections ("no, don't do X")
  - Explicit save requests ("remember this")
  - Recurring themes across sessions
  - Key decisions and their reasoning

**Phase 3 — Consolidate and Merge**
- Merge new signal into existing topic files (never create near-duplicates)
- Convert relative dates to absolute ("yesterday" → "2026-03-15")
- Delete contradicted facts at the source
- If 3 sessions noted the same thing, consolidate into one clean entry

**Phase 4 — Prune and Index**
- Keep MEMORY.md under 200 lines (hard cutoff for startup loading)
- MEMORY.md functions as index with one-line descriptions, not a data dump
- Remove pointers to deleted topic files
- Add links to newly created topic files
- Resolve contradictions between index and file contents
- Demote verbose entries (gist in index, detail in topic files)

### Sub-Agent Prompt

The sub-agent receives this instruction (727 tokens):

> "You are performing a dream — a reflective pass over your memory files. Synthesize what you've learned recently into durable, well-organized memories so that future sessions can orient quickly."

Full prompt documented at: `Piebald-AI/claude-code-system-prompts` → `agent-prompt-dream-memory-consolidation.md`

### Sandboxing

- Runs as a **forked sub-agent with limited tool access**
- Can **only write to memory files** — cannot modify source code, config, tests, or any other file
- A **lock file** prevents concurrent consolidation
- Does **not block** the user's active session
- Runs **between sessions** during idle time
- Typically takes **8-10 minutes**

### Pruning Rules

What gets removed:
- Contradictory entries (old "use PostgreSQL" alongside newer "migrated to Convex")
- Stale information: frameworks switched away from, files that no longer exist
- Relative dates from months ago with no context
- Redundant entries saying the same thing across multiple files

What is never stored:
- Facts re-derivable from the codebase (run the code, don't memorize it)

### Write Discipline

Strict "write to topic file first, then update index" order:
1. Write/update topic file on disk
2. Only after confirmed write, update MEMORY.md index
3. Prevents polluting context with references to failed writes

---

## Context Compaction (Within-Session)

Separate from GeorgeWorks but related. Handles context overflow within a single session.

### Trigger

Both conditions true:
- `session.messages.len() > preserve_recent_messages` (default: 4)
- `estimate_session_tokens(session) >= max_estimated_tokens` (default: 10,000)

### Process

1. Keep last 4 messages verbatim
2. Compress older messages into structured XML summary
3. Summary includes: message type breakdown, tools used, recent user requests (truncated to 160 chars), pending work (detected by keywords: "todo", "next", "pending"), key files (limit 8), current work, timeline
4. Persist to `.claude/memory/summary-{timestamp}.md`
5. Inject continuation system message at position 0

### Token Estimation

`text.len() / 4 + 1` per text block (approximate)

---

## Memory Discovery at Session Start

### Function: `discover_memory_files(cwd)`

1. Walk ancestor directory chain from CWD to root
2. For each directory, check `.claude/memory/` subdirectory
3. Read all files (sorted by filename)
4. Filter out empty files
5. Deduplicate by content hash (`stable_content_hash()`)
6. Apply size limits: 4,000 chars per file, 12,000 chars total
7. Files exceeding limit get `[truncated]` suffix

### Relevance Matching: `findRelevantMemories()`

- Matches conversation context against memory file `description` field in frontmatter
- **This is the primary signal.** A vague description won't match. A specific one will.
- Not all memories load — only those deemed relevant to current conversation

### System Prompt Injection

```markdown
# Project memory

## {path} (scope: {parent_dir})
{content}
```

---

## GeorgeWorks Implementation for git-skill

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

No user action needed — snapshot keeps context fresh. GeorgeWorks will naturally incorporate git-skill's context file during its consolidation phases.

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

### Design Rules (derived from system internals)

1. **`description` field is everything.** `findRelevantMemories` uses it for matching. Be specific: "Codebase health, churn hotspots, recent decisions, revert rate" not "git stuff"
2. **Under 4,000 chars.** Hard limit per memory file. Our target is <1KB.
3. **Under 200 lines in MEMORY.md.** Hard cutoff for startup loading. One line per entry.
4. **Include timestamp.** `memoryAge` checks freshness. Stale data gets deprioritized.
5. **Type must be `project`.** Strict enum: user, feedback, project, reference.
6. **Don't store derivable facts.** The memory should be a summary/index. Claude can run `git-skill search/timeline/why` for details.
7. **GeorgeWorks will consolidate.** Our file participates in the natural consolidation cycle. It may be merged with other project memories, which is fine — our `context-update` rewrites it fresh on every snapshot.
8. **Write file first, then index.** Follow the same discipline as the internal system.

---

## Why This Works

The memory system was designed for exactly this use case. We're not fighting it:

- **CLAUDE.md** = static command docs (always loaded, size-sensitive)
- **Memory** = dynamic project state (selectively loaded, relevance-matched)
- **GeorgeWorks** = automatic consolidation (keeps memory clean over time)
- **Slash commands** = on-demand exploration (user-triggered)

git-skill feeds data into Layer 2 (Auto Memory). GeorgeWorks (Layer 4) naturally incorporates and maintains it. The `description` frontmatter ensures `findRelevantMemories` loads it when Claude is doing code work.

## What This Enables

- Claude starts sessions with awareness: "I see chat.py has been churning"
- Claude warns before touching hotspot files
- Claude references recent decisions without being told
- Claude notices when metrics degrade between sessions
- GeorgeWorks consolidation keeps the memory clean across weeks/months
- `findRelevantMemories` ensures context loads for code work, not unrelated tasks
- `memoryAge` ensures Claude knows if data is fresh or stale

## Sources

- claw-code `rcc/memory` branch — `src/reference_data/subsystems/memdir.json`
- claw-code Rust implementation — `rust/crates/runtime/src/compact.rs`
- v2.1.88 source map leak — KAIROS architecture, `getMemoryFiles()`, discovery logic
- `Piebald-AI/claude-code-system-prompts` — dream agent prompt (727 tokens)
- Anthropic Claude Code docs — memory architecture overview
- Community analysis — claudefa.st, zenvanriel.com, Engineer's Codex
