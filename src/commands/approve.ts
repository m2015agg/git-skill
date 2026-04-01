import { Command } from "commander";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";

function write(msg: string): void { process.stdout.write(msg); }

const READ_COMMANDS = [
  "Bash(git-skill search:*)",
  "Bash(git-skill timeline:*)",
  "Bash(git-skill blame:*)",
  "Bash(git-skill trends:*)",
  "Bash(git-skill hotspots:*)",
  "Bash(git-skill coupling:*)",
  "Bash(git-skill decisions:*)",
  "Bash(git-skill experts:*)",
  "Bash(git-skill diff-summary:*)",
  "Bash(git-skill why:*)",
  "Bash(git-skill regression:*)",
  "Bash(git-skill doctor:*)",
  "Bash(git-skill metric record:*)",
  "Bash(git-skill context-update:*)",
];

export function approveCommand(): Command {
  return new Command("approve")
    .description("Pre-approve read-only commands in Claude Code")
    .option("--global", "Apply to global ~/.claude/settings.json")
    .option("--remove", "Remove pre-approved permissions")
    .action((opts) => {
      const settingsDir = opts.global ? join(homedir(), ".claude") : join(process.cwd(), ".claude");
      const settingsPath = join(settingsDir, "settings.json");

      mkdirSync(settingsDir, { recursive: true });

      let settings: any = {};
      if (existsSync(settingsPath)) {
        try { settings = JSON.parse(readFileSync(settingsPath, "utf-8")); } catch { settings = {}; }
      }

      if (!settings.permissions) settings.permissions = {};
      if (!settings.permissions.allow) settings.permissions.allow = [];

      if (opts.remove) {
        settings.permissions.allow = settings.permissions.allow.filter((p: string) => !READ_COMMANDS.includes(p));
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
        write(`Removed ${READ_COMMANDS.length} git-skill permissions.\n`);
        return;
      }

      const existing = new Set(settings.permissions.allow);
      const added = READ_COMMANDS.filter(c => !existing.has(c));
      settings.permissions.allow = [...settings.permissions.allow, ...added];
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
      write(`Pre-approved ${added.length} commands (${READ_COMMANDS.length} total).\n`);
    });
}
