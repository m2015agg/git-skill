import { Command } from "commander";
import { join } from "path";
import { openDb, hasDb } from "../util/db.js";
import { readConfig } from "../util/config.js";
import { generateEmbedding, vectorToBuffer } from "../util/embedding.js";

export function embedCommand(): Command {
  return new Command("embed")
    .description("Generate/refresh embeddings for commit messages")
    .option("--limit <n>", "Max commits to embed (default: all)")
    .option("--force", "Re-embed commits that already have embeddings")
    .action(async (opts: { limit: string; force?: boolean }) => {
      const config = readConfig();
      if (!config?.embedding?.enabled || !config.embedding.url) {
        process.stdout.write("Embeddings not configured. Set embedding.enabled and embedding.url in ~/.config/git-skill/config.json\n");
        return;
      }

      const historyDir = join(process.cwd(), ".git-history");
      if (!hasDb(historyDir)) {
        process.stdout.write("No .git-history/ database found. Run `git-skill snapshot` first.\n");
        process.exit(1);
      }

      const db = openDb(historyDir);
      try {
        const limit = opts.limit ? parseInt(opts.limit, 10) : 0;

        let query: string;
        if (opts.force) {
          query = "SELECT hash, message FROM commits ORDER BY timestamp DESC";
        } else {
          query = `SELECT c.hash, c.message FROM commits c
            LEFT JOIN embeddings e ON c.hash = e.commit_hash
            WHERE e.commit_hash IS NULL ORDER BY c.timestamp DESC`;
        }
        const commits = (limit > 0
          ? db.prepare(query + " LIMIT ?").all(limit)
          : db.prepare(query).all()) as Array<{ hash: string; message: string }>;

        if (commits.length === 0) {
          process.stdout.write("No commits to embed.\n");
          return;
        }

        process.stdout.write(`Embedding ${commits.length} commits...\n`);

        const insertEmbed = db.prepare(`
          INSERT OR REPLACE INTO embeddings (commit_hash, content_type, vector, model, created_at)
          VALUES (@commitHash, @contentType, @vector, @model, @createdAt)
        `);

        let successCount = 0;
        let failCount = 0;

        for (const commit of commits) {
          const result = await generateEmbedding(commit.message);
          if (result) {
            const buf = vectorToBuffer(result.vector);

            insertEmbed.run({
              commitHash: commit.hash,
              contentType: "message",
              vector: buf,
              model: result.model,
              createdAt: new Date().toISOString(),
            });
            successCount++;
          } else {
            failCount++;
          }
        }

        process.stdout.write(`Done. Embedded: ${successCount}, Failed: ${failCount}\n`);

        // Second pass: embed enrichments
        let enrichQuery = `SELECT e.commit_hash, e.intent, e.reasoning
  FROM enrichments e
  LEFT JOIN embeddings emb ON e.commit_hash = emb.commit_hash AND emb.content_type = 'enrichment'
  WHERE emb.commit_hash IS NULL`;
        if (opts.force) {
          enrichQuery = "SELECT commit_hash, intent, reasoning FROM enrichments";
        }

        const enrichments = (limit > 0
          ? db.prepare(enrichQuery + " LIMIT ?").all(limit)
          : db.prepare(enrichQuery).all()) as Array<{ commit_hash: string; intent: string; reasoning: string }>;

        if (enrichments.length > 0) {
          process.stdout.write(`Embedding ${enrichments.length} enrichments...\n`);
          let enrichSuccess = 0;
          let enrichFail = 0;

          for (const enrichment of enrichments) {
            const text = [enrichment.intent, enrichment.reasoning].filter(Boolean).join(" ");
            const result = await generateEmbedding(text);
            if (result) {
              const buf = vectorToBuffer(result.vector);
              insertEmbed.run({
                commitHash: enrichment.commit_hash,
                contentType: "enrichment",
                vector: buf,
                model: result.model,
                createdAt: new Date().toISOString(),
              });
              enrichSuccess++;
            } else {
              enrichFail++;
            }
          }
          process.stdout.write(`Done. Enrichment embeddings: ${enrichSuccess}, Failed: ${enrichFail}\n`);
        } else {
          process.stdout.write("No enrichments to embed.\n");
        }
      } finally {
        db.close();
      }
    });
}
