import { Command } from "commander";
import { join } from "path";
import { openDb, hasDb } from "../util/db.js";
import { searchBM25, SearchResult, hybridSearch, hasEmbeddings } from "../util/search-hybrid.js";

function write(msg: string): void {
  process.stdout.write(msg);
}

export function searchCommand(): Command {
  return new Command("search")
    .description("Search git history (hybrid BM25 + semantic when embeddings exist)")
    .argument("<query>", "Search query")
    .option("--limit <n>", "Maximum results", "20")
    .option("--json", "Output as JSON")
    .option("--since <date>", "Only show results from commits after this date")
    .option("--until <date>", "Only show results from commits before this date")
    .option("--bm25", "Force BM25-only search (skip semantic)")
    .action(async (query: string, opts: { limit: string; json?: boolean; since?: string; until?: string; bm25?: boolean }) => {
      const cwd = process.cwd();
      const historyDir = join(cwd, ".git-history");

      if (!hasDb(historyDir)) {
        write("No .git-history/ database found. Run `git-skill snapshot` first.\n");
        process.exit(1);
      }

      const db = openDb(historyDir);
      try {
        const limit = parseInt(opts.limit, 10) || 20;
        let results: SearchResult[];
        if (opts.bm25 || !hasEmbeddings(db)) {
          results = searchBM25(db, query, limit);
        } else {
          results = await hybridSearch(db, query, limit);
        }

        // Filter by date if --since or --until provided
        if ((opts.since || opts.until) && results.length > 0) {
          const hashes = [...new Set(results.map(r => r.hash))];
          const placeholders = hashes.map(() => "?").join(",");
          let dateFilter = `SELECT hash FROM commits WHERE hash IN (${placeholders})`;
          const params: (string | number)[] = [...hashes];

          if (opts.since) {
            dateFilter += " AND timestamp >= ?";
            params.push(opts.since);
          }
          if (opts.until) {
            dateFilter += " AND timestamp <= ?";
            params.push(opts.until);
          }

          const matchingHashes = new Set(
            (db.prepare(dateFilter).all(...params) as { hash: string }[]).map(r => r.hash)
          );
          results = results.filter(r => matchingHashes.has(r.hash));
        }

        if (opts.json) {
          write(JSON.stringify(results, null, 2) + "\n");
          return;
        }

        if (results.length === 0) {
          write(`No results found for "${query}".\n`);
          return;
        }

        // Group by commit hash for text output
        const commitResults = results.filter(r => r.type === "commit");
        const fileResults = results.filter(r => r.type === "file");

        // Collect unique commit hashes to enrich with metadata
        const allHashes = [...new Set(results.map(r => r.hash))];
        const commitMeta = new Map<string, { author: string; timestamp: string; message: string }>();
        if (allHashes.length > 0) {
          const placeholders = allHashes.map(() => "?").join(",");
          const rows = db.prepare(
            `SELECT hash, author, timestamp, message FROM commits WHERE hash IN (${placeholders})`
          ).all(...allHashes) as { hash: string; author: string; timestamp: string; message: string }[];
          for (const row of rows) {
            commitMeta.set(row.hash, row);
          }
        }

        write(`\nSearch results for "${query}" (${results.length} match${results.length !== 1 ? "es" : ""})\n`);
        write("─".repeat(60) + "\n");

        if (commitResults.length > 0) {
          write("\nCommits:\n");
          for (const r of commitResults) {
            const meta = commitMeta.get(r.hash);
            const shortHash = r.hash.slice(0, 7);
            const date = meta ? meta.timestamp.slice(0, 10) : "";
            const author = meta ? meta.author : "";
            write(`  ${shortHash}  ${r.message || meta?.message || ""}  (${author}, ${date})\n`);
          }
        }

        if (fileResults.length > 0) {
          write("\nFiles:\n");
          for (const r of fileResults) {
            const meta = commitMeta.get(r.hash);
            const shortHash = r.hash.slice(0, 7);
            const date = meta ? meta.timestamp.slice(0, 10) : "";
            write(`  ${shortHash}  ${r.path}  [${r.detail}]  (${date})\n`);
          }
        }

        const enrichResults = results.filter(r => r.type === "enrichment");
        if (enrichResults.length > 0) {
          write("\nEnrichments:\n");
          for (const r of enrichResults) {
            const shortHash = r.hash.slice(0, 7);
            const meta = commitMeta.get(r.hash);
            const date = meta ? meta.timestamp.slice(0, 10) : "";
            write(`  ${shortHash}  ${r.message.slice(0, 80)}  (${date})\n`);
          }
        }

        write("\n");
      } finally {
        db.close();
      }
    });
}
