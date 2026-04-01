import { readConfig } from "./config.js";

export interface EmbeddingResult {
  vector: number[];
  model: string;
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult | null> {
  const config = readConfig();
  if (!config?.embedding?.enabled || !config.embedding.url) return null;

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

function resolveEnvVar(val: string): string | undefined {
  if (!val) return undefined;
  const match = val.match(/^\$\{(.+)\}$/);
  return match ? process.env[match[1]] : val;
}
