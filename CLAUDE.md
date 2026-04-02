<!-- git-skill:start -->
## git-skill (Git History Intelligence)

### Quick Reference
| Command | Use For |
|---------|---------|
| `git-skill search <query>` | Search commit history |
| `git-skill timeline <path>` | File/directory evolution |
| `git-skill blame <path>` | Enhanced blame with enrichments |
| `git-skill trends` | Metric trends dashboard |
| `git-skill hotspots` | Files with most churn |
| `git-skill coupling <path>` | Co-changed file analysis |
| `git-skill decisions` | Major decision points |
| `git-skill experts <path>` | Who has most context |
| `git-skill diff-summary <range>` | Range summary |
| `git-skill why <hash>` | Commit intent/reasoning |
| `git-skill regression` | Change-point detection |
| `git-skill verify` | Check staged changes against history (was this tried before?) |
| `git-skill context-update` | Refresh Claude memory with codebase health |
| `git-skill doctor` | Health check |

### Write Commands (require confirmation)
| `git-skill snapshot` | Full re-index |
| `git-skill enrich [range]` | Backfill LLM enrichments |
| `git-skill release-notes <range>` | Generate release notes |
| `git-skill embed` | Generate embeddings |

### Smart Alerts (automatic, written to Claude memory)
- Thrashing detection: files edited 3+ times in last 10 commits
- Revert chain detection: files involved in recent reverts
- Fix-on-fix detection: sequential fix commits on same file
- Runs on every commit (post-commit hook) and nightly (cron)

### Global Flags
- `--json` — structured output
- `--limit N` — cap results
- `--since <date>` / `--until <date>` — time filter
<!-- git-skill:end -->
