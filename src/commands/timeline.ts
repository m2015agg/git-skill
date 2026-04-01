import { Command } from "commander";
import { openDb } from "../util/db.js";
import { join } from "path";

export function timelineCommand(): Command {
  return new Command("timeline")
    .description("Show chronological commits for a file or directory")
    .argument("<path>", "File path or directory (end with / for directory)")
    .option("--limit <n>", "Max results", "50")
    .option("--json", "Output as JSON")
    .option("--since <date>", "Only commits after this date (ISO 8601)")
    .option("--until <date>", "Only commits before this date (ISO 8601)")
    .action((filePath: string, opts: { limit: string; json?: boolean; since?: string; until?: string }) => {
      const historyDir = join(process.cwd(), ".git-history");
      const db = openDb(historyDir);
      try {
        const isDir = filePath.endsWith("/");
        const limit = parseInt(opts.limit, 10);

        let whereClauses = ["1=1"];
        const params: (string | number)[] = [];

        if (isDir) {
          whereClauses.push("cf.file_path LIKE ?");
          params.push(`${filePath}%`);
        } else {
          whereClauses.push("cf.file_path = ?");
          params.push(filePath);
        }

        if (opts.since) {
          whereClauses.push("c.timestamp >= ?");
          params.push(opts.since);
        }
        if (opts.until) {
          whereClauses.push("c.timestamp <= ?");
          params.push(opts.until);
        }

        params.push(limit);

        const sql = `
          SELECT
            c.hash,
            c.timestamp,
            c.message,
            c.author,
            cf.file_path,
            cf.status,
            cf.insertions,
            cf.deletions
          FROM commit_files cf
          JOIN commits c ON cf.commit_hash = c.hash
          WHERE ${whereClauses.join(" AND ")}
          ORDER BY c.timestamp ASC
          LIMIT ?
        `;

        const rows = db.prepare(sql).all(...params) as Array<{
          hash: string;
          timestamp: string;
          message: string;
          author: string;
          file_path: string;
          status: string;
          insertions: number;
          deletions: number;
        }>;

        if (opts.json) {
          process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
          return;
        }

        if (rows.length === 0) {
          process.stdout.write(`No commits found for: ${filePath}\n`);
          return;
        }

        process.stdout.write(`Timeline for: ${filePath}\n`);
        process.stdout.write(`${"─".repeat(80)}\n`);
        for (const row of rows) {
          const date = row.timestamp.slice(0, 10);
          const hash = row.hash.slice(0, 7);
          const ins = `+${row.insertions}`;
          const del = `-${row.deletions}`;
          process.stdout.write(
            `${date}  ${hash}  [${row.status}]  ${ins}/${del}  ${row.file_path}\n`
          );
          process.stdout.write(`           ${row.message}\n`);
        }
      } finally {
        db.close();
      }
    });
}
