import { Command } from "commander";
import { join } from "path";
import { execFileSync } from "child_process";
import { openDb, hasDb } from "../util/db.js";

interface CommitRow {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
  insertions: number;
  deletions: number;
  files_changed: number;
}

interface EnrichmentRow {
  commit_hash: string;
  intent: string | null;
  category: string | null;
}

interface FileRow {
  file_path: string;
  status: string;
  commit_count: number;
  total_insertions: number;
  total_deletions: number;
}

interface MetricRow {
  metric_name: string;
  value: number;
  captured_at: string;
}

interface DecisionRow {
  commit_hash: string;
  type: string;
  impact_score: number;
  files_affected: number;
}

function inferCategory(message: string): string {
  const lower = message.toLowerCase();
  if (lower.startsWith("fix") || lower.includes("bug") || lower.includes("revert")) return "bugfix";
  if (lower.startsWith("feat") || lower.startsWith("add") || lower.includes("add ")) return "feature";
  if (lower.startsWith("refactor") || lower.startsWith("perf") || lower.startsWith("perf:")) return "refactor";
  if (lower.startsWith("docs") || lower.startsWith("doc")) return "docs";
  if (lower.startsWith("test") || lower.startsWith("chore") || lower.startsWith("ci") || lower.startsWith("build")) return "chore";
  return "other";
}

function getCategory(commit: CommitRow, enrichment: EnrichmentRow | undefined): string {
  if (enrichment?.category) {
    const cat = enrichment.category.toLowerCase();
    if (cat === "bugfix" || cat === "bug" || cat === "fix") return "bugfix";
    if (cat === "feature" || cat === "feat") return "feature";
    if (cat === "refactor") return "refactor";
    if (cat === "docs" || cat === "doc") return "docs";
    if (cat === "chore" || cat === "test" || cat === "ci" || cat === "build" || cat === "style") return "chore";
    return cat;
  }
  return inferCategory(commit.message);
}

export function releaseNotesCommand(): Command {
  return new Command("release-notes")
    .description("Generate aggregated release notes from git history data")
    .argument("<range>", "Git range (e.g. v1.0..v1.1 or HEAD~10..HEAD)")
    .option("--json", "Output as JSON")
    .action((range: string, opts: { json?: boolean }) => {
      const historyDir = join(process.cwd(), ".git-history");
      if (!hasDb(historyDir)) {
        process.stdout.write("No .git-history/ database found. Run `git-skill snapshot` first.\n");
        process.exit(1);
      }

      // Resolve hashes in range via git
      let rangeHashes: string[] = [];
      try {
        rangeHashes = execFileSync("git", ["rev-list", range], {
          cwd: process.cwd(),
          encoding: "utf-8",
          timeout: 10000,
        })
          .trim()
          .split("\n")
          .filter(Boolean);
      } catch {
        process.stdout.write(`Error: could not resolve range "${range}"\n`);
        process.exit(1);
      }

      if (rangeHashes.length === 0) {
        process.stdout.write(`No commits found in range "${range}"\n`);
        return;
      }

      const db = openDb(historyDir);
      try {
        const placeholders = rangeHashes.map(() => "?").join(",");

        const commits = db
          .prepare(
            `SELECT hash, message, author, timestamp, insertions, deletions, files_changed
             FROM commits WHERE hash IN (${placeholders})
             ORDER BY timestamp DESC`
          )
          .all(...rangeHashes) as CommitRow[];

        const enrichments = db
          .prepare(
            `SELECT commit_hash, intent, category FROM enrichments WHERE commit_hash IN (${placeholders})`
          )
          .all(...rangeHashes) as EnrichmentRow[];

        const enrichmentMap = new Map<string, EnrichmentRow>();
        for (const e of enrichments) enrichmentMap.set(e.commit_hash, e);

        const files = db
          .prepare(
            `SELECT file_path, status, COUNT(*) as commit_count,
                    SUM(insertions) as total_insertions, SUM(deletions) as total_deletions
             FROM commit_files WHERE commit_hash IN (${placeholders})
             GROUP BY file_path
             ORDER BY commit_count DESC`
          )
          .all(...rangeHashes) as FileRow[];

        const decisions = db
          .prepare(
            `SELECT commit_hash, type, impact_score, files_affected
             FROM decision_points WHERE commit_hash IN (${placeholders})
             ORDER BY impact_score DESC`
          )
          .all(...rangeHashes) as DecisionRow[];

        const metrics = db
          .prepare(
            `SELECT metric_name, value, captured_at FROM metric_values
             WHERE commit_hash IN (${placeholders})
             ORDER BY captured_at DESC`
          )
          .all(...rangeHashes) as MetricRow[];

        // Group commits by category
        const grouped: Record<string, CommitRow[]> = {
          feature: [],
          bugfix: [],
          refactor: [],
          docs: [],
          chore: [],
          other: [],
        };

        for (const commit of commits) {
          const enrichment = enrichmentMap.get(commit.hash);
          const category = getCategory(commit, enrichment);
          if (grouped[category]) {
            grouped[category].push(commit);
          } else {
            grouped.other.push(commit);
          }
        }

        // Compute file impact
        const newFiles = files.filter((f) => f.status === "A");
        const deletedFiles = files.filter((f) => f.status === "D");
        const mostChanged = files.slice(0, 5);

        // Total churn stats
        const totalInsertions = commits.reduce((sum, c) => sum + c.insertions, 0);
        const totalDeletions = commits.reduce((sum, c) => sum + c.deletions, 0);

        if (opts.json) {
          process.stdout.write(
            JSON.stringify(
              {
                range,
                commits: commits.length,
                summary: {
                  features: grouped.feature.length,
                  bugfixes: grouped.bugfix.length,
                  refactors: grouped.refactor.length,
                  docs: grouped.docs.length,
                  chores: grouped.chore.length,
                  other: grouped.other.length,
                  total_insertions: totalInsertions,
                  total_deletions: totalDeletions,
                },
                grouped,
                file_impact: {
                  most_changed: mostChanged,
                  new_files: newFiles.length,
                  deleted_files: deletedFiles.length,
                },
                architecture_changes: decisions.filter(
                  (d) => d.type === "architecture_change" || d.type === "big_refactor"
                ),
                health: metrics.slice(0, 20),
              },
              null,
              2
            ) + "\n"
          );
          return;
        }

        // Markdown output
        const lines: string[] = [];

        lines.push(`# Release Notes: ${range}`);
        lines.push("");
        lines.push("## Summary");
        lines.push("");
        lines.push(`- **${commits.length}** commits in this range`);
        lines.push(`- **+${totalInsertions}** insertions, **-${totalDeletions}** deletions`);
        lines.push(`- ${grouped.feature.length} feature${grouped.feature.length !== 1 ? "s" : ""}, ${grouped.bugfix.length} fix${grouped.bugfix.length !== 1 ? "es" : ""}, ${grouped.refactor.length} refactor${grouped.refactor.length !== 1 ? "s" : ""}`);
        lines.push("");

        if (grouped.feature.length > 0) {
          lines.push("## Features");
          lines.push("");
          for (const c of grouped.feature) {
            const e = enrichmentMap.get(c.hash);
            const desc = e?.intent ?? c.message;
            lines.push(`- **${c.hash.slice(0, 7)}** ${desc}`);
          }
          lines.push("");
        }

        if (grouped.bugfix.length > 0) {
          lines.push("## Fixes");
          lines.push("");
          for (const c of grouped.bugfix) {
            const e = enrichmentMap.get(c.hash);
            const desc = e?.intent ?? c.message;
            lines.push(`- **${c.hash.slice(0, 7)}** ${desc}`);
          }
          lines.push("");
        }

        const archChanges = decisions.filter(
          (d) => d.type === "architecture_change" || d.type === "big_refactor"
        );
        if (archChanges.length > 0 || grouped.refactor.length > 0) {
          lines.push("## Architecture Changes");
          lines.push("");
          for (const d of archChanges) {
            const c = commits.find((x) => x.hash === d.commit_hash);
            if (c) {
              lines.push(`- **${c.hash.slice(0, 7)}** [${d.type}] ${c.message} (impact: ${d.impact_score.toFixed(2)})`);
            }
          }
          for (const c of grouped.refactor) {
            if (!archChanges.find((d) => d.commit_hash === c.hash)) {
              const e = enrichmentMap.get(c.hash);
              const desc = e?.intent ?? c.message;
              lines.push(`- **${c.hash.slice(0, 7)}** ${desc}`);
            }
          }
          lines.push("");
        }

        if (files.length > 0) {
          lines.push("## File Impact");
          lines.push("");
          if (newFiles.length > 0) {
            lines.push(`**New files:** ${newFiles.length}`);
            for (const f of newFiles.slice(0, 5)) {
              lines.push(`  - \`${f.file_path}\``);
            }
            if (newFiles.length > 5) lines.push(`  - ... and ${newFiles.length - 5} more`);
          }
          if (deletedFiles.length > 0) {
            lines.push(`**Deleted files:** ${deletedFiles.length}`);
            for (const f of deletedFiles.slice(0, 3)) {
              lines.push(`  - \`${f.file_path}\``);
            }
          }
          if (mostChanged.length > 0) {
            lines.push(`**Most changed files:**`);
            for (const f of mostChanged) {
              lines.push(`  - \`${f.file_path}\` (${f.commit_count} commits, +${f.total_insertions} -${f.total_deletions})`);
            }
          }
          lines.push("");
        }

        if (metrics.length > 0) {
          // Show latest value per metric
          const latestMetrics = new Map<string, MetricRow>();
          for (const m of metrics) {
            if (!latestMetrics.has(m.metric_name)) latestMetrics.set(m.metric_name, m);
          }
          lines.push("## Health Report");
          lines.push("");
          for (const [name, m] of latestMetrics) {
            lines.push(`- **${name}**: ${m.value}`);
          }
          lines.push("");
        }

        process.stdout.write(lines.join("\n") + "\n");
      } finally {
        db.close();
      }
    });
}
