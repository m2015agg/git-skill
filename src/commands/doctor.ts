import { Command } from "commander";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { isGitRepo } from "../util/git.js";
import { hasHook } from "../util/hooks.js";
import { hasDb, openDb } from "../util/db.js";

function write(msg: string): void { process.stdout.write(msg); }

interface Check { name: string; status: "pass" | "warn" | "fail"; message: string; }

export function doctorCommand(): Command {
  return new Command("doctor")
    .description("Health check — verify git-skill setup")
    .option("--json", "Output as JSON")
    .action((opts) => {
      const cwd = process.cwd();
      const checks: Check[] = [];

      // 1. Git repo
      const isRepo = isGitRepo(cwd);
      checks.push({ name: "git repo", status: isRepo ? "pass" : "fail", message: isRepo ? "Git repository detected" : "Not a git repository" });

      // 2. Post-commit hook
      const gitDir = join(cwd, ".git");
      const hookOk = isRepo && hasHook(gitDir);
      checks.push({ name: "post-commit hook", status: hookOk ? "pass" : "warn", message: hookOk ? "Hook installed" : "Hook not installed" });

      // 3. Database
      const historyDir = join(cwd, ".git-history");
      const dbOk = hasDb(historyDir);
      checks.push({ name: "history.db", status: dbOk ? "pass" : "fail", message: dbOk ? "Database exists" : "No database" });

      // 4. Snapshot freshness + commit count
      if (dbOk) {
        const db = openDb(historyDir);
        const meta = db.prepare("SELECT value FROM schema_meta WHERE key = 'last_snapshot'").get() as any;
        if (meta) {
          const hoursAgo = (Date.now() - new Date(meta.value).getTime()) / 3600000;
          checks.push({ name: "snapshot freshness", status: hoursAgo < 24 ? "pass" : "warn", message: `Last snapshot: ${Math.round(hoursAgo)}h ago` });
          const count = (db.prepare("SELECT COUNT(*) as c FROM commits").get() as any).c;
          checks.push({ name: "commit count", status: "pass", message: `${count} commits indexed` });
        }
        db.close();
      }

      // 5. .gitignore
      const gitignorePath = join(cwd, ".gitignore");
      if (existsSync(gitignorePath)) {
        const hasEntry = readFileSync(gitignorePath, "utf-8").includes(".git-history");
        checks.push({ name: ".gitignore", status: hasEntry ? "pass" : "warn", message: hasEntry ? ".git-history/ in .gitignore" : ".git-history/ not in .gitignore" });
      }

      // Output
      if (opts.json) {
        write(JSON.stringify({ checks }, null, 2) + "\n");
        return;
      }

      write("\ngit-skill doctor\n");
      write("─".repeat(40) + "\n");
      for (const c of checks) {
        const icon = c.status === "pass" ? "✓" : c.status === "warn" ? "!" : "✗";
        write(`  ${icon} ${c.name}: ${c.message}\n`);
      }
      write("\n");

      if (checks.some(c => c.status === "fail")) process.exit(1);
    });
}
