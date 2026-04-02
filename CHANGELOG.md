# Changelog

## v0.5.2 (2026-04-02)

### Context Update Improvements
- Added "Hotspots (last 30 days)" section alongside all-time hotspots
- Fixed "Files per commit: 0" bug — now uses rolling average of last 20 commits
- 5-minute staleness cache on post-commit hook — skips if recently updated
- `context-update --days N` flag for custom digest window
- `git-skill update` auto-generates 30-day context if missing from Claude memory
- Init and snapshot force context-update (bypass cache)

## v0.5.0 (2026-04-02)

### Dev Workflow Commands
- `git-skill init` now installs four slash commands: `/plan`, `/implement`, `/review`, `/finalize`
- Gated workflow — each phase stops and waits for approval before proceeding
- `/plan` checks git history for prior attempts before designing features
- `/implement` follows TDD with branch, draft PR, frequent commits
- `/review` runs `git-skill verify` to catch repeated mistakes
- `/finalize` runs final verification, clean commit, PR ready
- Won't overwrite existing commands — safe to customize
- Full workflow guide at `docs/workflow.md`

## v0.4.6 (2026-04-02)

### Interactive Install Wizard
- `git-skill install` now walks through embedding and enrichment setup interactively
- Choose provider (Ollama/OpenAI/Anthropic/custom), configure URL and model
- Tests embedding connection before saving
- Prompts for API key and saves to `~/.env` (mode 0600) — never stored in config
- `--ci` flag for non-interactive mode (uses defaults)

### add-key Command
- `git-skill add-key <key>` — quick way to add or update your API key
- Auto-detects provider from key prefix: `sk-ant-` = Anthropic, `sk-` = OpenAI
- Saves to `~/.env`, auto-enables enrichment in config
- OpenAI keys also auto-enable embeddings

### Daily Digest in Context Update
- `context-update` now includes a "Recent Activity" section showing commits, authors, most changed files, reverts, and fixes since last snapshot
- Nightly cron shows last 24h of activity
- `--days <n>` flag for custom window

### 30-Day History on Init
- `git-skill init` writes 30 days of commit history to Claude's memory
- First Claude session after init starts with full awareness of recent codebase evolution

### /review Slash Command
- `git-skill init` installs a `/review` command at `.claude/commands/review.md`
- Integrates `git-skill verify` into code review workflow
- BLOCK stops the review, WARN proceeds with caution, PASS continues
- Won't overwrite existing `review.md`

## v0.4.4 (2026-04-02)

### /review Slash Command
- `git-skill init` now installs a `/review` slash command at `.claude/commands/review.md`
- Integrates `git-skill verify` into the code review workflow — checks staged changes against history before merge
- BLOCK stops the review (reverted code detected), WARN proceeds with caution, PASS continues
- Checks modified files against churn hotspots
- Generic template works for any project — customize test commands for your stack
- Won't overwrite existing `review.md` (respects user customizations)

### Nightly Auto-Embed
- Snapshot Phase 7 auto-embeds new commit messages and enrichments when embedding provider is configured
- No manual `git-skill embed` needed — nightly cron handles it automatically

### Team Fetch
- Cron job runs `git fetch --all` before nightly snapshot
- Team members' commits are indexed automatically without manual pulls

### Hybrid Vector Search
- Search uses BM25 + cosine similarity with Reciprocal Rank Fusion (RRF) when embeddings exist
- `--bm25` flag to force keyword-only search
- Cosine similarity threshold (0.3) filters noise from vector results
- Enrichment text (intent + reasoning) searchable via semantic search

### Enrichment Embedding
- `git-skill embed` now also embeds enrichment text (`content_type='enrichment'`)
- `git-skill enrich` generates embeddings inline after each enrichment
- Unique index on `embeddings(commit_hash, content_type)` prevents duplicates

## v0.4.2 (2026-04-02)

### Team Collaboration
- Cron job now runs `git fetch --all` before snapshot, automatically pulling in team members' commits

### Hybrid Vector Search
- Search uses BM25 + cosine similarity with Reciprocal Rank Fusion (RRF) when embeddings exist
- `--bm25` flag to force keyword-only search
- Similarity threshold (0.3) filters out noise from vector results
- Enrichment text (intent + reasoning) is now searchable via semantic search

### Auto-Embedding
- Snapshot Phase 7 auto-embeds new commit messages and enrichments when embedding provider is configured
- `git-skill embed` now also embeds enrichment text (content_type='enrichment')
- `git-skill enrich` generates embeddings inline after each enrichment
- No manual `git-skill embed` needed — nightly cron handles it

### Smart Churn Alerts
- `context-update` detects thrashing (3+ edits in last 10 commits), revert chains, and fix-on-fix patterns
- Alerts written to Claude's memory file automatically on every commit
- Claude starts each session aware of codebase health issues

### Verify Command ("Was This Tried Before?")
- `git-skill verify` checks staged changes against enriched history
- Returns PASS / WARN / BLOCK per file with specific commit references
- Falls back to local-only analysis when no LLM configured
- Works with both Anthropic and OpenAI APIs

### GeorgeWorks (Claude Memory Integration)
- `git-skill context-update` writes codebase health to Claude's memory system
- Runs on every commit (post-commit hook) and nightly (cron)
- Writes to `~/.claude/projects/<project>/memory/git_context.md`
- Includes hotspots, recent decisions, health metrics, and active alerts

### LLM Enrichment Improvements
- Rich prompt with actual diff, file list, surrounding commits (3000 char diff truncation)
- `max_tokens` increased to 5000
- Default model: `claude-sonnet-4-5-20250514`
- Native Anthropic API support (`x-api-key` header, `/v1/messages` endpoint)
- Progress reporting every 10 commits
- `.env` file auto-loading for API keys

### Security Hardening
- All `execSync` calls replaced with `execFileSync` (no shell invocation)
- SQL LIMIT clauses use parameterized queries
- Cron entry quotes paths with spaces
- `loadDotEnv` / `resolveEnvVar` extracted to shared `src/util/env.ts`

### Infrastructure
- Version read from `package.json` (no more hardcoded version string)
- `execSync` maxBuffer increased to 50MB for large repos (2000+ commits)
- Capture command updates FTS index immediately (commits searchable without waiting for snapshot)
- Unique index on `embeddings(commit_hash, content_type)` for deduplication
- 113 tests across 25 test files

## v0.1.0 (2026-03-31)

Initial release — core CLI with 22 commands:
- SQLite cache with 14 tables across 4 layers
- Post-commit hook + snapshot pipeline
- BM25 search via FTS5
- 11 query commands (search, timeline, blame, hotspots, coupling, decisions, experts, diff-summary, trends, regression, why)
- Analytics engine (file evolution, churn hotspots, coupling, decision points, author expertise, trends)
- Built-in LLM dev quality metrics (revert rate, fix-on-fix, scope creep, time-to-commit, same-file churn)
- LLM enrichment pipeline
- Embedding provider abstraction (OpenAI, Ollama, LMStudio)
- Setup commands (init, install, doctor, approve, cron, docs, update, uninstall)
- 105 tests across 23 test files
