import { Command } from "commander";
import { openDb } from "../util/db.js";
import { join } from "path";
import { execSync } from "child_process";

interface DiffSummaryResult {
  range: string;
  commits: Array<{
    hash: string;
    author: string;
    timestamp: string;
    message: string;
  }>;
  authors: string[];
  added_files: string[];
  modified_files: string[];
  deleted_files: string[];
  total_insertions: number;
  total_deletions: number;
  decision_points: number;
}

export function diffSummaryCommand(): Command {
  return new Command("diff-summary")
    .description("LLM-friendly summary of a commit range")
    .argument("<range>", "Commit range (e.g. v1.0..v1.1 or HEAD~10..HEAD)")
    .option("--json", "Output as JSON")
    .action((range: string, opts: { json?: boolean }) => {
      const historyDir = join(process.cwd(), ".git-history");
      const db = openDb(historyDir);
      try {
        // Get hashes in range
        let revListOutput: string;
        try {
          revListOutput = execSync(`git rev-list ${range}`, {
            cwd: process.cwd(),
            encoding: "utf-8",
          });
        } catch {
          process.stderr.write(`Could not resolve range: ${range}\n`);
          process.exit(1);
        }

        const hashes = revListOutput
          .split("\n")
          .map((h) => h.trim())
          .filter(Boolean);

        if (hashes.length === 0) {
          const empty: DiffSummaryResult = {
            range,
            commits: [],
            authors: [],
            added_files: [],
            modified_files: [],
            deleted_files: [],
            total_insertions: 0,
            total_deletions: 0,
            decision_points: 0,
          };
          if (opts.json) {
            process.stdout.write(JSON.stringify(empty, null, 2) + "\n");
          } else {
            process.stdout.write(`No commits found in range: ${range}\n`);
          }
          return;
        }

        const placeholders = hashes.map(() => "?").join(",");

        // Query commits
        const commitRows = db
          .prepare(
            `SELECT hash, author, timestamp, message, insertions, deletions
             FROM commits
             WHERE hash IN (${placeholders})
             ORDER BY timestamp ASC`
          )
          .all(...hashes) as Array<{
          hash: string;
          author: string;
          timestamp: string;
          message: string;
          insertions: number;
          deletions: number;
        }>;

        // Query files
        const fileRows = db
          .prepare(
            `SELECT file_path, status, insertions, deletions
             FROM commit_files
             WHERE commit_hash IN (${placeholders})`
          )
          .all(...hashes) as Array<{
          file_path: string;
          status: string;
          insertions: number;
          deletions: number;
        }>;

        // Decision points in range
        const dpRow = db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM decision_points WHERE commit_hash IN (${placeholders})`
          )
          .get(...hashes) as { cnt: number };

        // Compute stats
        const authorSet = new Set<string>();
        let totalInsertions = 0;
        let totalDeletions = 0;
        for (const c of commitRows) {
          authorSet.add(c.author);
          totalInsertions += c.insertions ?? 0;
          totalDeletions += c.deletions ?? 0;
        }

        const addedFiles: string[] = [];
        const modifiedFiles: string[] = [];
        const deletedFiles: string[] = [];
        const seenFiles = new Set<string>();
        for (const f of fileRows) {
          if (seenFiles.has(f.file_path)) continue;
          seenFiles.add(f.file_path);
          if (f.status === "A") addedFiles.push(f.file_path);
          else if (f.status === "D") deletedFiles.push(f.file_path);
          else modifiedFiles.push(f.file_path);
        }

        const result: DiffSummaryResult = {
          range,
          commits: commitRows.map((c) => ({
            hash: c.hash,
            author: c.author,
            timestamp: c.timestamp,
            message: c.message,
          })),
          authors: [...authorSet],
          added_files: addedFiles,
          modified_files: modifiedFiles,
          deleted_files: deletedFiles,
          total_insertions: totalInsertions,
          total_deletions: totalDeletions,
          decision_points: dpRow?.cnt ?? 0,
        };

        if (opts.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
          return;
        }

        // Text output
        process.stdout.write(`Diff Summary: ${range}\n`);
        process.stdout.write(`${"─".repeat(80)}\n`);
        process.stdout.write(`Commits:      ${commitRows.length}\n`);
        process.stdout.write(`Authors:      ${[...authorSet].join(", ")}\n`);
        process.stdout.write(`Insertions:   +${totalInsertions}\n`);
        process.stdout.write(`Deletions:    -${totalDeletions}\n`);
        process.stdout.write(`Decision pts: ${dpRow?.cnt ?? 0}\n`);
        process.stdout.write(`\n`);

        if (addedFiles.length > 0) {
          process.stdout.write(`Added files (${addedFiles.length}):\n`);
          for (const f of addedFiles) process.stdout.write(`  + ${f}\n`);
          process.stdout.write(`\n`);
        }
        if (deletedFiles.length > 0) {
          process.stdout.write(`Deleted files (${deletedFiles.length}):\n`);
          for (const f of deletedFiles) process.stdout.write(`  - ${f}\n`);
          process.stdout.write(`\n`);
        }
        if (modifiedFiles.length > 0) {
          process.stdout.write(`Modified files (${modifiedFiles.length}):\n`);
          for (const f of modifiedFiles) process.stdout.write(`  ~ ${f}\n`);
          process.stdout.write(`\n`);
        }

        process.stdout.write(`Commits:\n`);
        for (const c of commitRows) {
          const date = c.timestamp.slice(0, 10);
          const hash = c.hash.slice(0, 7);
          process.stdout.write(`  ${date}  ${hash}  ${c.message}\n`);
        }
      } finally {
        db.close();
      }
    });
}
