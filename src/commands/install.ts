import { Command } from "commander";
import { join } from "path";
import { existsSync } from "fs";
import { homedir } from "os";
import { execSync } from "child_process";
import { writeConfig, getDefaultConfig, readConfig } from "../util/config.js";
import { upsertSection } from "../util/claude-md.js";
import { getSkillDoc } from "./docs.js";

function write(msg: string): void { process.stdout.write(msg); }

function checkGit(): boolean {
  try {
    execSync("git --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function installCommand(): Command {
  return new Command("install")
    .description("Global setup wizard — install git-skill system-wide")
    .option("--ci", "Non-interactive mode, use defaults")
    .action((opts) => {
      write("Installing git-skill globally...\n\n");

      // 1. Check git
      write("1. Checking git...\n");
      if (!checkGit()) {
        write("   Error: git not found in PATH. Install git first.\n");
        process.exit(1);
      }
      write("   git found.\n");

      // 2. Write default config
      write("2. Writing default config...\n");
      const configDir = join(homedir(), ".config", "git-skill");
      const existing = readConfig();
      if (existing) {
        write(`   Config already exists at ${configDir}/config.json — skipping.\n`);
      } else {
        writeConfig(getDefaultConfig());
        write(`   Config written to ${configDir}/config.json\n`);
      }

      // 3. Update ~/.claude/CLAUDE.md
      write("3. Updating ~/.claude/CLAUDE.md...\n");
      const claudeMdPath = join(homedir(), ".claude", "CLAUDE.md");
      const result = upsertSection(claudeMdPath, getSkillDoc());
      write(`   CLAUDE.md: ${result}\n`);

      // 4. Success + next steps
      write("\ngit-skill installed successfully!\n\n");
      write("Next steps:\n");
      write("  cd <your-repo>\n");
      write("  git-skill init          # initialize in a repo\n");
      write("  git-skill doctor        # verify setup health\n");
      write("\n");
      write("Optional — Embeddings (semantic search):\n");
      write("  Edit ~/.config/git-skill/config.json and set:\n");
      write('    embedding.enabled = true\n');
      write('    embedding.url = "http://localhost:11434/api/embed"  (Ollama)\n');
      write('    embedding.model = "mxbai-embed-large"              (or any model)\n');
      write("  Then run: git-skill embed\n");
      write("\n");
      write("Optional — LLM Enrichment (commit analysis):\n");
      write("  Edit ~/.config/git-skill/config.json and set:\n");
      write('    enrichment.enabled = true\n');
      write('    enrichment.url = "https://api.anthropic.com/v1/messages"  (or OpenAI-compatible)\n');
      write('    enrichment.model = "claude-sonnet-4-5-20250514"           (recommended)\n');
      write('    enrichment.apiKey = "${GIT_SKILL_LLM_KEY}"               (env var or raw key)\n');
      write("  Then run: git-skill enrich\n");

      if (!opts.ci) {
        write("\nTip: Run `git-skill approve --global` to pre-approve commands globally.\n");
      }
    });
}
