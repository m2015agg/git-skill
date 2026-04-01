import { Command } from "commander";
import { execSync, spawnSync } from "child_process";

function write(msg: string): void { process.stdout.write(msg); }

const CRON_MARKER = "# git-skill";

function getCrontab(): string {
  try {
    return execSync("crontab -l", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function setCrontab(content: string): void {
  const result = spawnSync("crontab", ["-"], {
    input: content,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`crontab write failed: ${result.stderr}`);
  }
}

function buildCronLine(cwd: string): string {
  return `0 3 * * * cd '${cwd.replace(/'/g, "'\\''")}' && git-skill snapshot ${CRON_MARKER}`;
}

export function cronCommand(): Command {
  return new Command("cron")
    .description("Set up nightly snapshot via crontab")
    .option("--status", "Show current cron entry")
    .option("--remove", "Remove cron entry")
    .action((opts) => {
      const crontab = getCrontab();

      if (opts.status) {
        const lines = crontab.split("\n").filter(l => l.includes(CRON_MARKER));
        if (lines.length === 0) {
          write("No git-skill cron entry found.\n");
        } else {
          write("Current git-skill cron entries:\n");
          lines.forEach(l => write(`  ${l}\n`));
        }
        return;
      }

      if (opts.remove) {
        const filtered = crontab.split("\n").filter(l => !l.includes(CRON_MARKER)).join("\n");
        setCrontab(filtered.trim() ? filtered : "");
        write("Removed git-skill cron entry.\n");
        return;
      }

      // Add cron entry
      const cwd = process.cwd();
      const cronLine = buildCronLine(cwd);

      if (crontab.includes(CRON_MARKER)) {
        // Replace existing entry
        const updated = crontab
          .split("\n")
          .map(l => l.includes(CRON_MARKER) ? cronLine : l)
          .join("\n");
        setCrontab(updated);
        write(`Updated cron entry for ${cwd}.\n`);
      } else {
        const separator = crontab.trim() ? "\n" : "";
        setCrontab(crontab + separator + cronLine + "\n");
        write(`Added nightly snapshot cron job (3 AM) for ${cwd}.\n`);
      }

      write(`Entry: ${cronLine}\n`);
    });
}
