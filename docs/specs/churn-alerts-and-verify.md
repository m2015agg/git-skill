# Churn Alerts + Verify Command

**Date:** 2026-04-01
**Status:** Concept — ready to build

## Two Features, One Goal

Prevent developers and AI agents from repeating mistakes or thrashing on the same values.

### Feature 1: Smart Churn Alerts (Passive)

**Trigger:** Runs during `context-update` (every commit via hook, nightly via cron)
**Cost:** Zero — queries existing SQLite data, no API call
**Output:** Alert lines in `git_context.md` memory file

#### What It Detects

| Pattern | Query | Alert |
|---------|-------|-------|
| **Value thrashing** | Same file edited 3+ times in last 10 commits | `[WARN] max_tokens in block_generator.py changed 5 times in 3 days` |
| **Revert chains** | Commits with "revert" touching same files | `[WARN] rag.py has been reverted 2x this week` |
| **Fix-on-fix** | Sequential "fix" commits on same file | `[WARN] fix-on-fix chain on semantic_tier.py (3 fixes in 2 commits)` |
| **Oscillation** | Same value set, changed, set back | `[WARN] source_count oscillating: 15 → 5 → 15 in last 7 days` |

#### Implementation

Add to `context-update.ts` → `buildSummary()`:

1. Query `commit_files` for files with 3+ edits in last 10 commits
2. Query `commits` for revert messages touching those files
3. Query `metric_values` for same_file_churn > 0
4. Format as alert lines in the memory file

Claude sees these at session start and proactively warns: "I see block_generator.py has been churning — what are we trying to stabilize?"

### Feature 2: `git-skill verify` (Active)

**Trigger:** Manual command or `/review` phase integration
**Cost:** One Opus/Sonnet API call per invocation (~$0.10-0.15)
**Input:** Staged changes (`git diff --cached`) or a specific file path
**Output:** PASS / WARN / BLOCK with historical context

#### What It Does

1. Get the staged diff (or diff of specified files)
2. Extract: files touched, specific values changed, patterns modified
3. Search enrichment history for those files/patterns:
   - FTS5 search on file paths
   - Query decision_points for reverts touching same files
   - Query commit_files for edit frequency
   - Pull enrichments for relevant historical commits
4. If history found, pull actual diffs via `git show` for comparison
5. Send to LLM: staged diff + relevant history + enrichments
6. LLM responds: PASS / WARN / BLOCK with reasoning

#### Example Output

```
$ git-skill verify

Checking staged changes against history...

[BLOCK] block_generator.py — max_tokens value
  You're setting max_tokens to 150. This value has been tried before:
  - ea2761a (Mar 27): Set to 150, caused Sonnet to write paragraphs
  - 0090014 (Mar 27): Increased to 200 because 150 truncated Day 2 content
  Current stable value: 200 (since f19469a)

  Suggestion: The problem isn't the token count — it's the prompt structure.
  See enrichment for 0c24804 which added banned words as an alternative.

[WARN] rag.py — source truncation pattern
  Similar approach was tried in eeea6a4 and reverted in e0137be (prod risk).
  That was the 3rd attempt at source count reduction (15 → 5 → 4).

[PASS] api/routes.py — no concerning history
```

#### Command Interface

```bash
git-skill verify                  # Check staged changes
git-skill verify --file <path>    # Check specific file against history
git-skill verify --json           # Structured output
git-skill verify --model sonnet   # Use Sonnet instead of default (cheaper)
```

#### Config

Add to `~/.config/git-skill/config.json`:

```json
{
  "verify": {
    "enabled": true,
    "model": "claude-sonnet-4-6",
    "url": "https://api.anthropic.com/v1/messages",
    "apiKey": "${GIT_SKILL_LLM_KEY}",
    "maxTokens": 5000
  }
}
```

Falls back to `enrichment` config if `verify` section doesn't exist.

#### LLM Prompt

```
You are reviewing staged code changes against this repository's git history.
Your job: identify if any of these changes repeat a pattern that was previously
tried and reverted, thrash on a value that's been changed multiple times, or
re-introduce something that was intentionally removed.

STAGED DIFF:
{staged_diff}

RELEVANT HISTORY (from enrichment search):
{enrichment_summaries}

HISTORICAL DIFFS (for flagged commits):
{historical_diffs}

CHURN DATA:
{file_edit_counts_and_dates}

For each file in the staged diff, respond with:
- PASS: No concerning history
- WARN: This has been modified frequently or relates to a reverted change
- BLOCK: This re-introduces a pattern that was explicitly reverted or removed

Include specific commit hashes and dates. Explain what happened before and
why the current change might repeat the same mistake.
```

## Build Order

1. **Smart churn alerts** — enhance `context-update.ts` (30 min, no API cost)
2. **`git-skill verify`** — new command (2-3 hours, uses LLM API)

## Integration Points

- Churn alerts → `context-update` → Claude's memory → every session
- Verify → manual or `/review` phase → before commit/merge
- Both use the same underlying data (commit_files, decision_points, enrichments)
