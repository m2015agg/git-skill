import { Command } from "commander";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { homedir } from "os";
import { readConfig, writeConfig } from "../util/config.js";

function write(msg: string): void { process.stdout.write(msg); }

export function addKeyCommand(): Command {
  return new Command("add-key")
    .description("Add or update your LLM API key")
    .argument("<key>", "API key (Anthropic or OpenAI)")
    .option("--provider <provider>", "Provider: anthropic or openai (auto-detected from key prefix)")
    .action((key: string, opts: { provider?: string }) => {
      // Auto-detect provider from key prefix
      let provider = opts.provider;
      if (!provider) {
        if (key.startsWith("sk-ant-")) {
          provider = "anthropic";
        } else if (key.startsWith("sk-")) {
          provider = "openai";
        } else {
          provider = "unknown";
        }
      }

      write(`Detected provider: ${provider}\n`);

      // 1. Save key to ~/.env
      const envPath = join(homedir(), ".env");
      const entry = `GIT_SKILL_LLM_KEY=${key}`;

      if (existsSync(envPath)) {
        const content = readFileSync(envPath, "utf-8");
        if (content.includes("GIT_SKILL_LLM_KEY=")) {
          const updated = content.replace(/GIT_SKILL_LLM_KEY=.*/g, entry);
          writeFileSync(envPath, updated, { mode: 0o600 });
          write("Updated GIT_SKILL_LLM_KEY in ~/.env\n");
        } else {
          const suffix = content.endsWith("\n") ? "" : "\n";
          appendFileSync(envPath, `${suffix}${entry}\n`);
          write("Added GIT_SKILL_LLM_KEY to ~/.env\n");
        }
      } else {
        writeFileSync(envPath, `${entry}\n`, { mode: 0o600 });
        write("Created ~/.env with GIT_SKILL_LLM_KEY\n");
      }

      // 2. Update config to enable enrichment with detected provider
      const config = readConfig();
      if (config) {
        let changed = false;

        if (!config.enrichment.enabled) {
          config.enrichment.enabled = true;
          config.enrichment.apiKey = "${GIT_SKILL_LLM_KEY}";

          if (provider === "anthropic") {
            config.enrichment.url = "https://api.anthropic.com/v1/messages";
            config.enrichment.model = "claude-sonnet-4-6";
          } else if (provider === "openai") {
            config.enrichment.url = "https://api.openai.com/v1/chat/completions";
            config.enrichment.model = "gpt-4o";
          }

          changed = true;
          write(`Enabled enrichment (${config.enrichment.model})\n`);
        }

        if (provider === "openai" && !config.embedding.enabled) {
          config.embedding.enabled = true;
          config.embedding.url = "https://api.openai.com/v1/embeddings";
          config.embedding.model = "text-embedding-3-small";
          config.embedding.apiKey = "${GIT_SKILL_LLM_KEY}";
          config.embedding.provider = "openai";
          config.embedding.dimensions = 1536;
          changed = true;
          write("Enabled embeddings (text-embedding-3-small)\n");
        }

        if (changed) {
          writeConfig(config);
          write("Config updated.\n");
        }
      }

      write("\nReady! Run these in your repo:\n");
      write("  git-skill enrich        # analyze commit history\n");
      write("  git-skill embed         # generate embeddings (if configured)\n");
    });
}
