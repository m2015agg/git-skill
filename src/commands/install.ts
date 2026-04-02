import { Command } from "commander";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { homedir } from "os";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { writeConfig, getDefaultConfig, readConfig, GitSkillConfig } from "../util/config.js";
import { upsertSection } from "../util/claude-md.js";
import { getSkillDoc } from "./docs.js";

function write(msg: string): void { process.stdout.write(msg); }

function checkGit(): boolean {
  try { execSync("git --version", { stdio: "ignore" }); return true; } catch { return false; }
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

function writeApiKey(key: string): void {
  const envPath = join(homedir(), ".env");
  const entry = `GIT_SKILL_LLM_KEY=${key}`;

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    if (content.includes("GIT_SKILL_LLM_KEY=")) {
      const updated = content.replace(/GIT_SKILL_LLM_KEY=.*/g, entry);
      writeFileSync(envPath, updated, { mode: 0o600 });
      write("   Updated GIT_SKILL_LLM_KEY in ~/.env\n");
      return;
    }
    const suffix = content.endsWith("\n") ? "" : "\n";
    appendFileSync(envPath, `${suffix}${entry}\n`);
  } else {
    writeFileSync(envPath, `${entry}\n`, { mode: 0o600 });
  }
  write("   Saved GIT_SKILL_LLM_KEY to ~/.env\n");
}

async function testEmbeddingConnection(url: string, model: string): Promise<boolean> {
  write("   Testing connection...");
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: "test" }),
    });
    if (response.ok) { write(" connected!\n"); return true; }
    write(` failed (${response.status})\n`);
    return false;
  } catch (e: any) {
    write(` failed (${e.message?.slice(0, 50) ?? "connection error"})\n`);
    return false;
  }
}

export function installCommand(): Command {
  return new Command("config")
    .alias("install")
    .description("Configure git-skill — embeddings, enrichment, API keys")
    .option("--ci", "Non-interactive mode, use defaults")
    .action(async (opts) => {
      // Load existing or create new config
      const existing = readConfig();
      const config: GitSkillConfig = existing ?? getDefaultConfig();
      const isUpdate = !!existing;

      write("git-skill Configuration\n");
      write("═".repeat(40) + "\n\n");

      // 1. Check git
      write("1. Checking git...\n");
      if (!checkGit()) {
        write("   Error: git not found. Install git first.\n");
        process.exit(1);
      }
      write("   git found.\n\n");

      // Show current config if exists
      if (isUpdate) {
        write("Current configuration:\n");
        write(`  Embeddings: ${config.embedding.enabled ? `enabled (${config.embedding.provider}, ${config.embedding.model})` : "disabled"}\n`);
        write(`  Enrichment: ${config.enrichment.enabled ? `enabled (${config.enrichment.model})` : "disabled"}\n`);

        // Check for API key
        const envPath = join(homedir(), ".env");
        const hasKey = existsSync(envPath) && readFileSync(envPath, "utf-8").includes("GIT_SKILL_LLM_KEY=");
        write(`  API key:    ${hasKey ? "set in ~/.env" : "not set"}\n`);
        write("\n");
      }

      if (!opts.ci) {
        // 2. Embedding setup
        write("2. Embeddings (semantic search)\n");
        if (config.embedding.enabled) {
          write(`   Currently: ${config.embedding.provider} (${config.embedding.model}) at ${config.embedding.url}\n`);
          const change = await ask("   Update embedding config? [y/N] ");
          if (change.toLowerCase() !== "y") {
            write("   Keeping current config.\n\n");
            goto_enrichment();
          } else {
            await configureEmbedding(config);
          }
        } else {
          write("   Embeddings let you search by meaning, not just keywords.\n");
          write("   Requires an embedding provider (Ollama is free and local).\n\n");
          const enable = await ask("   Enable embeddings? [y/N] ");
          if (enable.toLowerCase() === "y") {
            await configureEmbedding(config);
          }
        }
        write("\n");

        // 3. Enrichment setup
        write("3. LLM Enrichment (commit analysis)\n");
        if (config.enrichment.enabled) {
          write(`   Currently: ${config.enrichment.model} at ${config.enrichment.url}\n`);
          const change = await ask("   Update enrichment config? [y/N] ");
          if (change.toLowerCase() === "y") {
            await configureEnrichment(config);
          } else {
            write("   Keeping current config.\n");
          }
        } else {
          write("   Enrichment uses an LLM to analyze each commit — what changed, why,\n");
          write("   and what alternatives existed. Powers the 'verify' command.\n");
          write("   Requires an API key (Anthropic or OpenAI).\n\n");
          const enable = await ask("   Enable enrichment? [y/N] ");
          if (enable.toLowerCase() === "y") {
            await configureEnrichment(config);
          }
        }
        write("\n");

        // 4. API key
        write("4. API Key\n");
        const envPath = join(homedir(), ".env");
        const hasKey = existsSync(envPath) && readFileSync(envPath, "utf-8").includes("GIT_SKILL_LLM_KEY=");
        if (hasKey) {
          write("   API key already set in ~/.env\n");
          const changeKey = await ask("   Update API key? [y/N] ");
          if (changeKey.toLowerCase() === "y") {
            const key = await ask("   Paste new API key: ");
            if (key) writeApiKey(key);
          }
        } else if (config.enrichment.enabled || (config.embedding.enabled && config.embedding.apiKey)) {
          const key = await ask("   Paste your API key (stored in ~/.env): ");
          if (key) {
            writeApiKey(key);
          } else {
            write("   Skipped — add later with: git-skill add-key <your-key>\n");
          }
        }
        write("\n");
      }

      // 5. Save config
      write("5. Saving config...\n");
      writeConfig(config);
      write("   Config saved to ~/.config/git-skill/config.json\n");

      // 6. Update CLAUDE.md
      write("6. Updating ~/.claude/CLAUDE.md...\n");
      const claudeMdPath = join(homedir(), ".claude", "CLAUDE.md");
      const result = upsertSection(claudeMdPath, getSkillDoc());
      write(`   CLAUDE.md: ${result}\n`);

      // Summary
      write("\n" + "═".repeat(40) + "\n");
      write(`git-skill ${isUpdate ? "updated" : "configured"}!\n\n`);
      write("Configuration:\n");
      write(`  Embeddings:  ${config.embedding.enabled ? `enabled (${config.embedding.provider}, ${config.embedding.model})` : "disabled"}\n`);
      write(`  Enrichment:  ${config.enrichment.enabled ? `enabled (${config.enrichment.model})` : "disabled"}\n`);
      write("\n");

      if (!isUpdate) {
        write("Next steps:\n");
        write("  cd <your-repo>\n");
        write("  git-skill init          # set up a repo\n");
      }
      write("\n");
    });
}

async function configureEmbedding(config: GitSkillConfig): Promise<void> {
  write("\n   Providers:\n");
  write("     1) Ollama (free, local)     — http://localhost:11434/api/embed\n");
  write("     2) OpenAI                   — https://api.openai.com/v1/embeddings\n");
  write("     3) Custom URL\n\n");

  const provider = await ask("   Choose [1/2/3]: ");

  if (provider === "1") {
    const url = await ask("   Ollama URL [http://localhost:11434/api/embed]: ");
    config.embedding.url = url || "http://localhost:11434/api/embed";
    const model = await ask("   Embedding model [mxbai-embed-large]: ");
    config.embedding.model = model || "mxbai-embed-large";
    config.embedding.provider = "ollama";
    config.embedding.dimensions = 1024;
    config.embedding.apiKey = "";
  } else if (provider === "2") {
    config.embedding.url = "https://api.openai.com/v1/embeddings";
    config.embedding.model = "text-embedding-3-small";
    config.embedding.provider = "openai";
    config.embedding.apiKey = "${GIT_SKILL_LLM_KEY}";
    config.embedding.dimensions = 1536;
  } else {
    const url = await ask("   Embedding URL: ");
    const model = await ask("   Model name: ");
    config.embedding.url = url;
    config.embedding.model = model;
  }

  config.embedding.enabled = true;
  await testEmbeddingConnection(config.embedding.url, config.embedding.model);
}

async function configureEnrichment(config: GitSkillConfig): Promise<void> {
  write("\n   Providers:\n");
  write("     1) Anthropic (recommended)  — claude-sonnet-4-6\n");
  write("     2) OpenAI                   — gpt-4o\n\n");

  const provider = await ask("   Choose [1/2]: ");

  if (provider === "2") {
    config.enrichment.url = "https://api.openai.com/v1/chat/completions";
    config.enrichment.model = "gpt-4o";
  } else {
    config.enrichment.url = "https://api.anthropic.com/v1/messages";
    config.enrichment.model = "claude-sonnet-4-6";
  }

  config.enrichment.apiKey = "${GIT_SKILL_LLM_KEY}";
  config.enrichment.enabled = true;
}

function goto_enrichment(): void { /* flow control placeholder */ }
