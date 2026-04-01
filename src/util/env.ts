import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export function loadDotEnv(): void {
  // Load .env from cwd, then home dir
  for (const dir of [process.cwd(), homedir()]) {
    const envPath = join(dir, ".env");
    if (existsSync(envPath)) {
      const lines = readFileSync(envPath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        // Strip quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

export function resolveEnvVar(val: string): string | undefined {
  if (!val) return undefined;
  const match = val.match(/^\$\{(.+)\}$/);
  return match ? process.env[match[1]] : val;
}
