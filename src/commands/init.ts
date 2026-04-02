import { Command } from "commander";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import { installHook } from "../util/hooks.js";
import { isGitRepo } from "../util/git.js";
import { upsertSection } from "../util/claude-md.js";
import { getSkillDoc } from "./docs.js";
import { WALKTHROUGH, REVIEW_COMMAND } from "../templates/walkthrough.js";

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

      // 4. Write CLAUDE.md
      write("3. Writing CLAUDE.md...\n");
      const claudeMdResult = upsertSection(join(cwd, "CLAUDE.md"), getSkillDoc());
      write(`   CLAUDE.md: ${claudeMdResult}\n`);

      // 5. Write walkthrough + review command
      write("4. Writing slash commands...\n");
      const walkthroughDir = join(cwd, ".claude", "commands");
      mkdirSync(walkthroughDir, { recursive: true });
      writeFileSync(join(walkthroughDir, "git-history.md"), WALKTHROUGH);
      write("   /git-history — explore repo history\n");

      // Install review command if it doesn't already exist (don't overwrite user customizations)
      const reviewPath = join(walkthroughDir, "review.md");
      if (!existsSync(reviewPath)) {
        writeFileSync(reviewPath, REVIEW_COMMAND);
        write("   /review — code review with git-skill verify (NEW)\n");
        write("\n");
        write("   The /review command adds git history verification to your code review.\n");
        write("   It runs git-skill verify to check if staged changes repeat past mistakes,\n");
        write("   flags files in churn hotspots, and blocks re-introduction of reverted code.\n");
        write("   Customize it at .claude/commands/review.md\n");
        write("\n");
      } else {
        write("   /review — already exists (not overwritten)\n");
      }

      // 6. Run snapshot
      if (!opts.skipSnapshot) {
        write("5. Running initial snapshot...\n");
        try {
          const entryPoint = process.argv[1];
          execFileSync("node", [entryPoint, "snapshot"], { cwd, stdio: "inherit" });
        } catch {
          write("   Warning: Snapshot failed. Run `git-skill snapshot` manually.\n");
        }
      } else {
        write("5. Skipping snapshot.\n");
      }

      // 7. Run approve
      write("6. Pre-approving read-only commands...\n");
      try {
        const entryPoint = process.argv[1];
        execFileSync("node", [entryPoint, "approve"], { cwd, stdio: "inherit" });
      } catch {
        write("   Warning: Approve failed. Run `git-skill approve` manually.\n");
      }

      // 8. Cron (deferred)
      if (!opts.skipCron) {
        write("7. Cron setup deferred.\n");
      } else {
        write("7. Skipping cron.\n");
      }

      write("\ngit-skill initialized!\n");
    });
}
