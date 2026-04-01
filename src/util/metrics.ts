import type Database from "better-sqlite3";

export function computeBuiltinMetrics(db: Database.Database): void {
  // Clear existing built-in metrics
  db.prepare("DELETE FROM metric_values WHERE metric_name IN ('revert_rate', 'fix_on_fix_rate', 'scope_creep', 'time_to_commit', 'same_file_churn', 'dependency_churn')").run();

  const commits = db.prepare(
    "SELECT hash, message, timestamp, files_changed FROM commits ORDER BY timestamp ASC"
  ).all() as { hash: string; message: string; timestamp: string; files_changed: number }[];

  const insert = db.prepare(
    "INSERT INTO metric_values (commit_hash, metric_name, value, captured_at) VALUES (?, ?, ?, ?)"
  );
  const now = new Date().toISOString();
  const window = 10;

  db.transaction(() => {
    for (let i = 0; i < commits.length; i++) {
      const c = commits[i];
      const windowStart = Math.max(0, i - window + 1);
      const windowCommits = commits.slice(windowStart, i + 1);

      // Revert rate (rolling)
      const reverts = windowCommits.filter(wc => /revert/i.test(wc.message)).length;
      insert.run(c.hash, "revert_rate", reverts / windowCommits.length, now);

      // Fix-on-fix rate
      const fixes = windowCommits.filter(wc => /\bfix\b/i.test(wc.message)).length;
      insert.run(c.hash, "fix_on_fix_rate", fixes / windowCommits.length, now);

      // Scope creep (files per commit)
      insert.run(c.hash, "scope_creep", c.files_changed, now);

      // Time-to-commit (minutes since previous)
      if (i > 0) {
        const minutes = (new Date(c.timestamp).getTime() - new Date(commits[i-1].timestamp).getTime()) / 60000;
        insert.run(c.hash, "time_to_commit", minutes, now);
      }

      // Same-file churn (files edited 3+ times in last 5 commits)
      if (i >= 2) {
        const recentHashes = commits.slice(Math.max(0, i - 4), i + 1).map(rc => rc.hash);
        const placeholders = recentHashes.map(() => "?").join(",");
        const churnFiles = db.prepare(`
          SELECT file_path, COUNT(*) as cnt FROM commit_files
          WHERE commit_hash IN (${placeholders}) GROUP BY file_path HAVING cnt >= 3
        `).all(...recentHashes) as any[];
        insert.run(c.hash, "same_file_churn", churnFiles.length, now);
      } else {
        insert.run(c.hash, "same_file_churn", 0, now);
      }
    }
  })();
}
