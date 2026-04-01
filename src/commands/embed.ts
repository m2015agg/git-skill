import { Command } from "commander";
import { join } from "path";
import { openDb, hasDb } from "../util/db.js";
import { readConfig } from "../util/config.js";
import { generateEmbedding } from "../util/embedding.js";

export function embedCommand(): Command {
  return new Command("embed")
    .description("Generate/refresh embeddings for commit messages")
    .option("--limit <n>", "Max commits to embed", "100")
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
        const limit = parseInt(opts.limit, 10) || 100;

        let commits: Array<{ hash: string; message: string }>;
        if (opts.force) {
          commits = db
            .prepare("SELECT hash, message FROM commits ORDER BY timestamp DESC LIMIT ?")
            .all(limit) as Array<{ hash: string; message: string }>;
        } else {
          // Get commits that don't have embeddings yet
          commits = db
            .prepare(`
              SELECT c.hash, c.message
              FROM commits c
              LEFT JOIN embeddings e ON c.hash = e.commit_hash
              WHERE e.commit_hash IS NULL
              ORDER BY c.timestamp DESC
              LIMIT ?
            `)
            .all(limit) as Array<{ hash: string; message: string }>;
        }

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
            const buf = Buffer.alloc(result.vector.length * 4);
            const arr = new Float32Array(result.vector);
            Buffer.from(arr.buffer).copy(buf);

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
      } finally {
        db.close();
      }
    });
}
