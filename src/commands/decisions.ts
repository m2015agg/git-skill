import { Command } from "commander";
import { openDb } from "../util/db.js";
import { join } from "path";

export function decisionsCommand(): Command {
  return new Command("decisions")
    .description("Show decision points (reverts, refactors, architecture changes)")
    .option("--type <type>", "Filter by decision type (e.g. revert, big_refactor, architecture_change)")
    .option("--limit <n>", "Max results", "20")
    .option("--json", "Output as JSON")
    .action((opts: { type?: string; limit: string; json?: boolean }) => {
      const historyDir = join(process.cwd(), ".git-history");
      const db = openDb(historyDir);
      try {
        const limit = parseInt(opts.limit, 10);
        const params: (string | number)[] = [];
        let typeClause = "";

        if (opts.type) {
          typeClause = "WHERE dp.type = ?";
          params.push(opts.type);
        }

        params.push(limit);

        const sql = `
          SELECT
            dp.id,
            dp.commit_hash,
            dp.type,
            dp.impact_score,
            dp.files_affected,
            c.message,
            c.author,
            c.timestamp
          FROM decision_points dp
          JOIN commits c ON dp.commit_hash = c.hash
          ${typeClause}
          ORDER BY dp.impact_score DESC
          LIMIT ?
        `;

        const rows = db.prepare(sql).all(...params) as Array<{
          id: number;
          commit_hash: string;
          type: string;
          impact_score: number;
          files_affected: number;
          message: string;
          author: string;
          timestamp: string;
        }>;

        if (opts.json) {
          process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
          return;
        }

        if (rows.length === 0) {
          process.stdout.write("No decision points found.\n");
          return;
        }

        process.stdout.write(`Decision Points\n`);
        process.stdout.write(`${"─".repeat(80)}\n`);
        for (const row of rows) {
          const hash = row.commit_hash.slice(0, 7);
          const date = row.timestamp.slice(0, 10);
          process.stdout.write(
            `${hash}  [${row.type}]  impact: ${row.impact_score.toFixed(2)}  files: ${row.files_affected}  ${date}\n`
          );
          process.stdout.write(`         ${row.message}\n`);
          process.stdout.write(`         by ${row.author}\n\n`);
        }
      } finally {
        db.close();
      }
    });
}
