import type Database from "better-sqlite3";

/**
 * Populates file_evolution table: file_path, first_seen, last_modified, total_commits, total_churn
 */
export function computeFileEvolution(db: Database.Database): void {
  db.exec("DELETE FROM file_evolution");

  db.exec(`
    INSERT INTO file_evolution (file_path, first_seen, last_modified, total_commits, total_churn)
    SELECT
      cf.file_path,
      MIN(c.timestamp) AS first_seen,
      MAX(c.timestamp) AS last_modified,
      COUNT(DISTINCT c.hash) AS total_commits,
      SUM(cf.insertions + cf.deletions) AS total_churn
    FROM commit_files cf
    JOIN commits c ON c.hash = cf.commit_hash
    GROUP BY cf.file_path
  `);
}

/**
 * Populates churn_hotspots: file_path, period (strftime week), commits, insertions, deletions, unique_authors
 */
export function computeChurnHotspots(db: Database.Database): void {
  db.exec("DELETE FROM churn_hotspots");

  db.exec(`
    INSERT INTO churn_hotspots (file_path, period, commits, insertions, deletions, unique_authors)
    SELECT
      cf.file_path,
      strftime('%Y-W%W', c.timestamp) AS period,
      COUNT(DISTINCT c.hash) AS commits,
      SUM(cf.insertions) AS insertions,
      SUM(cf.deletions) AS deletions,
      COUNT(DISTINCT c.author) AS unique_authors
    FROM commit_files cf
    JOIN commits c ON c.hash = cf.commit_hash
    GROUP BY cf.file_path, strftime('%Y-W%W', c.timestamp)
  `);
}

/**
 * Populates coupling: file_a, file_b, co_commit_count, coupling_score
 * Uses Jaccard-style scoring: co_commit_count / max(total_commits_a, total_commits_b)
 */
export function computeCoupling(db: Database.Database): void {
  db.exec("DELETE FROM coupling");

  // Get eligible commits: more than 1 file but no more than 50
  const eligibleCommits = db
    .prepare(
      `SELECT hash FROM commits WHERE files_changed > 1 AND files_changed <= 50`
    )
    .all() as { hash: string }[];

  if (eligibleCommits.length === 0) return;

  // Get files per commit
  const getFiles = db.prepare(
    `SELECT file_path FROM commit_files WHERE commit_hash = ?`
  );

  // Count co-occurrences
  const coCommitCounts = new Map<string, number>();
  const fileTotalCommits = new Map<string, number>();

  for (const { hash } of eligibleCommits) {
    const files = (getFiles.all(hash) as { file_path: string }[]).map(
      (r) => r.file_path
    );

    // Track per-file commit counts
    for (const f of files) {
      fileTotalCommits.set(f, (fileTotalCommits.get(f) ?? 0) + 1);
    }

    // Generate all pairs (sorted so file_a < file_b lexicographically)
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const a = files[i] < files[j] ? files[i] : files[j];
        const b = files[i] < files[j] ? files[j] : files[i];
        const key = `${a}\0${b}`;
        coCommitCounts.set(key, (coCommitCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const insertCoupling = db.prepare(`
    INSERT INTO coupling (file_a, file_b, co_commit_count, coupling_score)
    VALUES (?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (const [key, count] of coCommitCounts) {
      if (count < 2) continue;
      const [a, b] = key.split("\0");
      const totalA = fileTotalCommits.get(a) ?? 1;
      const totalB = fileTotalCommits.get(b) ?? 1;
      const score = count / Math.max(totalA, totalB);
      insertCoupling.run(a, b, count, score);
    }
  });

  insertAll();
}

/**
 * Populates decision_points: commit_hash, type, impact_score, files_affected
 */
export function computeDecisionPoints(db: Database.Database): void {
  db.exec("DELETE FROM decision_points");

  const commits = db
    .prepare(
      `SELECT hash, message, insertions, deletions, files_changed, timestamp FROM commits`
    )
    .all() as {
    hash: string;
    message: string;
    insertions: number;
    deletions: number;
    files_changed: number;
    timestamp: string;
  }[];

  const getFiles = db.prepare(
    `SELECT file_path, status FROM commit_files WHERE commit_hash = ?`
  );

  const depFiles = new Set([
    "package.json",
    "requirements.txt",
    "Cargo.toml",
    "go.mod",
  ]);
  const configPatterns = [/\.env(\.|$)/i, /\.config(\.|$)/i];

  const insert = db.prepare(`
    INSERT INTO decision_points (commit_hash, type, impact_score, files_affected)
    VALUES (?, ?, ?, ?)
  `);

  const checkNewDir = db.prepare(`
    SELECT COUNT(*) as c FROM commit_files cf
    JOIN commits cm ON cm.hash = cf.commit_hash
    WHERE cf.file_path LIKE ? AND cm.hash != ? AND cm.timestamp < ?
  `);

  const insertAll = db.transaction(() => {
    for (const commit of commits) {
      const types: string[] = [];
      const impact = (commit.insertions ?? 0) + (commit.deletions ?? 0);

      // Revert detection
      if (/revert/i.test(commit.message)) {
        types.push("revert");
      }

      // Big refactor: >= 20 files changed
      if ((commit.files_changed ?? 0) >= 20) {
        types.push("big_refactor");
      }

      // Major removal: deletions > insertions * 2 AND deletions > 20
      if (
        (commit.deletions ?? 0) > (commit.insertions ?? 0) * 2 &&
        (commit.deletions ?? 0) > 20
      ) {
        types.push("major_removal");
      }

      // File-based detections
      const files = getFiles.all(commit.hash) as {
        file_path: string;
        status: string;
      }[];
      const filePaths = files.map((f) => f.file_path);
      const fileNames = filePaths.map((p) => p.split("/").pop() ?? p);

      // Dependency change
      if (fileNames.some((n) => depFiles.has(n))) {
        types.push("dependency_change");
      }

      // Config change
      if (
        filePaths.some((p) => configPatterns.some((re) => re.test(p)))
      ) {
        types.push("config_change");
      }

      // Architecture change: new top-level src dirs created
      const newDirs = new Set<string>();
      for (const f of files) {
        if (f.status === "A") {
          const parts = f.file_path.split("/");
          // e.g. src/core/app.ts -> top-level dir under src is "src/core"
          if (parts.length >= 3 && parts[0] === "src") {
            newDirs.add(`${parts[0]}/${parts[1]}`);
          }
        }
      }
      if (newDirs.size > 0) {
        // Check if any of these dirs are brand new (no prior commits touching them)
        for (const srcDir of newDirs) {
          const prior = checkNewDir.get(`${srcDir}/%`, commit.hash, commit.timestamp) as { c: number };
          if (prior.c === 0) {
            types.push("architecture_change");
            break;
          }
        }
      }

      // Insert one row per detected type
      for (const type of types) {
        insert.run(commit.hash, type, impact, commit.files_changed ?? 0);
      }
    }
  });

  insertAll();
}

/**
 * Populates author_expertise: author, file_pattern (directory), commit_count, last_touched, expertise_score
 * Groups by author and first 2 path segments.
 */
export function computeAuthorExpertise(db: Database.Database): void {
  db.exec("DELETE FROM author_expertise");

  db.exec(`
    INSERT INTO author_expertise (author, file_pattern, commit_count, last_touched, expertise_score)
    SELECT
      c.author,
      CASE
        WHEN instr(cf.file_path, '/') = 0 THEN cf.file_path
        ELSE
          CASE
            WHEN instr(substr(cf.file_path, instr(cf.file_path, '/') + 1), '/') = 0
              THEN cf.file_path
            ELSE
              substr(cf.file_path, 1,
                instr(cf.file_path, '/') +
                instr(substr(cf.file_path, instr(cf.file_path, '/') + 1), '/') - 1
              )
          END
      END AS dir_prefix,
      COUNT(DISTINCT c.hash) AS commit_count,
      MAX(c.timestamp) AS last_touched,
      CAST(COUNT(DISTINCT c.hash) AS REAL) / (
        SELECT CAST(COUNT(DISTINCT c2.hash) AS REAL)
        FROM commits c2
        JOIN commit_files cf2 ON cf2.commit_hash = c2.hash
        WHERE cf2.file_path LIKE
          CASE
            WHEN instr(cf.file_path, '/') = 0 THEN cf.file_path || '%'
            ELSE
              CASE
                WHEN instr(substr(cf.file_path, instr(cf.file_path, '/') + 1), '/') = 0
                  THEN cf.file_path || '%'
                ELSE
                  substr(cf.file_path, 1,
                    instr(cf.file_path, '/') +
                    instr(substr(cf.file_path, instr(cf.file_path, '/') + 1), '/') - 1
                  ) || '%'
              END
          END
      ) AS expertise_score
    FROM commit_files cf
    JOIN commits c ON c.hash = cf.commit_hash
    GROUP BY c.author,
      CASE
        WHEN instr(cf.file_path, '/') = 0 THEN cf.file_path
        ELSE
          CASE
            WHEN instr(substr(cf.file_path, instr(cf.file_path, '/') + 1), '/') = 0
              THEN cf.file_path
            ELSE
              substr(cf.file_path, 1,
                instr(cf.file_path, '/') +
                instr(substr(cf.file_path, instr(cf.file_path, '/') + 1), '/') - 1
              )
          END
      END
  `);
}

/**
 * Populates trends: metric_name, period, value, delta, direction
 * Computes weekly stats and compares to previous period.
 */
export function computeTrends(db: Database.Database): void {
  db.exec("DELETE FROM trends");

  // Compute weekly stats
  const weeklyStats = db
    .prepare(
      `SELECT
        strftime('%Y-W%W', timestamp) AS period,
        COUNT(*) AS commits,
        AVG(files_changed) AS avg_files,
        SUM(insertions + deletions) AS total_churn,
        SUM(CASE WHEN lower(message) LIKE '%revert%' THEN 1 ELSE 0 END) AS reverts,
        SUM(CASE WHEN lower(message) LIKE 'fix%' OR lower(message) LIKE '%fix:%' THEN 1 ELSE 0 END) AS fixes
      FROM commits
      GROUP BY strftime('%Y-W%W', timestamp)
      ORDER BY period`
    )
    .all() as {
    period: string;
    commits: number;
    avg_files: number;
    total_churn: number;
    reverts: number;
    fixes: number;
  }[];

  if (weeklyStats.length === 0) return;

  const insert = db.prepare(`
    INSERT INTO trends (metric_name, period, value, delta, direction)
    VALUES (?, ?, ?, ?, ?)
  `);

  const metrics: Array<{
    name: string;
    getValue: (s: (typeof weeklyStats)[0]) => number;
  }> = [
    { name: "commits_per_week", getValue: (s) => s.commits },
    { name: "avg_files_per_commit", getValue: (s) => s.avg_files ?? 0 },
    { name: "total_churn", getValue: (s) => s.total_churn ?? 0 },
    {
      name: "revert_rate",
      getValue: (s) => (s.commits > 0 ? s.reverts / s.commits : 0),
    },
    {
      name: "fix_rate",
      getValue: (s) => (s.commits > 0 ? s.fixes / s.commits : 0),
    },
  ];

  const insertAll = db.transaction(() => {
    for (const metric of metrics) {
      let prevValue: number | null = null;
      for (const week of weeklyStats) {
        const value = metric.getValue(week);
        let delta: number | null = null;
        let direction: string | null = null;

        if (prevValue !== null) {
          delta = value - prevValue;
          if (Math.abs(delta) < 0.001) {
            direction = "stable";
          } else if (delta > 0) {
            direction = "up";
          } else {
            direction = "down";
          }
        }

        insert.run(metric.name, week.period, value, delta, direction);
        prevValue = value;
      }
    }
  });

  insertAll();
}

/**
 * Runs all analytics computations in order.
 */
export function runAllAnalytics(db: Database.Database): void {
  computeFileEvolution(db);
  computeChurnHotspots(db);
  computeCoupling(db);
  computeDecisionPoints(db);
  computeAuthorExpertise(db);
  computeTrends(db);
}
