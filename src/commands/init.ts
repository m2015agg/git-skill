import { Command } from "commander";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "fs";
import { installHook } from "../util/hooks.js";
import { isGitRepo } from "../util/git.js";
import { execSync } from "child_process";

function write(msg: string): void { process.stdout.write(msg); }

export function initCommand(): Command {
  return new Command("init")
    .description("Initialize git-skill in the current repository")
    .option("--skip-snapshot", "Skip initial snapshot")
    .option("--skip-cron", "Skip cron setup")
    .action((opts) => {
      const cwd = process.cwd();
      if (!isGitRepo(cwd)) {
        write("Error: Not a git repository.\n");
        process.exit(1);
      }

      write("Initializing git-skill...\n\n");

      // 1. Install hook
      write("1. Installing post-commit hook...\n");
      const hookResult = installHook(join(cwd, ".git"));
      write(`   Hook: ${hookResult}\n`);

      // 2. Update .gitignore
      write("2. Updating .gitignore...\n");
      const gitignorePath = join(cwd, ".gitignore");
      const entry = ".git-history/";
      if (existsSync(gitignorePath)) {
        const content = readFileSync(gitignorePath, "utf-8");
        if (!content.includes(entry)) {
          const suffix = content.endsWith("\n") ? "" : "\n";
          appendFileSync(gitignorePath, suffix + entry + "\n");
          write("   Added .git-history/ to .gitignore.\n");
        } else {
          write("   Already in .gitignore.\n");
        }
      } else {
        writeFileSync(gitignorePath, entry + "\n");
        write("   Created .gitignore.\n");
      }

      // 3. Create .git-history dir
      mkdirSync(join(cwd, ".git-history"), { recursive: true });

      // 4. Run snapshot
      if (!opts.skipSnapshot) {
        write("3. Running initial snapshot...\n");
        try {
          const entryPoint = process.argv[1];
          execSync(`node ${entryPoint} snapshot`, { cwd, stdio: "inherit" });
        } catch {
          write("   Warning: Snapshot failed. Run `git-skill snapshot` manually.\n");
        }
      } else {
        write("3. Skipping snapshot.\n");
      }

      // 5. Cron (deferred)
      if (!opts.skipCron) {
        write("4. Cron setup deferred.\n");
      } else {
        write("4. Skipping cron.\n");
      }

      write("\ngit-skill initialized!\n");
    });
}
