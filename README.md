# @m2015agg/git-skill

Git history intelligence for LLMs. Gives AI agents institutional memory over a codebase's evolution, decisions, and health trends.

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

Set your API key:

```bash
export GIT_SKILL_LLM_KEY="sk-ant-..."   # Anthropic
# or
export GIT_SKILL_LLM_KEY="sk-..."       # OpenAI
```

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

## License

MIT
