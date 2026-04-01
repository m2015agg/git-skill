import { Command } from "commander";
import { openDb } from "../util/db.js";
import { getLastCommitHash } from "../util/git.js";
import { join } from "path";

function write(msg: string): void { process.stdout.write(msg); }

export function metricCommand(): Command {
  const cmd = new Command("metric").description("Manual metric recording");

  cmd.command("record")
    .description("Record a metric value")
    .argument("<name>", "Metric name")
    .argument("<value>", "Metric value (number)")
    .action((name: string, value: string) => {
      const db = openDb(join(process.cwd(), ".git-history"));
      const hash = getLastCommitHash(process.cwd());
      const numValue = parseFloat(value);
      if (isNaN(numValue)) { write("Error: Value must be a number.\n"); process.exit(1); }
      db.prepare("INSERT INTO metric_values (commit_hash, metric_name, value, captured_at) VALUES (?, ?, ?, ?)").run(hash, name, numValue, new Date().toISOString());
      write(`Recorded ${name} = ${numValue} for commit ${hash.slice(0, 7)}\n`);
      db.close();
    });

  return cmd;
}
