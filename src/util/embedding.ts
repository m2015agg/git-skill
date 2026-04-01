import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { readConfig } from "./config.js";

export interface EmbeddingResult {
  vector: number[];
  model: string;
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult | null> {
  const config = readConfig();
  if (!config?.embedding?.enabled || !config.embedding.url) return null;

  loadDotEnv();
  const apiKey = resolveEnvVar(config.embedding.apiKey);
  try {
    const response = await fetch(config.embedding.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model: config.embedding.model, input: text }),
    });
    if (!response.ok) return null;
    const data = await response.json() as any;
    // OpenAI format
    if (data.data?.[0]?.embedding) return { vector: data.data[0].embedding, model: config.embedding.model };
    // Ollama /api/embed format (embeddings array)
    if (data.embeddings?.[0]) return { vector: data.embeddings[0], model: config.embedding.model };
    // Ollama legacy format
    if (data.embedding) return { vector: data.embedding, model: config.embedding.model };
    return null;
  } catch { return null; }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; normA += a[i]*a[i]; normB += b[i]*b[i]; }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

function loadDotEnv(): void {
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
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

function resolveEnvVar(val: string): string | undefined {
  if (!val) return undefined;
  const match = val.match(/^\$\{(.+)\}$/);
  return match ? process.env[match[1]] : val;
}
