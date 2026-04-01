import { Command } from "commander";
import { join } from "path";
import { execFileSync } from "child_process";
import { openDb, hasDb } from "../util/db.js";

interface CommitRow {
  hash: string;
  message: string;
  author: string;
  email: string;
  timestamp: string;
  insertions: number;
  deletions: number;
  files_changed: number;
}

interface EnrichmentRow {
  intent: string | null;
  reasoning: string | null;
  category: string | null;
  alternatives_considered: string | null;
  session_context: string | null;
}

interface FileRow {
  file_path: string;
  status: string;
  insertions: number;
  deletions: number;
}

export function whyCommand(): Command {
  return new Command("why")
    .description("Show intent/reasoning for a commit")
    .argument("<hash>", "Commit hash (full or short)")
    .option("--json", "Output as JSON")
    .action((hash: string, opts: { json?: boolean }) => {
      const historyDir = join(process.cwd(), ".git-history");
      if (!hasDb(historyDir)) {
        process.stdout.write("No .git-history/ database found. Run `git-skill snapshot` first.\n");
        process.exit(1);
      }

      // Resolve refs like HEAD, HEAD~1, branch names to actual hashes
      let resolvedHash = hash;
      if (!/^[a-f0-9]+$/.test(hash)) {
        try {
          resolvedHash = execFileSync("git", ["rev-parse", hash], { cwd: process.cwd(), encoding: "utf-8" }).trim();
        } catch {
          // Leave as-is, will fail lookup below
        }
      }

      const db = openDb(historyDir);
      try {
        // Support short hash lookup via LIKE
        let commit: CommitRow | undefined;
        if (resolvedHash.length === 40) {
          commit = db
            .prepare("SELECT * FROM commits WHERE hash = ?")
            .get(resolvedHash) as CommitRow | undefined;
        } else {
          commit = db
            .prepare("SELECT * FROM commits WHERE hash LIKE ?")
            .get(`${resolvedHash}%`) as CommitRow | undefined;
        }

        if (!commit) {
          process.stdout.write(`No commit found for hash: ${hash}\n`);
          process.exit(1);
        }

        const enrichment = db
          .prepare("SELECT * FROM enrichments WHERE commit_hash = ?")
          .get(commit.hash) as EnrichmentRow | undefined;

        const files = db
          .prepare("SELECT file_path, status, insertions, deletions FROM commit_files WHERE commit_hash = ? LIMIT 20")
          .all(commit.hash) as FileRow[];

        if (opts.json) {
          process.stdout.write(
            JSON.stringify(
              {
                hash: commit.hash,
                short_hash: commit.hash.slice(0, 7),
                message: commit.message,
                author: commit.author,
                email: commit.email,
                timestamp: commit.timestamp,
                insertions: commit.insertions,
                deletions: commit.deletions,
                files_changed: commit.files_changed,
                enrichment: enrichment ?? null,
                files,
              },
              null,
              2
            ) + "\n"
          );
          return;
        }

        const shortHash = commit.hash.slice(0, 7);
        const date = commit.timestamp.slice(0, 10);

        process.stdout.write(`Commit ${shortHash}\n`);
        process.stdout.write(`${"─".repeat(60)}\n`);
        process.stdout.write(`Author:    ${commit.author} <${commit.email}>\n`);
        process.stdout.write(`Date:      ${date}\n`);
        process.stdout.write(`Message:   ${commit.message}\n`);
        process.stdout.write(`Changes:   +${commit.insertions} -${commit.deletions} (${commit.files_changed} files)\n`);

        if (enrichment) {
          process.stdout.write(`\nEnrichment\n`);
          process.stdout.write(`${"─".repeat(60)}\n`);
          if (enrichment.category) process.stdout.write(`Category:  ${enrichment.category}\n`);
          if (enrichment.intent) process.stdout.write(`Intent:    ${enrichment.intent}\n`);
          if (enrichment.reasoning) process.stdout.write(`Reasoning: ${enrichment.reasoning}\n`);
          if (enrichment.alternatives_considered) {
            process.stdout.write(`Alts:      ${enrichment.alternatives_considered}\n`);
          }
          if (enrichment.session_context) {
            process.stdout.write(`Context:   ${enrichment.session_context}\n`);
          }
        } else {
          process.stdout.write(`\nNo enrichment data. Run \`git-skill enrich\` to add LLM analysis.\n`);
        }

        if (files.length > 0) {
          process.stdout.write(`\nFiles Changed\n`);
          process.stdout.write(`${"─".repeat(60)}\n`);
          for (const f of files) {
            const stats = `+${f.insertions} -${f.deletions}`;
            process.stdout.write(`  [${f.status}] ${f.file_path}  (${stats})\n`);
          }
          if (commit.files_changed > files.length) {
            process.stdout.write(`  ... and ${commit.files_changed - files.length} more files\n`);
          }
        }

        process.stdout.write("\n");
      } finally {
        db.close();
      }
    });
}
