import { Command } from "commander";

function write(msg: string): void { process.stdout.write(msg); }

export function getSkillDoc(): string {
  return `## git-skill (Git History Intelligence)

### Quick Reference
| Command | Use For |
|---------|---------|
| \`git-skill search <query>\` | Search commit history |
| \`git-skill timeline <path>\` | File/directory evolution |
| \`git-skill blame <path>\` | Enhanced blame with enrichments |
| \`git-skill trends\` | Metric trends dashboard |
| \`git-skill hotspots\` | Files with most churn |
| \`git-skill coupling <path>\` | Co-changed file analysis |
| \`git-skill decisions\` | Major decision points |
| \`git-skill experts <path>\` | Who has most context |
| \`git-skill diff-summary <range>\` | Range summary |
| \`git-skill why <hash>\` | Commit intent/reasoning |
| \`git-skill regression\` | Change-point detection |
| \`git-skill doctor\` | Health check |

### Write Commands (require confirmation)
| \`git-skill snapshot\` | Full re-index |
| \`git-skill enrich [range]\` | Backfill LLM enrichments |
| \`git-skill release-notes <range>\` | Generate release notes |
| \`git-skill embed\` | Generate embeddings |

### Global Flags
- \`--json\` — structured output
- \`--limit N\` — cap results
- \`--since <date>\` / \`--until <date>\` — time filter`;
}

export function docsCommand(): Command {
  return new Command("docs")
    .description("Output CLAUDE.md instruction snippet")
    .action(() => { write(getSkillDoc() + "\n"); });
}
