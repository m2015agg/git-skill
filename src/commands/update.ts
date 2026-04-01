import { Command } from "commander";
import { execSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

function write(msg: string): void { process.stdout.write(msg); }

const PACKAGE_NAME = "@m2015agg/git-skill";

function getCurrentVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "../../package.json");
    const pkg = require(pkgPath);
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function getLatestVersion(): string {
  try {
    return execSync(`npm view ${PACKAGE_NAME} version`, { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

export function updateCommand(): Command {
  return new Command("update")
    .description("Self-update git-skill to the latest version")
    .option("--check", "Show current vs latest version without updating")
    .action((opts) => {
      const current = getCurrentVersion();

      if (opts.check) {
        write(`Current version: ${current}\n`);
        write("Checking latest...\n");
        const latest = getLatestVersion();
        write(`Latest version:  ${latest}\n`);
        if (latest !== "unknown" && latest !== current) {
          write(`\nUpdate available! Run: git-skill update\n`);
        } else if (latest === current) {
          write("\nAlready up to date.\n");
        }
        return;
      }

      write(`Current version: ${current}\n`);
      write(`Updating ${PACKAGE_NAME} to latest...\n`);
      try {
        execSync(`npm install -g ${PACKAGE_NAME}@latest`, { stdio: "inherit" });
        write("\nUpdate complete.\n");
      } catch {
        write("\nError: Update failed. Try running manually:\n");
        write(`  npm install -g ${PACKAGE_NAME}@latest\n`);
        process.exit(1);
      }
    });
}
