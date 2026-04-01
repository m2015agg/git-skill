import { mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { openDb } from "../util/db.js";
import { getLog, getDiffTree, getBranches, getTags } from "../util/git.js";
import { runAllAnalytics } from "../util/analytics.js";
import { computeBuiltinMetrics } from "../util/metrics.js";
import { runContextUpdate } from "./context-update.js";

interface SnapshotOptions {
  force?: boolean;
  cwd?: string;
}

export async function snapshotCommand(opts: SnapshotOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const historyDir = join(cwd, ".git-history");

  // Create .git-history if it doesn't exist
  if (!existsSync(historyDir)) {
    mkdirSync(historyDir, { recursive: true });
  }

  const db = openDb(historyDir);

  // --force: wipe all data before backfilling
  if (opts.force) {
    process.stdout.write("Force mode: clearing all data...\n");
    db.exec(`
      DELETE FROM commits;
      DELETE FROM commit_files;
      DELETE FROM branches;
      DELETE FROM tags;
      DELETE FROM history_fts;
    `);
  }

  // Phase 1: Backfill commits
  process.stdout.write("Phase 1: Indexing commits...\n");

  const allCommits = getLog(cwd);
  process.stdout.write(`  Found ${allCommits.length} commits in git log\n`);

  // Check which hashes are already stored
  const existingHashes = new Set<string>(
    (db.prepare("SELECT hash FROM commits").all() as { hash: string }[]).map((r) => r.hash)
  );

  const newCommits = allCommits.filter((c) => !existingHashes.has(c.hash));
  process.stdout.write(`  ${newCommits.length} new commits to index\n`);

  if (newCommits.length > 0) {
    const insertCommit = db.prepare(`
      INSERT OR IGNORE INTO commits
        (hash, message, author, email, timestamp, branch, parent_hash, merge_commit, insertions, deletions, files_changed)
      VALUES
        (@hash, @message, @author, @email, @timestamp, @branch, @parentHash, @mergeCommit, @insertions, @deletions, @filesChanged)
    `);

    const insertFile = db.prepare(`
      INSERT INTO commit_files (commit_hash, file_path, status, insertions, deletions, old_path)
      VALUES (@commitHash, @filePath, @status, @insertions, @deletions, @oldPath)
    `);

    const insertMany = db.transaction(() => {
      for (const commit of newCommits) {
        insertCommit.run({
          hash: commit.hash,
          message: commit.message,
          author: commit.author,
          email: commit.email,
          timestamp: commit.timestamp,
          branch: commit.branch,
          parentHash: commit.parentHash,
          mergeCommit: commit.mergeCommit ? 1 : 0,
          insertions: commit.insertions,
          deletions: commit.deletions,
          filesChanged: commit.filesChanged,
        });

        const files = getDiffTree(cwd, commit.hash);
        for (const file of files) {
          insertFile.run({
            commitHash: commit.hash,
            filePath: file.path,
            status: file.status,
            insertions: file.insertions,
            deletions: file.deletions,
            oldPath: file.oldPath ?? null,
          });
        }
      }
    });

    insertMany();
    process.stdout.write(`  Indexed ${newCommits.length} commits with their files\n`);
  }

  // Phase 2: Branches
  process.stdout.write("Phase 2: Indexing branches...\n");

  const branches = getBranches(cwd);
  const insertBranch = db.prepare(`
    INSERT OR REPLACE INTO branches (name, head_hash, is_active)
    VALUES (@name, @headHash, @isActive)
  `);

  const syncBranches = db.transaction(() => {
    db.exec("DELETE FROM branches");
    for (const branch of branches) {
      insertBranch.run({
        name: branch.name,
        headHash: branch.headHash,
        isActive: branch.isActive ? 1 : 0,
      });
    }
  });

  syncBranches();
  process.stdout.write(`  Indexed ${branches.length} branches\n`);

  // Phase 3: Tags
  process.stdout.write("Phase 3: Indexing tags...\n");

  const tags = getTags(cwd);
  const insertTag = db.prepare(`
    INSERT OR REPLACE INTO tags (name, hash, timestamp, message)
    VALUES (@name, @hash, @timestamp, @message)
  `);

  const syncTags = db.transaction(() => {
    db.exec("DELETE FROM tags");
    for (const tag of tags) {
      insertTag.run({
        name: tag.name,
        hash: tag.hash,
        timestamp: tag.timestamp,
        message: tag.message,
      });
    }
  });

  syncTags();
  process.stdout.write(`  Indexed ${tags.length} tags\n`);

  // Phase 4: FTS rebuild
  process.stdout.write("Phase 4: Rebuilding FTS index...\n");

  const rebuildFts = db.transaction(() => {
    db.exec("DELETE FROM history_fts");

    // Insert commits into FTS
    const commitRows = db
      .prepare("SELECT hash, message FROM commits")
      .all() as { hash: string; message: string }[];

    const ftsInsert = db.prepare(`
      INSERT INTO history_fts (hash, type, path, message, detail)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const row of commitRows) {
      ftsInsert.run(row.hash, "commit", "", row.message, "");
    }

    // Insert commit files into FTS
    const fileRows = db
      .prepare("SELECT commit_hash, file_path, status FROM commit_files")
      .all() as { commit_hash: string; file_path: string; status: string }[];

    for (const row of fileRows) {
      ftsInsert.run(row.commit_hash, "file", row.file_path, "", row.status);
    }
  });

  rebuildFts();

  const ftsCount = (db.prepare("SELECT COUNT(*) as c FROM history_fts").get() as { c: number }).c;
  process.stdout.write(`  FTS index has ${ftsCount} entries\n`);

  // Phase 5: Analytics
  process.stdout.write("Phase 5: Running analytics...\n");
  runAllAnalytics(db);
  process.stdout.write("  Analytics complete\n");

  // Phase 6: Built-in metrics
  process.stdout.write("Phase 6: Computing built-in metrics...\n");
  computeBuiltinMetrics(db);
  process.stdout.write("  Metrics complete\n");

  // Store last_snapshot timestamp
  db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('last_snapshot', ?)").run(
    new Date().toISOString()
  );

  db.close();

  // Phase 7: Update Claude memory context
  process.stdout.write("Phase 7: Updating Claude memory context...\n");
  try {
    runContextUpdate(cwd);
    process.stdout.write("  Memory context updated\n");
  } catch {
    process.stdout.write("  Warning: Could not update memory context\n");
  }

  process.stdout.write("Snapshot complete.\n");
}
