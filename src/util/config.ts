import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface GitSkillConfig {
  embedding: {
    enabled: boolean;
    provider: string;
    model: string;
    url: string;
    apiKey: string;
    dimensions: number;
  };
  enrichment: {
    enabled: boolean;
    url: string;
    model: string;
    apiKey: string;
    batchSize: number;
    maxTokensPerCommit: number;
  };
}

const CONFIG_DIR = join(homedir(), ".config", "git-skill");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function getDefaultConfig(): GitSkillConfig {
  return {
    embedding: { enabled: false, provider: "openai", model: "text-embedding-3-small", url: "", apiKey: "", dimensions: 1536 },
    enrichment: { enabled: false, url: "", model: "gpt-4o-mini", apiKey: "", batchSize: 10, maxTokensPerCommit: 500 },
  };
}

export function readConfig(): GitSkillConfig | null {
  try {
    if (!existsSync(CONFIG_PATH)) return null;
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch { return null; }
}

export function writeConfig(config: GitSkillConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}
