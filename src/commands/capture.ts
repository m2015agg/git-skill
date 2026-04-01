import { Command } from "commander";
import { openDb } from "../util/db.js";
import { getLog, getDiffTree, getLastCommitHash } from "../util/git.js";
import { join } from "path";
import { existsSync } from "fs";

function write(msg: string): void {
  process.stdout.write(msg);
}

export function captureCommand(): Command {
  return new Command("capture")
    .description("Capture the latest commit (called by post-commit hook)")
    .option("--hook", "Called from post-commit hook (suppress output)")
    .option("--hash <hash>", "Specific commit hash to capture")
    .action((opts: { hook?: boolean; hash?: string }) => {
      const cwd = process.cwd();
      const historyDir = join(cwd, ".git-history");

      if (!existsSync(historyDir)) {
        if (!opts.hook) write("No .git-history/ found. Run `git-skill init` first.\n");
        return;
      }

      const db = openDb(historyDir);
      try {
        const hash = opts.hash || getLastCommitHash(cwd);
        if (!hash) {
          if (!opts.hook) write("Could not determine last commit hash.\n");
          return;
        }

        // Check if already captured (idempotency)
        const existing = db.prepare("SELECT hash FROM commits WHERE hash = ?").get(hash);
        if (existing) {
          if (!opts.hook) write(`Commit ${hash.slice(0, 7)} already captured.\n`);
          return;
        }

        // Get commit data (just the one commit)
        const commits = getLog(cwd, { limit: 1 });
        if (commits.length === 0) return;
        const commit = commits[0];

        // Insert commit
        db.prepare(`
          INSERT OR IGNORE INTO commits (hash, message, author, email, timestamp, branch, parent_hash, merge_commit, insertions, deletions, files_changed)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(commit.hash, commit.message, commit.author, commit.email, commit.timestamp, commit.branch, commit.parentHash, commit.mergeCommit ? 1 : 0, commit.insertions, commit.deletions, commit.filesChanged);

        // Insert commit files
        const files = getDiffTree(cwd, commit.hash);
        const insertFile = db.prepare(`
          INSERT INTO commit_files (commit_hash, file_path, status, insertions, deletions, old_path)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        const insertMany = db.transaction((fileList: typeof files) => {
          for (const f of fileList) {
            insertFile.run(commit.hash, f.path, f.status, f.insertions, f.deletions, f.oldPath);
          }
        });
        insertMany(files);

        // Update FTS index so commit is immediately searchable
        const insertFts = db.prepare(
          "INSERT INTO history_fts (hash, type, path, message, detail) VALUES (?, ?, ?, ?, ?)"
        );
        insertFts.run(commit.hash, "commit", "", commit.message, "");
        for (const f of files) {
          insertFts.run(commit.hash, "file", f.path, "", f.status);
        }

        if (!opts.hook) {
          write(`Captured ${commit.hash.slice(0, 7)}: ${commit.message} (${files.length} files)\n`);
        }
      } finally {
        db.close();
      }
    });
}
