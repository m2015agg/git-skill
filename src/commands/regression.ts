import { Command } from "commander";
import { openDb } from "../util/db.js";
import { join } from "path";
import { mean, standardDeviation } from "simple-statistics";

interface TrendPoint {
  metric_name: string;
  period: string;
  value: number;
}

interface InflectionResult {
  metric: string;
  inflection_period: string | null;
  inflection_index: number | null;
  before_mean: number | null;
  after_mean: number | null;
  method: "rolling_zscore" | "percent_change" | "none";
  significant: boolean;
  message: string;
}

function detectInflection(
  points: TrendPoint[],
  windowSize: number
): InflectionResult {
  const metric = points[0]?.metric_name ?? "unknown";
  const values = points.map((p) => p.value);
  const n = values.length;

  if (n < 2) {
    return {
      metric,
      inflection_period: null,
      inflection_index: null,
      before_mean: null,
      after_mean: null,
      method: "none",
      significant: false,
      message: "Insufficient data (need at least 2 points)",
    };
  }

  // Fallback for < 20 data points: simple percent-change
  if (n < 20) {
    const first = values[0];
    const last = values[n - 1];
    const pct = first !== 0 ? Math.abs((last - first) / first) * 100 : 0;
    const significant = pct > 20;

    // Find the point with biggest jump
    let maxDiff = 0;
    let maxIdx = 0;
    for (let i = 1; i < n; i++) {
      const diff = Math.abs(values[i] - values[i - 1]);
      if (diff > maxDiff) {
        maxDiff = diff;
        maxIdx = i;
      }
    }

    const beforeVals = values.slice(0, maxIdx);
    const afterVals = values.slice(maxIdx);

    return {
      metric,
      inflection_period: significant ? points[maxIdx].period : null,
      inflection_index: significant ? maxIdx : null,
      before_mean: beforeVals.length > 0 ? mean(beforeVals) : null,
      after_mean: afterVals.length > 0 ? mean(afterVals) : null,
      method: "percent_change",
      significant,
      message: significant
        ? `Change of ${pct.toFixed(1)}% detected; inflection at ${points[maxIdx].period}`
        : `No significant change (${pct.toFixed(1)}% overall change)`,
    };
  }

  // Rolling z-score for >= 20 data points
  const flagged: number[] = [];

  for (let i = windowSize; i < n; i++) {
    const window = values.slice(i - windowSize, i);
    const winMean = mean(window);
    let winStd: number;
    try {
      winStd = standardDeviation(window);
    } catch {
      winStd = 0;
    }
    if (winStd === 0) continue;
    const zScore = Math.abs(values[i] - winMean) / winStd;
    if (zScore > 2) {
      flagged.push(i);
    }
  }

  if (flagged.length === 0) {
    return {
      metric,
      inflection_period: null,
      inflection_index: null,
      before_mean: mean(values),
      after_mean: null,
      method: "rolling_zscore",
      significant: false,
      message: "No significant change detected",
    };
  }

  // Earliest flagged point = inflection
  const inflectionIdx = flagged[0];
  const beforeVals = values.slice(0, inflectionIdx);
  const afterVals = values.slice(inflectionIdx);

  return {
    metric,
    inflection_period: points[inflectionIdx].period,
    inflection_index: inflectionIdx,
    before_mean: beforeVals.length > 0 ? mean(beforeVals) : null,
    after_mean: afterVals.length > 0 ? mean(afterVals) : null,
    method: "rolling_zscore",
    significant: true,
    message: `Inflection detected at ${points[inflectionIdx].period} (z-score > 2)`,
  };
}

export function regressionCommand(): Command {
  return new Command("regression")
    .description("Change-point detection using rolling z-score on metric trends")
    .option("--metric <name>", "Metric to analyze", "avg_files_per_commit")
    .option("--window <n>", "Rolling window size", "10")
    .option("--json", "Output as JSON")
    .action((opts: { metric: string; window: string; json?: boolean }) => {
      const historyDir = join(process.cwd(), ".git-history");
      const db = openDb(historyDir);
      try {
        const windowSize = parseInt(opts.window, 10);

        const rows = db
          .prepare(
            `SELECT metric_name, period, value
             FROM trends
             WHERE metric_name = ?
             ORDER BY period ASC`
          )
          .all(opts.metric) as TrendPoint[];

        if (rows.length === 0) {
          // Try to find any metrics available
          const available = db
            .prepare(`SELECT DISTINCT metric_name FROM trends ORDER BY metric_name`)
            .all() as Array<{ metric_name: string }>;

          const result: InflectionResult = {
            metric: opts.metric,
            inflection_period: null,
            inflection_index: null,
            before_mean: null,
            after_mean: null,
            method: "none",
            significant: false,
            message:
              available.length > 0
                ? `No data for metric "${opts.metric}". Available: ${available.map((r) => r.metric_name).join(", ")}`
                : `No trend data found. Run \`git-skill snapshot\` first.`,
          };

          if (opts.json) {
            process.stdout.write(JSON.stringify(result, null, 2) + "\n");
          } else {
            process.stdout.write(result.message + "\n");
          }
          return;
        }

        const result = detectInflection(rows, windowSize);

        if (opts.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
          return;
        }

        process.stdout.write(`Regression Analysis: ${result.metric}\n`);
        process.stdout.write(`${"─".repeat(60)}\n`);
        process.stdout.write(`Method:     ${result.method}\n`);
        process.stdout.write(`Data pts:   ${rows.length}\n`);
        process.stdout.write(`Significant: ${result.significant ? "yes" : "no"}\n`);
        process.stdout.write(`\n${result.message}\n`);

        if (result.inflection_period) {
          process.stdout.write(`\nInflection: ${result.inflection_period} (index ${result.inflection_index})\n`);
        }
        if (result.before_mean !== null) {
          process.stdout.write(`Before mean: ${result.before_mean.toFixed(4)}\n`);
        }
        if (result.after_mean !== null) {
          process.stdout.write(`After mean:  ${result.after_mean.toFixed(4)}\n`);
        }
      } finally {
        db.close();
      }
    });
}
