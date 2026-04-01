import type Database from "better-sqlite3";

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
