import type Database from "better-sqlite3";
import { generateEmbedding, cosineSimilarity, bufferToVector } from "./embedding.js";

export interface SearchResult {
  hash: string;
  type: string;
  path: string;
  message: string;
  detail: string;
  score: number;
}

export function searchBM25(db: Database.Database, query: string, limit = 20): SearchResult[] {
  const safeQuery = query.replace(/['"]/g, "").trim();
  if (!safeQuery) return [];

  try {
    // Try FTS5 phrase + prefix match
    const results = db.prepare(`
      SELECT hash, type, path, message, detail, rank as score
      FROM history_fts WHERE history_fts MATCH ? ORDER BY rank LIMIT ?
    `).all(`"${safeQuery}"*`, limit) as SearchResult[];
    if (results.length > 0) return results;

    // Fallback: individual terms
    const terms = safeQuery.split(/\s+/).map(t => `"${t}"*`).join(" OR ");
    return db.prepare(`
      SELECT hash, type, path, message, detail, rank as score
      FROM history_fts WHERE history_fts MATCH ? ORDER BY rank LIMIT ?
    `).all(terms, limit) as SearchResult[];
  } catch {
    // Final fallback: LIKE on base tables (FTS5 doesn't support LIKE)
    const commitMatches = db.prepare(`
      SELECT hash, 'commit' as type, '' as path, message, '' as detail, 0 as score
      FROM commits WHERE message LIKE ? LIMIT ?
    `).all(`%${safeQuery}%`, limit) as SearchResult[];
    const fileMatches = db.prepare(`
      SELECT commit_hash as hash, 'file' as type, file_path as path, '' as message, status as detail, 0 as score
      FROM commit_files WHERE file_path LIKE ? LIMIT ?
    `).all(`%${safeQuery}%`, limit) as SearchResult[];
    return [...commitMatches, ...fileMatches].slice(0, limit);
  }
}

export function hasEmbeddings(db: Database.Database): boolean {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM embeddings").get() as { cnt: number };
  return row.cnt > 0;
}

export async function searchVector(
  db: Database.Database,
  query: string,
  limit = 20
): Promise<SearchResult[]> {
  const embeddingResult = await generateEmbedding(query);
  if (!embeddingResult) return [];
  const queryVector = embeddingResult.vector;

  const rows = db.prepare(
    "SELECT commit_hash, content_type, vector FROM embeddings ORDER BY created_at DESC LIMIT 5000"
  ).all() as { commit_hash: string; content_type: string; vector: Buffer }[];

  const scored: { hash: string; type: string; similarity: number }[] = rows.map((row) => ({
    hash: row.commit_hash,
    type: row.content_type,
    similarity: cosineSimilarity(queryVector, bufferToVector(row.vector)),
  }));

  scored.sort((a, b) => b.similarity - a.similarity);
  // Filter out low-similarity results (below 0.3 is noise)
  const filtered = scored.filter(s => s.similarity > 0.3);
  const top = filtered.slice(0, limit);

  const results: SearchResult[] = [];
  for (const item of top) {
    let message = "";
    if (item.type === "message") {
      const commit = db.prepare(
        "SELECT message, author FROM commits WHERE hash = ?"
      ).get(item.hash) as { message: string; author: string } | undefined;
      message = commit?.message ?? "";
    } else if (item.type === "enrichment") {
      const enrichment = db.prepare(
        "SELECT intent FROM enrichments WHERE commit_hash = ?"
      ).get(item.hash) as { intent: string } | undefined;
      message = enrichment?.intent ?? "";
    }
    results.push({
      hash: item.hash,
      type: item.type,
      path: "",
      message,
      detail: "",
      score: item.similarity,
    });
  }

  return results;
}

export async function hybridSearch(
  db: Database.Database,
  query: string,
  limit = 20
): Promise<SearchResult[]> {
  const [bm25, vector] = await Promise.all([
    Promise.resolve(searchBM25(db, query, limit * 2)),
    searchVector(db, query, limit * 2),
  ]);

  if (vector.length === 0) {
    return bm25.slice(0, limit);
  }

  const map = new Map<string, { score: number; result: SearchResult }>();

  for (let i = 0; i < bm25.length; i++) {
    const r = bm25[i];
    const rrf = 1 / (60 + i + 1);
    const existing = map.get(r.hash);
    if (existing) {
      existing.score += rrf;
      if (!existing.result.message && r.message) existing.result = r;
    } else {
      map.set(r.hash, { score: rrf, result: r });
    }
  }

  for (let i = 0; i < vector.length; i++) {
    const r = vector[i];
    const rrf = 1 / (60 + i + 1);
    const existing = map.get(r.hash);
    if (existing) {
      existing.score += rrf;
      if (!existing.result.message && r.message) existing.result = r;
    } else {
      map.set(r.hash, { score: rrf, result: r });
    }
  }

  const merged = Array.from(map.values());
  merged.sort((a, b) => b.score - a.score);

  return merged.slice(0, limit).map(({ score, result }) => ({ ...result, score }));
}
