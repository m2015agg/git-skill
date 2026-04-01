import { Command } from "commander";
import { openDb } from "../util/db.js";
import { join } from "path";

export function couplingCommand(): Command {
  return new Command("coupling")
    .description("Show files that co-change with a given path")
    .argument("<path>", "File path to check coupling for")
    .option("--limit <n>", "Max results", "20")
    .option("--json", "Output as JSON")
    .action((filePath: string, opts: { limit: string; json?: boolean }) => {
      const historyDir = join(process.cwd(), ".git-history");
      const db = openDb(historyDir);
      try {
        const limit = parseInt(opts.limit, 10);

        const sql = `
          SELECT
            CASE WHEN file_a = ? THEN file_b ELSE file_a END AS paired_file,
            co_commit_count,
            coupling_score
          FROM coupling
          WHERE file_a = ? OR file_b = ?
          ORDER BY coupling_score DESC
          LIMIT ?
        `;

        const rows = db.prepare(sql).all(filePath, filePath, filePath, limit) as Array<{
          paired_file: string;
          co_commit_count: number;
          coupling_score: number;
        }>;

        if (opts.json) {
          process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
          return;
        }

        if (rows.length === 0) {
          process.stdout.write(`No coupling data found for: ${filePath}\n`);
          return;
        }

        process.stdout.write(`Files that co-change with: ${filePath}\n`);
        process.stdout.write(`${"─".repeat(80)}\n`);
        const colWidth = Math.max(...rows.map((r) => r.paired_file.length), 10);
        process.stdout.write(
          `${"Paired File".padEnd(colWidth)}  ${"Co-Commits".padStart(10)}  ${"Score".padStart(8)}\n`
        );
        process.stdout.write(`${"─".repeat(colWidth + 22)}\n`);
        for (const row of rows) {
          process.stdout.write(
            `${row.paired_file.padEnd(colWidth)}  ${String(row.co_commit_count).padStart(10)}  ${row.coupling_score.toFixed(3).padStart(8)}\n`
          );
        }
      } finally {
        db.close();
      }
    });
}
