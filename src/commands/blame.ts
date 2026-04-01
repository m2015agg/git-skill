import { Command } from "commander";
import { openDb } from "../util/db.js";
import { join } from "path";
import { execFileSync } from "child_process";

interface BlameEntry {
  hash: string;
  author: string;
  timestamp: string;
  lineStart: number;
  lineEnd: number;
  message?: string;
  intent?: string;
  category?: string;
}

function parsePorcelain(output: string): Map<number, { hash: string; author: string; timestamp: string }> {
  const lines = output.split("\n");
  const result = new Map<number, { hash: string; author: string; timestamp: string }>();
  let currentHash = "";
  let currentAuthor = "";
  let currentTimestamp = "";
  let currentLine = 0;

  for (const line of lines) {
    // Header line: <hash> <orig-line> <final-line> [<num-lines>]
    const headerMatch = line.match(/^([0-9a-f]{40}) \d+ (\d+)/);
    if (headerMatch) {
      currentHash = headerMatch[1];
      currentLine = parseInt(headerMatch[2], 10);
      continue;
    }
    if (line.startsWith("author ") && !line.startsWith("author-")) {
      currentAuthor = line.slice(7);
      continue;
    }
    if (line.startsWith("author-time ")) {
      const epochSecs = parseInt(line.slice(12), 10);
      currentTimestamp = new Date(epochSecs * 1000).toISOString();
      continue;
    }
    // Content line (starts with tab) signals end of this entry
    if (line.startsWith("\t")) {
      result.set(currentLine, {
        hash: currentHash,
        author: currentAuthor,
        timestamp: currentTimestamp,
      });
    }
  }

  return result;
}

export function blameCommand(): Command {
  return new Command("blame")
    .description("Enhanced blame combining git blame with enrichment data")
    .argument("<path>", "File path to blame")
    .option("--json", "Output as JSON")
    .action((filePath: string, opts: { json?: boolean }) => {
      const historyDir = join(process.cwd(), ".git-history");
      const db = openDb(historyDir);
      try {
        // Run git blame --porcelain
        let porcelainOutput: string;
        try {
          porcelainOutput = execFileSync("git", ["blame", "--porcelain", filePath], {
            cwd: process.cwd(),
            encoding: "utf-8",
          });
        } catch {
          process.stderr.write(`Could not run git blame on: ${filePath}\n`);
          process.exit(1);
        }

        const lineMap = parsePorcelain(porcelainOutput);

        // Get unique hashes
        const hashes = [...new Set([...lineMap.values()].map((v) => v.hash))];

        // Look up commits for messages
        const commitMessages = new Map<string, string>();
        const enrichmentData = new Map<string, { intent: string; category: string }>();

        if (hashes.length > 0) {
          const placeholders = hashes.map(() => "?").join(",");
          const commitRows = db
            .prepare(`SELECT hash, message FROM commits WHERE hash IN (${placeholders})`)
            .all(...hashes) as Array<{ hash: string; message: string }>;
          for (const row of commitRows) {
            commitMessages.set(row.hash, row.message);
          }

          const enrichRows = db
            .prepare(`SELECT commit_hash, intent, category FROM enrichments WHERE commit_hash IN (${placeholders})`)
            .all(...hashes) as Array<{ commit_hash: string; intent: string; category: string }>;
          for (const row of enrichRows) {
            enrichmentData.set(row.commit_hash, { intent: row.intent, category: row.category });
          }
        }

        // Group consecutive lines by hash into ranges
        const entries: BlameEntry[] = [];
        let currentEntry: BlameEntry | null = null;

        const sortedLines = [...lineMap.entries()].sort((a, b) => a[0] - b[0]);

        for (const [lineNum, info] of sortedLines) {
          if (currentEntry && currentEntry.hash === info.hash && currentEntry.lineEnd === lineNum - 1) {
            currentEntry.lineEnd = lineNum;
          } else {
            if (currentEntry) entries.push(currentEntry);
            currentEntry = {
              hash: info.hash,
              author: info.author,
              timestamp: info.timestamp,
              lineStart: lineNum,
              lineEnd: lineNum,
              message: commitMessages.get(info.hash),
              intent: enrichmentData.get(info.hash)?.intent,
              category: enrichmentData.get(info.hash)?.category,
            };
          }
        }
        if (currentEntry) entries.push(currentEntry);

        if (opts.json) {
          process.stdout.write(JSON.stringify(entries, null, 2) + "\n");
          return;
        }

        if (entries.length === 0) {
          process.stdout.write(`No blame data found for: ${filePath}\n`);
          return;
        }

        process.stdout.write(`Blame: ${filePath}\n`);
        process.stdout.write(`${"─".repeat(80)}\n`);
        for (const entry of entries) {
          const hash = entry.hash.slice(0, 7);
          const date = entry.timestamp.slice(0, 10);
          const lines =
            entry.lineStart === entry.lineEnd
              ? `L${entry.lineStart}`
              : `L${entry.lineStart}-${entry.lineEnd}`;
          const message = entry.message ?? "(no message)";
          process.stdout.write(`${lines.padEnd(12)}  ${hash}  ${date}  ${entry.author}\n`);
          process.stdout.write(`${"".padEnd(12)}  ${message}\n`);
          if (entry.intent) {
            process.stdout.write(`${"".padEnd(12)}  intent: ${entry.intent}\n`);
          }
          if (entry.category) {
            process.stdout.write(`${"".padEnd(12)}  category: ${entry.category}\n`);
          }
        }
      } finally {
        db.close();
      }
    });
}
