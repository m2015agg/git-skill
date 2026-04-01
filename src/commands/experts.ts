import { Command } from "commander";
import { openDb } from "../util/db.js";
import { join } from "path";

export function expertsCommand(): Command {
  return new Command("experts")
    .description("Show who has most expertise in a path")
    .argument("<path>", "File path or pattern to check expertise for")
    .option("--limit <n>", "Max results", "10")
    .option("--json", "Output as JSON")
    .action((filePath: string, opts: { limit: string; json?: boolean }) => {
      const historyDir = join(process.cwd(), ".git-history");
      const db = openDb(historyDir);
      try {
        const limit = parseInt(opts.limit, 10);

        // Normalize the path: strip trailing slash for matching
        const normalizedPath = filePath.replace(/\/+$/, "");
        // Match rows where file_pattern equals or starts with the given prefix
        const pattern = `${normalizedPath}%`;

        const sql = `
          SELECT
            author,
            file_pattern,
            commit_count,
            last_touched,
            expertise_score
          FROM author_expertise
          WHERE file_pattern LIKE ?
          ORDER BY expertise_score DESC
          LIMIT ?
        `;

        const rows = db.prepare(sql).all(pattern, limit) as Array<{
          author: string;
          file_pattern: string;
          commit_count: number;
          last_touched: string;
          expertise_score: number;
        }>;

        if (opts.json) {
          process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
          return;
        }

        if (rows.length === 0) {
          process.stdout.write(`No expertise data found for: ${filePath}\n`);
          return;
        }

        process.stdout.write(`Experts for: ${filePath}\n`);
        process.stdout.write(`${"─".repeat(80)}\n`);
        const colWidth = Math.max(...rows.map((r) => r.author.length), 10);
        process.stdout.write(
          `${"Author".padEnd(colWidth)}  ${"Commits".padStart(7)}  ${"Last Touched".padStart(12)}  ${"Score".padStart(8)}\n`
        );
        process.stdout.write(`${"─".repeat(colWidth + 32)}\n`);
        for (const row of rows) {
          const lastTouched = row.last_touched ? row.last_touched.slice(0, 10) : "unknown";
          process.stdout.write(
            `${row.author.padEnd(colWidth)}  ${String(row.commit_count).padStart(7)}  ${lastTouched.padStart(12)}  ${row.expertise_score.toFixed(3).padStart(8)}\n`
          );
        }
      } finally {
        db.close();
      }
    });
}
