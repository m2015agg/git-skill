# @m2015agg/git-skill

**Git history intelligence for LLMs.** Gives AI agents institutional memory over a codebase's evolution, decisions, and health trends.

## Why This Exists

AI coding agents start every session blind. They don't know that `chat.py` has been edited 209 times and is the most volatile file in your project. They don't know you reverted that RAG optimization last week because it broke prod. They don't know the codebase just went through a major refactor and things are stabilizing.

**git-skill fixes this.** It indexes your entire git history into a local SQLite cache, computes analytics (churn hotspots, coupling, decision points, quality metrics), and writes a health summary directly into Claude Code's memory system — so every new session starts with full awareness.

### What It Solves

- **"We tried that already"** — Enrichment data tracks what was tried, reverted, and why. Agents stop re-suggesting failed approaches.
- **"Why does this keep breaking?"** — Churn hotspots and fix-on-fix metrics surface files that are thrashing. Agents flag risk before touching them.
- **"Who knows this code?"** — Author expertise mapping shows who has the most context on any file or directory.
- **"What happened while I was gone?"** — Decision points, trends, and release notes give a complete picture of codebase evolution.
- **"The agent has no memory"** — The `context-update` command writes codebase health directly into Claude's memory system. Every session starts informed.

### How It Fits Together

```
git history ──→ SQLite cache ──→ Analytics ──→ Claude Memory
  (commits,       (indexed,        (hotspots,     (auto-loaded
   diffs,          searchable)      trends,        every session)
   branches)                        decisions)
```

Three layers of intelligence, each useful independently:
1. **Raw data** — every commit, file change, branch, and tag indexed and searchable
2. **Derived analytics** — churn hotspots, file coupling, decision points, author expertise, quality metrics
3. **LLM enrichments** — AI-analyzed intent, reasoning, and impact per commit (optional)

The `context-update` command bridges git-skill to Claude's memory system, writing a concise health summary that `findRelevantMemories` loads at session start.

---

## Install

```bash
npm install -g @m2015agg/git-skill
```

If `git-skill` is not found after install, run `hash -r` to refresh your shell's command cache.

## Quick Start

```bash
cd your-project
git-skill init          # Install hook, index history, set up CLAUDE.md
git-skill doctor        # Verify setup
```

## Embeddings (Optional)

For semantic search, configure an embedding provider. Works with any OpenAI-compatible endpoint (OpenAI, Ollama, LMStudio).

```bash
git-skill install       # Configure embedding provider
git-skill embed         # Generate embeddings for all commits
```

Or manually edit `~/.config/git-skill/config.json`:

```json
{
  "embedding": {
    "enabled": true,
    "provider": "ollama",
    "model": "mxbai-embed-large",
    "url": "http://localhost:11434/api/embed",
    "apiKey": "",
    "dimensions": 1024
  }
}
```

## LLM Enrichment (Optional)

Enrich your commit history with AI-analyzed intent, reasoning, and impact. Uses the actual diff + file list + surrounding commits to understand *what changed and why*.

Edit `~/.config/git-skill/config.json`:

**Anthropic (recommended):**
```json
{
  "enrichment": {
    "enabled": true,
    "url": "https://api.anthropic.com/v1/messages",
    "model": "claude-sonnet-4-5-20250514",
    "apiKey": "${GIT_SKILL_LLM_KEY}",
    "batchSize": 10,
    "maxTokensPerCommit": 5000
  }
}
```

**OpenAI:**
```json
{
  "enrichment": {
    "enabled": true,
    "url": "https://api.openai.com/v1/chat/completions",
    "model": "gpt-4o",
    "apiKey": "${GIT_SKILL_LLM_KEY}",
    "batchSize": 10,
    "maxTokensPerCommit": 5000
  }
}
```

Set your API key in `~/.env` or your project's `.env`:

```bash
# ~/.env (loaded automatically by git-skill)
GIT_SKILL_LLM_KEY=sk-ant-...   # Anthropic
# or
GIT_SKILL_LLM_KEY=sk-...       # OpenAI
```

git-skill loads `.env` from the current directory and `~/` automatically. No need to export — just add the line to the file. Make sure `.env` is in your `.gitignore`.

Then run:

```bash
git-skill enrich              # Enrich all unenriched commits
git-skill enrich --dry-run    # Preview what would be enriched
git-skill enrich --limit 50   # Enrich 50 at a time
git-skill enrich v1.0..v1.1   # Enrich a specific range
git-skill why <hash>          # View enrichment for a commit
```

**Supported providers:** Any OpenAI-compatible chat endpoint — Anthropic, OpenAI, Ollama, LMStudio, Together, etc. Recommended model: `claude-sonnet-4-5-20250514` or `gpt-4o`.

## Commands

### Query (read-only, pre-approved for Claude Code)

| Command | Description |
|---------|-------------|
| `git-skill search <query>` | Search commit history (BM25 + vector) |
| `git-skill timeline <path>` | File/directory evolution |
| `git-skill blame <path>` | Enhanced blame with enrichments |
| `git-skill trends` | Metric trends dashboard |
| `git-skill hotspots` | Files with most churn |
| `git-skill coupling <path>` | Co-changed file analysis |
| `git-skill decisions` | Major decision points (reverts, refactors) |
| `git-skill experts <path>` | Who has most context |
| `git-skill diff-summary <range>` | Range summary (e.g., `v1.0..v1.1`) |
| `git-skill why <hash>` | Commit intent/reasoning |
| `git-skill regression` | Change-point detection |
| `git-skill verify` | Check staged changes against history (was this tried before?) |
| `git-skill context-update` | Refresh Claude memory with codebase health |
| `git-skill doctor` | Health check |

### Write (require confirmation)

| Command | Description |
|---------|-------------|
| `git-skill snapshot` | Full re-index of git history |
| `git-skill embed` | Generate/refresh embeddings |
| `git-skill enrich [range]` | Backfill LLM enrichments |
| `git-skill release-notes <range>` | Generate release notes |
| `git-skill metric record <name> <value>` | Record a custom metric |

### Setup

| Command | Description |
|---------|-------------|
| `git-skill install` | Global setup (embedding config, CLAUDE.md) |
| `git-skill init` | Per-project setup (hook, snapshot, permissions) |
| `git-skill approve` | Pre-approve read commands in Claude Code |
| `git-skill docs` | Output CLAUDE.md snippet |
| `git-skill cron` | Nightly snapshot automation |
| `git-skill update` | Self-update |
| `git-skill uninstall` | Clean removal |

### Global Flags

- `--json` — Structured output for agents
- `--limit N` — Cap results
- `--since <date>` / `--until <date>` — Time filter

## How It Works

Three-layer SQLite cache at `.git-history/history.db`:

1. **Raw git data** — commits, files, branches, tags (captured by post-commit hook + snapshot)
2. **Derived analytics** — file evolution, churn hotspots, coupling, decision points, author expertise, trends
3. **LLM enrichments** — intent, reasoning, category per commit (optional, via `enrich`)

Search uses BM25 (FTS5) by default. Optional vector search via any OpenAI-compatible embedding endpoint.

## Built-in Metrics

Automatically tracked per commit:

- **Revert rate** — how often commits get reverted
- **Fix-on-fix rate** — commits fixing previous commit's bug
- **Scope creep** — files per commit trending up
- **Time-to-commit** — time between commits
- **Same-file churn** — same file 3+ times in recent commits (thrashing)

## Smart Churn Alerts

Automatically detected and written to Claude's memory on every commit:

- **Thrashing** — `[WARN] Thrashing: block_generator.py edited 5 times in last 10 commits`
- **Revert chains** — `[WARN] Reverted: rag.py involved in 2 reverts recently`
- **Fix-on-fix** — `[WARN] Fix-on-fix: semantic_tier.py has 3 sequential fixes`
- **Elevated rates** — `[WARN] Revert rate: 10.0% (threshold: 5%)`

These appear in Claude's memory at session start. No manual action needed — the post-commit hook keeps them fresh.

## Verify: "Was This Tried Before?"

Check staged changes against enriched history before committing:

```bash
git-skill verify                  # Check all staged changes
git-skill verify --file src/foo.py  # Check specific file
git-skill verify --json           # Structured output
```

Example output:
```
[BLOCK] block_generator.py — max_tokens value
  You're setting max_tokens to 150. This value has been tried before:
  - ea2761a (Mar 27): Set to 150, caused Sonnet to write paragraphs
  - 0090014 (Mar 27): Increased to 200 because 150 truncated Day 2 content
  Suggestion: The problem isn't the token count — it's the prompt structure.

[WARN] rag.py — source truncation pattern
  Similar approach tried in eeea6a4 and reverted in e0137be (prod risk).

[PASS] api/routes.py — no concerning history
```

Works without an LLM configured (local-only analysis shows edit counts and revert history). With an LLM configured, provides deep reasoning about why previous attempts failed.

## Need Help?

git-skill is designed for AI agents. If you're using Claude Code, just ask:

> "Set up git-skill enrichment with my Anthropic key"
> "Run git-skill hotspots and explain what's churning"
> "Use git-skill to find why we reverted that auth change"

Claude can read the config, run the commands, and interpret the results. When in doubt, ask Claude.

## Part of the CLI Skills Ecosystem

- [`@m2015agg/supabase-skill`](https://github.com/m2015agg/supabase-skill) — Database schema intelligence
- [`@m2015agg/context7-skill`](https://github.com/m2015agg/context7-skill) — Library docs cache
- `@m2015agg/git-skill` — Git history intelligence

## Known Gaps

- **Team sharing** — Enrichments and embeddings are per-user. On a team of 3, each person pays independently for identical LLM analysis. A JSONL export/import mechanism is planned to share enrichments via git. See [team-collaboration.md](docs/specs/team-collaboration.md) for the full brainstorm.

## Detailed Documentation

- [Design Spec](docs/specs/2026-03-31-git-skill-design.md) — Full architecture, schema, algorithms, and test strategy
- [GeorgeWorks: Memory Integration](docs/specs/context-injection.md) — How context-update writes to Claude's memory system, internal architecture of `findRelevantMemories`, consolidation phases, and thresholds
- [Opus Verification Layer](docs/specs/opus-verification-layer.md) — Design and real-world case studies for the verify command
- [Churn Alerts + Verify](docs/specs/churn-alerts-and-verify.md) — Passive alerts and active verification implementation details
- [Team Collaboration](docs/specs/team-collaboration.md) — Brainstorm on sharing enrichments across teams

## License

MIT
