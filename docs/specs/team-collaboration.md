# Team Collaboration: Open Questions

**Date:** 2026-04-01
**Status:** Brainstorm

## The Problem

git-skill was built for a single developer. Everything is local:
- `.git-history/history.db` — local SQLite, gitignored
- `~/.claude/projects/<path>/memory/` — per-user, per-machine
- `~/.config/git-skill/config.json` — per-user API keys
- Enrichments cost money and don't travel with the repo

When a team of 3-5 people all use Claude Code on the same repo, several things break or get wasteful.

## What Already Works for Teams

- **Commit indexing** — `snapshot` indexes ALL authors' commits. Everyone sees the full picture.
- **Analytics** — Hotspots, coupling, decisions, trends are computed from everyone's work.
- **Author expertise** — `experts` command shows who has the most context per file/directory.
- **Post-commit hook** — Each person's hook captures their commits locally in real-time.
- **Search** — Full FTS5 search across all commits regardless of author.

## What Breaks or Gets Wasteful

### 1. Duplicate Work — Enrichments

Each person runs `git-skill enrich` independently. For a 2000-commit repo:
- Person A pays ~$10 to enrich all commits with Sonnet
- Person B joins the team, runs `enrich`, pays another ~$10 for the same commits
- Person C joins... another $10

**The data is identical.** Same commits, same diffs, same LLM, same output. Pure waste.

### 2. Duplicate Work — Embeddings

Same problem. Each person runs `git-skill embed` against their own Ollama/OpenAI.
- Less wasteful (Ollama is free, OpenAI embeddings are cheap)
- But still redundant computation

### 3. Memory Context is Per-User

`context-update` writes to `~/.claude/projects/<path>/memory/git_context.md`.
- Person A's Claude knows the hotspots and alerts
- Person B's Claude starts blind until they run `snapshot`
- No shared team awareness

### 4. Divergent Local State

Each person's `.git-history/history.db` diverges:
- Different snapshot times
- Different enrichment coverage (A enriched 500 commits, B enriched 200)
- Different embedding models (A uses mxbai-embed-large, B uses text-embedding-3-small)
- Analytics computed at different points in time

### 5. Config Divergence

`~/.config/git-skill/config.json` is per-user:
- Different LLM models for enrichment
- Different embedding providers
- Different API keys (expected, this is fine)
- But different `maxTokensPerCommit` means different enrichment quality

## Questions to Answer

### Sharing Enrichments

**Q: Should enrichments be checked into git?**
- Pro: Zero duplication, everyone gets them for free
- Con: `.git-history/history.db` can be 50MB+ for large repos. Binary in git is bad.
- Con: Merge conflicts on SQLite binary

**Q: Should enrichments be in a separate shareable format?**
- Export to `enrichments.jsonl` (one JSON object per line, per commit)
- Check the JSONL into git (small, text, mergeable)
- `git-skill enrich-import` reads it into local SQLite
- New team members get all enrichments on clone

**Q: Should enrichments live in a shared database?**
- Push to Supabase/Postgres
- Team-wide access
- Con: Adds infrastructure dependency. git-skill is supposed to be zero-infrastructure.

**Q: Should enrichments be per-repo, not per-user?**
- Store in `.git-history/enrichments.jsonl` (gitignored but shared via other means)
- Or store in a branch (`git-skill/data` branch that only contains enrichments)

### Sharing Memory Context

**Q: Should `context-update` write to a shared location?**
- Currently: `~/.claude/projects/<path>/memory/` (per-user)
- Could also write to `<repo>/.claude/memory/git_context.md` (per-repo, checked in)
- But this is Claude Code's private space — do we want a tool writing there?

**Q: Should each user run their own snapshot?**
- Or should one person's snapshot output be consumable by others?
- Maybe: `git-skill snapshot --export` creates a portable bundle

### Team Awareness

**Q: Should git-skill know about the team?**
- Currently: no concept of "team" at all
- Could detect from git authors
- Could integrate with GitHub teams API

**Q: Should different team members see different contexts?**
- A backend developer cares about API hotspots
- A frontend developer cares about UI churn
- Author-filtered context might be more relevant than global

### Hook Coordination

**Q: What happens when two people commit at the same time?**
- Each runs their own post-commit hook
- Each writes to their own local SQLite
- No conflict — but no sharing either

**Q: Should the hook push to a shared store?**
- Real-time team awareness
- But adds latency to commits

## Potential Architectures

### A: Export/Import (Simplest)

```
Person A: git-skill enrich → git-skill enrich-export > enrichments.jsonl
Commit enrichments.jsonl to repo
Person B: git pull → git-skill enrich-import enrichments.jsonl
```
- Zero infrastructure
- Works offline
- Git handles distribution
- JSONL is text, diffable, mergeable
- Incremental: export only new enrichments

### B: Shared Branch

```
git-skill enrich → git-skill sync --push
  (pushes enrichments + embeddings to git-skill/data branch)

git-skill sync --pull
  (pulls from data branch into local SQLite)
```
- No separate files in main branch
- Git handles distribution
- Branch can be large without polluting main history
- Could auto-sync via hook

### C: Supabase/Cloud Store

```
git-skill enrich → pushes to Supabase table
git-skill snapshot → pulls from Supabase
```
- Real-time team sync
- Central source of truth
- Adds infrastructure dependency
- Could use existing supabase-skill integration

### D: Git Notes

```
git notes add -m '{"intent":"...","category":"bugfix"}' <commit-hash>
git push origin refs/notes/*
```
- Built into git
- Travels with repo automatically
- `git-skill enrich` writes git notes instead of SQLite
- Everyone gets enrichments on `git fetch`
- Con: git notes are clunky, hard to search, no FTS5

## Recommendation (TBD)

Need to decide based on:
1. How many people are on the team?
2. Is everyone using Claude Code, or just some?
3. Is there existing shared infrastructure (Supabase, etc.)?
4. How important is real-time sync vs batch sync?
5. What's the tolerance for additional setup complexity?

## Not in Scope

- Multi-repo / monorepo support (separate feature)
- Role-based access control
- Billing/cost splitting for enrichment API calls
