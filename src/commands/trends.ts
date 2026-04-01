import { Command } from "commander";
import { openDb } from "../util/db.js";
import { join } from "path";

interface TrendRow {
  metric_name: string;
  period: string;
  value: number;
  delta: number | null;
  direction: string | null;
}

interface TrendDisplay {
  metric: string;
  this_period: string;
  this_value: number;
  last_period: string | null;
  last_value: number | null;
  direction: string;
}

export function trendsCommand(): Command {
  return new Command("trends")
    .description("Metric trends dashboard")
    .option("--period <period>", "Filter by period")
    .option("--metric <name>", "Filter by metric name")
    .option("--json", "Output as JSON")
    .action((opts: { period?: string; metric?: string; json?: boolean }) => {
      const historyDir = join(process.cwd(), ".git-history");
      const db = openDb(historyDir);
      try {
        const whereClauses: string[] = [];
        const params: string[] = [];

        if (opts.period) {
          whereClauses.push("period = ?");
          params.push(opts.period);
        }
        if (opts.metric) {
          whereClauses.push("metric_name = ?");
          params.push(opts.metric);
        }

        const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

        // Get all rows ordered by metric + period
        const allRows = db
          .prepare(
            `SELECT metric_name, period, value, delta, direction
             FROM trends
             ${whereStr}
             ORDER BY metric_name ASC, period DESC`
          )
          .all(...params) as TrendRow[];

        if (opts.json) {
          process.stdout.write(JSON.stringify(allRows, null, 2) + "\n");
          return;
        }

        if (allRows.length === 0) {
          process.stdout.write("No trend data found. Run `git-skill snapshot` first.\n");
          return;
        }

        // Build display: latest period vs previous per metric
        const metricMap = new Map<string, TrendRow[]>();
        for (const row of allRows) {
          if (!metricMap.has(row.metric_name)) metricMap.set(row.metric_name, []);
          metricMap.get(row.metric_name)!.push(row);
        }

        const display: TrendDisplay[] = [];
        for (const [metric, rows] of metricMap) {
          // rows are already sorted DESC by period
          const latest = rows[0];
          const prev = rows[1] ?? null;

          let dir = latest.direction ?? "→";
          if (!latest.direction) {
            if (prev) {
              if (latest.value > prev.value) dir = "↑";
              else if (latest.value < prev.value) dir = "↓";
              else dir = "→";
            } else {
              dir = "→";
            }
          }

          display.push({
            metric,
            this_period: latest.period,
            this_value: latest.value,
            last_period: prev?.period ?? null,
            last_value: prev?.value ?? null,
            direction: dir,
          });
        }

        // Table header
        const metricWidth = Math.max(...display.map((d) => d.metric.length), 12);
        const periodWidth = Math.max(...display.map((d) => d.this_period.length), 10);

        process.stdout.write(
          `${"Metric".padEnd(metricWidth)}  ${"This Period".padStart(periodWidth)}  ${"Value".padStart(10)}  ${"Last Period".padStart(periodWidth)}  ${"Last Value".padStart(10)}  Dir\n`
        );
        process.stdout.write(`${"─".repeat(metricWidth + periodWidth * 2 + 36)}\n`);

        for (const row of display) {
          const thisVal = row.this_value.toFixed(3);
          const lastVal = row.last_value !== null ? row.last_value.toFixed(3) : "—";
          const lastPeriod = row.last_period ?? "—";
          process.stdout.write(
            `${row.metric.padEnd(metricWidth)}  ${row.this_period.padStart(periodWidth)}  ${thisVal.padStart(10)}  ${lastPeriod.padStart(periodWidth)}  ${lastVal.padStart(10)}  ${row.direction}\n`
          );
        }
      } finally {
        db.close();
      }
    });
}
