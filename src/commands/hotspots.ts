import { Command } from "commander";
import { openDb } from "../util/db.js";
import { join } from "path";

export function hotspotsCommand(): Command {
  return new Command("hotspots")
    .description("Show files with the most churn")
    .option("--limit <n>", "Max results", "20")
    .option("--json", "Output as JSON")
    .action((opts: { limit: string; json?: boolean }) => {
      const historyDir = join(process.cwd(), ".git-history");
      const db = openDb(historyDir);
      try {
        const limit = parseInt(opts.limit, 10);

        const sql = `
          SELECT
            file_path,
            SUM(commits) AS commits,
            SUM(insertions) AS insertions,
            SUM(deletions) AS deletions
          FROM churn_hotspots
          GROUP BY file_path
          ORDER BY commits DESC
          LIMIT ?
        `;

        const rows = db.prepare(sql).all(limit) as Array<{
          file_path: string;
          commits: number;
          insertions: number;
          deletions: number;
        }>;

        if (opts.json) {
          process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
          return;
        }

        if (rows.length === 0) {
          process.stdout.write("No churn data found. Run `git-skill snapshot` first.\n");
          return;
        }

        const colWidth = Math.max(...rows.map((r) => r.file_path.length), 10);
        process.stdout.write(
          `${"File".padEnd(colWidth)}  ${"Commits".padStart(7)}  ${"Insertions".padStart(10)}  ${"Deletions".padStart(9)}\n`
        );
        process.stdout.write(`${"─".repeat(colWidth + 32)}\n`);
        for (const row of rows) {
          process.stdout.write(
            `${row.file_path.padEnd(colWidth)}  ${String(row.commits).padStart(7)}  +${String(row.insertions).padStart(9)}  -${String(row.deletions).padStart(8)}\n`
          );
        }
      } finally {
        db.close();
      }
    });
}
