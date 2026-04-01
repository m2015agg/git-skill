import { Command } from "commander";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { openDb, hasDb } from "../util/db.js";

function write(msg: string): void {
  process.stdout.write(msg);
}

function encodeProjectPath(cwd: string): string {
  // /home/matt/bibleai → -home-matt-bibleai
  return cwd.replace(/\//g, "-");
}

function getMemoryDir(cwd: string): string {
  return join(homedir(), ".claude", "projects", encodeProjectPath(cwd), "memory");
}

interface HealthSummary {
  totalCommits: number;
  totalBranches: number;
  totalTags: number;
  hotspots: { file_path: string; commits: number; insertions: number; deletions: number }[];
  decisions: { hash: string; type: string; message: string; timestamp: string }[];
  metrics: { name: string; latest: number }[];
  alerts: string[];
  snapshotTime: string;
}

function buildSummary(historyDir: string): HealthSummary {
  const db = openDb(historyDir);

  try {
    const totalCommits = (db.prepare("SELECT COUNT(*) as c FROM commits").get() as any).c;
    const totalBranches = (db.prepare("SELECT COUNT(*) as c FROM branches").get() as any).c;
    const totalTags = (db.prepare("SELECT COUNT(*) as c FROM tags").get() as any).c;

    // Top 5 hotspots by total commits
    const hotspots = db.prepare(`
      SELECT file_path, SUM(commits) as commits, SUM(insertions) as insertions, SUM(deletions) as deletions
      FROM churn_hotspots
      GROUP BY file_path
      ORDER BY commits DESC
      LIMIT 5
    `).all() as { file_path: string; commits: number; insertions: number; deletions: number }[];

    // Recent decision points (last 10)
    const decisions = db.prepare(`
      SELECT dp.commit_hash as hash, dp.type, c.message, c.timestamp
      FROM decision_points dp
      JOIN commits c ON c.hash = dp.commit_hash
      ORDER BY c.timestamp DESC
      LIMIT 10
    `).all() as { hash: string; type: string; message: string; timestamp: string }[];

    // Latest metric values (one per metric, most recent commit)
    const metricNames = db.prepare(
      "SELECT DISTINCT metric_name FROM metric_values"
    ).all() as { metric_name: string }[];

    const metrics: { name: string; latest: number }[] = [];
    for (const { metric_name } of metricNames) {
      const row = db.prepare(`
        SELECT mv.value FROM metric_values mv
        JOIN commits c ON c.hash = mv.commit_hash
        WHERE mv.metric_name = ?
        ORDER BY c.timestamp DESC
        LIMIT 1
      `).get(metric_name) as { value: number } | undefined;
      if (row) {
        metrics.push({ name: metric_name, latest: row.value });
      }
    }

    // Generate alerts
    const alerts: string[] = [];

    const revertRate = metrics.find(m => m.name === "revert_rate");
    if (revertRate && revertRate.latest > 0.05) {
      alerts.push(`[WARN] Revert rate: ${(revertRate.latest * 100).toFixed(1)}% (threshold: 5%)`);
    }

    const fixOnFix = metrics.find(m => m.name === "fix_on_fix_rate");
    if (fixOnFix && fixOnFix.latest > 0.2) {
      alerts.push(`[WARN] Fix-on-fix rate: ${(fixOnFix.latest * 100).toFixed(1)}% (threshold: 20%)`);
    }

    const sameFileChurn = metrics.find(m => m.name === "same_file_churn");
    if (sameFileChurn && sameFileChurn.latest > 0) {
      // Find which files are thrashing
      const thrashingFiles = db.prepare(`
        SELECT file_path, COUNT(*) as cnt
        FROM commit_files
        WHERE commit_hash IN (SELECT hash FROM commits ORDER BY timestamp DESC LIMIT 10)
        GROUP BY file_path
        HAVING cnt >= 3
        ORDER BY cnt DESC
        LIMIT 3
      `).all() as { file_path: string; cnt: number }[];
      for (const f of thrashingFiles) {
        alerts.push(`[WARN] Thrashing: ${f.file_path} (${f.cnt} edits in last 10 commits)`);
      }
    }

    const snapshotMeta = db.prepare(
      "SELECT value FROM schema_meta WHERE key = 'last_snapshot'"
    ).get() as { value: string } | undefined;

    return {
      totalCommits,
      totalBranches,
      totalTags,
      hotspots,
      decisions,
      metrics,
      alerts,
      snapshotTime: snapshotMeta?.value ?? new Date().toISOString(),
    };
  } finally {
    db.close();
  }
}

function renderMemoryFile(summary: HealthSummary): string {
  const date = summary.snapshotTime.slice(0, 10);
  const lines: string[] = [];

  lines.push("---");
  lines.push("name: Git History Context");
  lines.push("description: Codebase health, churn hotspots, recent decisions, revert rate, and active alerts from git-skill snapshot");
  lines.push("type: project");
  lines.push("---");
  lines.push("");
  lines.push(`## Codebase State (${date})`);
  lines.push(`${summary.totalCommits} commits | ${summary.totalBranches} branches | ${summary.totalTags} tags`);
  lines.push("");

  if (summary.hotspots.length > 0) {
    lines.push("## Hotspots (most churn)");
    for (const h of summary.hotspots) {
      lines.push(`- ${h.file_path} — ${h.commits} commits, +${h.insertions}/-${h.deletions}`);
    }
    lines.push("");
  }

  if (summary.decisions.length > 0) {
    // Dedupe by type, show most recent of each
    const seen = new Set<string>();
    const uniqueDecisions = summary.decisions.filter(d => {
      const key = `${d.type}:${d.message.slice(0, 30)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);

    lines.push("## Recent Decisions");
    for (const d of uniqueDecisions) {
      lines.push(`- [${d.type}] ${d.message} (${d.hash.slice(0, 7)}, ${d.timestamp.slice(0, 10)})`);
    }
    lines.push("");
  }

  // Health metrics
  const revertRate = summary.metrics.find(m => m.name === "revert_rate");
  const fixRate = summary.metrics.find(m => m.name === "fix_on_fix_rate");
  const scopeCreep = summary.metrics.find(m => m.name === "scope_creep");

  lines.push("## Health");
  if (revertRate) lines.push(`- Revert rate: ${(revertRate.latest * 100).toFixed(1)}%`);
  if (fixRate) lines.push(`- Fix-on-fix rate: ${(fixRate.latest * 100).toFixed(1)}%`);
  if (scopeCreep) lines.push(`- Files per commit (latest): ${scopeCreep.latest}`);
  lines.push("");

  if (summary.alerts.length > 0) {
    lines.push("## Active Alerts");
    for (const a of summary.alerts) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function updateMemoryIndex(memoryDir: string): void {
  const indexPath = join(memoryDir, "MEMORY.md");
  const entry = "- [Git History Context](git_context.md) — codebase health, hotspots, decisions, alerts from git-skill";

  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, entry + "\n");
    return;
  }

  const content = readFileSync(indexPath, "utf-8");
  if (content.includes("git_context.md")) return; // Already indexed

  const suffix = content.endsWith("\n") ? "" : "\n";
  writeFileSync(indexPath, content + suffix + entry + "\n");
}

export function contextUpdateCommand(): Command {
  return new Command("context-update")
    .description("Update Claude memory with codebase health summary")
    .option("--json", "Output the summary as JSON")
    .action((opts: { json?: boolean }) => {
      const cwd = process.cwd();
      const historyDir = join(cwd, ".git-history");

      if (!hasDb(historyDir)) {
        write("No .git-history/ database found. Run `git-skill snapshot` first.\n");
        process.exit(1);
      }

      // Build summary from SQLite
      const summary = buildSummary(historyDir);

      if (opts.json) {
        write(JSON.stringify(summary, null, 2) + "\n");
        return;
      }

      // Render memory file
      const content = renderMemoryFile(summary);

      // Write to Claude memory directory
      const memoryDir = getMemoryDir(cwd);
      mkdirSync(memoryDir, { recursive: true });

      const filePath = join(memoryDir, "git_context.md");
      writeFileSync(filePath, content);

      // Update MEMORY.md index (write file first, then index — per GeorgeWorks spec)
      updateMemoryIndex(memoryDir);

      write(`Context updated: ${filePath}\n`);
      write(`  ${summary.totalCommits} commits | ${summary.hotspots.length} hotspots | ${summary.decisions.length} decisions | ${summary.alerts.length} alerts\n`);
    });
}

// Exported for use by snapshot command
export function runContextUpdate(cwd: string): void {
  const historyDir = join(cwd, ".git-history");
  if (!hasDb(historyDir)) return;

  const summary = buildSummary(historyDir);
  const content = renderMemoryFile(summary);
  const memoryDir = getMemoryDir(cwd);

  mkdirSync(memoryDir, { recursive: true });
  writeFileSync(join(memoryDir, "git_context.md"), content);
  updateMemoryIndex(memoryDir);
}
