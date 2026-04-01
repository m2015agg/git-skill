# Opus Verification Layer

**Date:** 2026-04-01
**Status:** Concept

## Problem

Developers (and AI agents) repeat mistakes. They re-introduce reverted code, thrash on the same file, or recreate patterns that were already tried and failed. Git has all the evidence but nobody checks it before committing.

## Real Examples (from bibleai production)

### Example 1: RAG Source Truncation — Tried and Reverted

Commit `eeea6a4` added RAG source truncation to reduce TTFT. Commit `e0137be` reverted it because of prod risk. Without historical awareness, nothing stops an agent from trying the same approach again next week.

**What Opus would say:** "BLOCK — RAG source truncation was tried in `eeea6a4` and reverted in `e0137be` (prod migration risk). This is the third time source count reduction has been attempted (15 → 5 → 4). Consider a different approach."

### Example 2: max_tokens Thrashing — 5 Changes in One Day

The prayer block `max_tokens` value was tuned 5 times in a single day (March 27):

| Commit | Value | Problem |
|--------|-------|---------|
| `ea2761a` | 150 | Sonnet wrote paragraphs |
| `0c24804` | 150 | Added banned words instead |
| `0090014` | 200 | 150 caused truncation on Day 2 |
| `f19469a` | 200 | 120 truncated mid-section |

Story block `max_tokens` bounced 5 times over 2 weeks:
- Feb 2: increased (too small)
- Feb 4: increased to 8192 (truncation)
- Feb 5: increased "more aggressively"
- Feb 12: capped at 2000
- Feb 17: switched to DB recipe instead of blanket cap

**What Opus would say:** "WARN — You're modifying `max_tokens` for prayer blocks. This value has been changed 5 times already (`ea2761a`, `0c24804`, `0090014`, `f19469a`). The pattern suggests the problem isn't the token count — it's the prompt structure. Previous attempts: 120 (truncated), 150 (paragraphs), 200 (current). Consider addressing prompt engineering instead of tuning this value again."

### Example 3: Repeated Architectural Oscillation

Source count reduction was tried 3 separate times: 15 → 5 → 4 sources. Each time it was a speed vs quality tradeoff that ultimately got reverted or adjusted back. The "cap vs DB control" pattern also oscillated — Feb 12 added a hardcoded cap at 2000, Feb 17 switched to DB recipe control, and the pattern continued.

**What Opus would say:** "WARN — You're adding a hardcoded cap for block generation. This pattern has oscillated before: Feb 12 added a 2000 cap, Feb 17 switched to DB recipe control. The DB recipe approach won last time. Are you sure you want a hardcoded value?"

### Why These Matter

Each of these examples wasted hours of developer time:
- The `max_tokens` churn alone was 5 commits in one day — each requiring testing, deployment, and evaluation
- The source count reduction was tried 3 times across weeks before the team settled on the right approach
- None of these decisions were documented anywhere that an AI agent could find

With enrichment data + Opus verification, every one of these would be flagged on the first re-attempt. The enrichment captures the *intent* and *reasoning* behind each change, so Opus can explain not just "this was tried before" but "here's why it was reverted and what worked instead."

## Solution

An Opus-class verification pass that checks staged changes against enriched git history before they ship. The enrichment data (intent, what_changed, reasoning, session_context) serves as the index. Git diffs are the source of truth pulled on-demand.

## What It Catches

| Pattern | Detection | Example |
|---------|-----------|---------|
| **Reverted re-introduction** | Staged diff resembles a previously reverted commit's diff | "RAG truncation was tried in eeea6a4 and reverted in e0137be" |
| **Thrashing** | Same file edited 3+ times in recent commits, now being edited again | "semantic_tier.py has been touched 5 times in 3 days" |
| **Fix-on-fix** | Staged change touches same lines as a recent fix | "You're modifying the same function that was crash-fixed in 7500500" |
| **Scope creep** | Staged diff touches files unrelated to the stated intent | "This commit message says 'fix auth' but modifies 12 files across 4 modules" |
| **Dead pattern revival** | Code pattern matches something previously deleted with intent | "This .value access pattern was removed as a crash fix" |

## Architecture

```
Staged changes (git diff --cached)
        │
        ▼
┌─────────────────────┐
│  Pattern Extraction  │  Extract: files touched, functions modified,
│                      │  code patterns, import changes
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  History Search      │  Search enrichments via FTS5 + file overlap:
│  (local, fast)       │  - Same files in recent commits
│                      │  - Reverts touching same paths
│                      │  - High-churn file warnings from metrics
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Opus Reasoning      │  Send to Opus:
│  (API call)          │  - Current staged diff
│                      │  - Relevant historical enrichments
│                      │  - Actual historical diffs (git show, on-demand)
│                      │  - Current metrics/alerts for touched files
└────────┬────────────┘
         │
         ▼
    Pass / Warn / Block
```

## Data Flow

1. **Enrichments are the index** — fast to search, contain intent/reasoning/context
2. **Git diffs are the source of truth** — pulled on-demand via `git show <hash>` only for relevant commits
3. **Metrics provide thresholds** — revert rate, churn, fix-on-fix rate flag risk areas

This split keeps the SQLite small (enrichments are ~500 bytes each) while still enabling deep comparison when needed.

## Trigger Points

| When | Cost | Use Case |
|------|------|----------|
| `git-skill verify` (manual) | On-demand | Developer wants a sanity check |
| `/review` phase | Per-review | Part of the existing workflow gate |
| Pre-commit hook (optional) | Every commit | Catches everything, but adds latency + API cost |
| CI check | Per-PR | Non-blocking warning in PR comments |

Recommended default: `/review` phase integration. Pre-commit is opt-in for high-risk repos.

## Prompt Structure (Opus)

```
You are reviewing staged changes against this repository's history.

STAGED DIFF:
[git diff --cached]

RELEVANT HISTORY (from enrichment search):
[Enrichment summaries for commits touching same files/patterns]

HISTORICAL DIFFS (for flagged commits):
[Actual diffs from git show, truncated]

METRICS FOR TOUCHED FILES:
[Revert rate, churn count, fix-on-fix rate]

Check for:
1. Is this re-introducing something that was previously reverted? Show the revert commit.
2. Is this modifying a file that's been thrashing? Flag it.
3. Does this look like a fix for a recent fix (fix-on-fix chain)?
4. Does the scope match the commit message intent?
5. Are there any patterns here that were previously removed intentionally?

Respond with:
- PASS: No concerns
- WARN: [specific concern with commit references]
- BLOCK: [critical issue — this was explicitly reverted/removed before]
```

## Cost Estimate

Per verification call:
- Input: ~5-10K tokens (staged diff + 3-5 historical enrichments + 1-2 historical diffs)
- Output: ~500 tokens
- At Opus pricing (~$15/M input): ~$0.10-0.15 per check
- For `/review` phase usage: ~$1-3/day for active development

## Not in Scope (v1)

- Cross-repo verification (monorepo/microservice awareness)
- Automated blocking (always advisory, never gates)
- Training/fine-tuning on repo-specific patterns
- Real-time streaming feedback during editing
