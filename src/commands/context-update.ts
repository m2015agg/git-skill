import { Command } from "commander";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "fs";
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

interface DailyDigest {
  newCommits: { hash: string; message: string; author: string; timestamp: string }[];
  activeAuthors: string[];
  filesChanged: { file_path: string; count: number }[];
  newReverts: string[];
  newFixes: string[];
}

interface HealthSummary {
  totalCommits: number;
  totalBranches: number;
  totalTags: number;
  hotspots: { file_path: string; commits: number; insertions: number; deletions: number }[];
  recentHotspots: { file_path: string; commits: number }[];
  avgFilesPerCommit: number;
  decisions: { hash: string; type: string; message: string; timestamp: string }[];
  metrics: { name: string; latest: number }[];
  alerts: string[];
  snapshotTime: string;
  digest: DailyDigest;
}

function buildSummary(historyDir: string, digestDays = 1): HealthSummary {
  const db = openDb(historyDir);

  try {
    const totalCommits = (db.prepare("SELECT COUNT(*) as c FROM commits").get() as any).c;
    const totalBranches = (db.prepare("SELECT COUNT(*) as c FROM branches").get() as any).c;
    const totalTags = (db.prepare("SELECT COUNT(*) as c FROM tags").get() as any).c;

    // Top 5 hotspots all-time
    const hotspots = db.prepare(`
      SELECT file_path, SUM(commits) as commits, SUM(insertions) as insertions, SUM(deletions) as deletions
      FROM churn_hotspots
      GROUP BY file_path
      ORDER BY commits DESC
      LIMIT 5
    `).all() as { file_path: string; commits: number; insertions: number; deletions: number }[];

    // Top 5 hotspots last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const recentHotspots = db.prepare(`
      SELECT cf.file_path, COUNT(DISTINCT cf.commit_hash) as commits
      FROM commit_files cf
      JOIN commits c ON c.hash = cf.commit_hash
      WHERE c.timestamp > ?
      GROUP BY cf.file_path
      ORDER BY commits DESC
      LIMIT 5
    `).all(thirtyDaysAgo) as { file_path: string; commits: number }[];

    // Average files per commit (last 20 commits, skip merges/empty)
    const avgFilesPerCommit = db.prepare(`
      SELECT AVG(files_changed) as avg FROM (
        SELECT files_changed FROM commits
        WHERE files_changed > 0
        ORDER BY timestamp DESC LIMIT 20
      )
    `).get() as { avg: number | null };

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

    // 1. Value Thrashing — files edited 3+ times in last 10 commits
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
      alerts.push(`[WARN] Thrashing: ${f.file_path} edited ${f.cnt} times in last 10 commits`);
    }

    // 2. Revert Chains — files involved in revert commits (last 50 commits)
    const revertedFiles = db.prepare(`
      SELECT cf.file_path, COUNT(*) as revert_count
      FROM commits c
      JOIN commit_files cf ON cf.commit_hash = c.hash
      WHERE (c.message LIKE '%revert%' OR c.message LIKE '%Revert%')
        AND c.hash IN (SELECT hash FROM commits ORDER BY timestamp DESC LIMIT 50)
      GROUP BY cf.file_path
      HAVING revert_count >= 1
      ORDER BY revert_count DESC
      LIMIT 3
    `).all() as { file_path: string; revert_count: number }[];
    for (const f of revertedFiles) {
      alerts.push(`[WARN] Reverted: ${f.file_path} involved in ${f.revert_count} reverts recently`);
    }

    // 3. Fix-on-Fix Chains — files touched by 2+ sequential fix commits
    const fixCommits = db.prepare(`
      SELECT hash FROM commits
      WHERE message LIKE '%fix%' OR message LIKE '%Fix%'
      ORDER BY timestamp DESC
      LIMIT 20
    `).all() as { hash: string }[];

    if (fixCommits.length >= 2) {
      const fixHashes = fixCommits.map(r => r.hash);
      const placeholders = fixHashes.map(() => "?").join(",");
      const fixFileCounts = db.prepare(`
        SELECT file_path, COUNT(DISTINCT commit_hash) as fix_count
        FROM commit_files
        WHERE commit_hash IN (${placeholders})
        GROUP BY file_path
        HAVING fix_count >= 2
        ORDER BY fix_count DESC
        LIMIT 3
      `).all(...fixHashes) as { file_path: string; fix_count: number }[];
      for (const f of fixFileCounts) {
        alerts.push(`[WARN] Fix-on-fix: ${f.file_path} has ${f.fix_count} sequential fixes`);
      }
    }

    // Also keep metric-level alerts for revert rate and fix-on-fix rate thresholds
    const revertRate = metrics.find(m => m.name === "revert_rate");
    if (revertRate && revertRate.latest > 0.05) {
      alerts.push(`[WARN] Revert rate: ${(revertRate.latest * 100).toFixed(1)}% (threshold: 5%)`);
    }

    const fixOnFix = metrics.find(m => m.name === "fix_on_fix_rate");
    if (fixOnFix && fixOnFix.latest > 0.2) {
      alerts.push(`[WARN] Fix-on-fix rate: ${(fixOnFix.latest * 100).toFixed(1)}% (threshold: 20%)`);
    }

    // Cap at 5 alerts, most specific (file-level) first
    alerts.splice(5);

    // Daily digest — what changed since last snapshot (or last 24h)
    const snapshotMeta = db.prepare(
      "SELECT value FROM schema_meta WHERE key = 'last_snapshot'"
    ).get() as { value: string } | undefined;

    const msWindow = digestDays * 86400000;
    const sinceTime = snapshotMeta?.value && digestDays <= 1
      ? new Date(new Date(snapshotMeta.value).getTime() - msWindow).toISOString()
      : new Date(Date.now() - msWindow).toISOString();

    const commitLimit = digestDays > 1 ? 30 : 15;
    const newCommits = db.prepare(`
      SELECT hash, message, author, timestamp FROM commits
      WHERE timestamp > ? ORDER BY timestamp DESC LIMIT ?
    `).all(sinceTime, commitLimit) as { hash: string; message: string; author: string; timestamp: string }[];

    const activeAuthors = [...new Set(newCommits.map(c => c.author))];

    const filesChanged = newCommits.length > 0
      ? db.prepare(`
          SELECT file_path, COUNT(*) as count FROM commit_files
          WHERE commit_hash IN (${newCommits.map(() => "?").join(",")})
          GROUP BY file_path ORDER BY count DESC LIMIT 5
        `).all(...newCommits.map(c => c.hash)) as { file_path: string; count: number }[]
      : [];

    const newReverts = newCommits
      .filter(c => /revert/i.test(c.message))
      .map(c => `${c.hash.slice(0, 7)}: ${c.message}`);

    const newFixes = newCommits
      .filter(c => /\bfix\b/i.test(c.message))
      .map(c => `${c.hash.slice(0, 7)}: ${c.message}`);

    const digest: DailyDigest = { newCommits, activeAuthors, filesChanged, newReverts, newFixes };

    return {
      totalCommits,
      totalBranches,
      totalTags,
      hotspots,
      recentHotspots,
      avgFilesPerCommit: avgFilesPerCommit?.avg ?? 0,
      decisions,
      metrics,
      alerts,
      snapshotTime: snapshotMeta?.value ?? new Date().toISOString(),
      digest,
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

  if (summary.recentHotspots.length > 0) {
    lines.push("## Hotspots (last 30 days)");
    for (const h of summary.recentHotspots) {
      lines.push(`- ${h.file_path} — ${h.commits} commits`);
    }
    lines.push("");
  }

  if (summary.hotspots.length > 0) {
    lines.push("## Hotspots (all-time)");
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

  lines.push("## Health");
  if (revertRate) lines.push(`- Revert rate: ${(revertRate.latest * 100).toFixed(1)}%`);
  if (fixRate) lines.push(`- Fix-on-fix rate: ${(fixRate.latest * 100).toFixed(1)}%`);
  if (summary.avgFilesPerCommit > 0) lines.push(`- Avg files per commit: ${summary.avgFilesPerCommit.toFixed(1)}`);
  lines.push("");

  if (summary.alerts.length > 0) {
    lines.push("## Active Alerts");
    for (const a of summary.alerts) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }

  // Daily digest
  const d = summary.digest;
  if (d.newCommits.length > 0) {
    lines.push("## Recent Activity");
    lines.push(`${d.newCommits.length} commits by ${d.activeAuthors.join(", ")}`);
    for (const c of d.newCommits.slice(0, 8)) {
      lines.push(`- ${c.hash.slice(0, 7)} ${c.message} (${c.author}, ${c.timestamp.slice(0, 10)})`);
    }
    if (d.newCommits.length > 8) lines.push(`- ... and ${d.newCommits.length - 8} more`);
    lines.push("");

    if (d.filesChanged.length > 0) {
      lines.push("Most active files:");
      for (const f of d.filesChanged) {
        lines.push(`- ${f.file_path} (${f.count} changes)`);
      }
      lines.push("");
    }

    if (d.newReverts.length > 0) {
      lines.push("Reverts:");
      for (const r of d.newReverts) lines.push(`- ${r}`);
      lines.push("");
    }

    if (d.newFixes.length > 0) {
      lines.push("Fixes:");
      for (const f of d.newFixes) lines.push(`- ${f}`);
      lines.push("");
    }
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
    .option("--days <n>", "Days of activity to include in digest (default: 1)", "1")
    .action((opts: { json?: boolean; days: string }) => {
      const cwd = process.cwd();
      const historyDir = join(cwd, ".git-history");

      if (!hasDb(historyDir)) {
        write("No .git-history/ database found. Run `git-skill snapshot` first.\n");
        process.exit(1);
      }

      const digestDays = parseInt(opts.days, 10) || 1;
      const summary = buildSummary(historyDir, digestDays);

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

// Exported for use by snapshot command and init
export function runContextUpdate(cwd: string, digestDays = 1, force = false): void {
  const historyDir = join(cwd, ".git-history");
  if (!hasDb(historyDir)) return;

  // Skip if last update was less than 5 minutes ago (avoid redundant writes on every commit)
  if (!force && digestDays <= 1) {
    const memoryDir = getMemoryDir(cwd);
    const contextPath = join(memoryDir, "git_context.md");
    if (existsSync(contextPath)) {
      try {
        const stat = statSync(contextPath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs < 5 * 60 * 1000) return; // less than 5 min old, skip
      } catch { /* proceed if stat fails */ }
    }
  }

  const summary = buildSummary(historyDir, digestDays);
  const content = renderMemoryFile(summary);
  const memoryDir = getMemoryDir(cwd);

  mkdirSync(memoryDir, { recursive: true });
  writeFileSync(join(memoryDir, "git_context.md"), content);
  updateMemoryIndex(memoryDir);
}
