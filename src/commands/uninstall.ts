import { Command } from "commander";
import { join } from "path";
import { existsSync, rmSync } from "fs";
import { homedir } from "os";
import { isGitRepo } from "../util/git.js";
import { removeHook } from "../util/hooks.js";
import { removeSection } from "../util/claude-md.js";
import { execSync, spawnSync } from "child_process";

function write(msg: string): void { process.stdout.write(msg); }

const CRON_MARKER = "# git-skill";

function removeCronEntries(): "removed" | "not_found" {
  try {
    const crontab = execSync("crontab -l", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
    if (!crontab.includes(CRON_MARKER)) return "not_found";
    const filtered = crontab.split("\n").filter(l => !l.includes(CRON_MARKER)).join("\n");
    spawnSync("crontab", ["-"], { input: filtered, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return "removed";
  } catch {
    return "not_found";
  }
}

export function uninstallCommand(): Command {
  return new Command("uninstall")
    .description("Remove git-skill from current repository and clean up system entries")
    .option("--global", "Also remove global ~/.claude/CLAUDE.md section and config")
    .action((opts) => {
      const cwd = process.cwd();
      write("Uninstalling git-skill...\n\n");

      // 1. Remove hook
      write("1. Removing post-commit hook...\n");
      if (isGitRepo(cwd)) {
        const hookResult = removeHook(join(cwd, ".git"));
        write(`   Hook: ${hookResult}\n`);
      } else {
        write("   Not a git repo — skipping hook removal.\n");
      }

      // 2. Remove .git-history/
      write("2. Removing .git-history/ directory...\n");
      const historyDir = join(cwd, ".git-history");
      if (existsSync(historyDir)) {
        rmSync(historyDir, { recursive: true, force: true });
        write("   Removed .git-history/\n");
      } else {
        write("   .git-history/ not found — skipping.\n");
      }

      // 3. Remove local CLAUDE.md section
      write("3. Removing local .claude/CLAUDE.md section...\n");
      const localClaudeMd = join(cwd, ".claude", "CLAUDE.md");
      const localResult = removeSection(localClaudeMd);
      write(`   Local CLAUDE.md: ${localResult}\n`);

      // 4. Remove cron entry
      write("4. Removing cron entry...\n");
      const cronResult = removeCronEntries();
      write(`   Cron: ${cronResult}\n`);

      // 5. Global cleanup (opt-in)
      if (opts.global) {
        write("5. Removing global ~/.claude/CLAUDE.md section...\n");
        const globalClaudeMd = join(homedir(), ".claude", "CLAUDE.md");
        const globalResult = removeSection(globalClaudeMd);
        write(`   Global CLAUDE.md: ${globalResult}\n`);

        write("6. Removing global config ~/.config/git-skill/...\n");
        const configDir = join(homedir(), ".config", "git-skill");
        if (existsSync(configDir)) {
          rmSync(configDir, { recursive: true, force: true });
          write("   Removed ~/.config/git-skill/\n");
        } else {
          write("   Config dir not found — skipping.\n");
        }
      }

      write("\ngit-skill uninstalled.\n");
      write("To remove the CLI itself: npm uninstall -g @m2015agg/git-skill\n");
    });
}
