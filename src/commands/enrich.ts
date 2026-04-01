import { Command } from "commander";
import { join } from "path";
import { execSync } from "child_process";
import { openDb, hasDb } from "../util/db.js";
import { readConfig } from "../util/config.js";

interface CommitRow {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
}

async function callLlm(
  url: string,
  model: string,
  apiKey: string | undefined,
  commit: CommitRow
): Promise<{ intent?: string; reasoning?: string; category?: string; alternatives_considered?: string; session_context?: string } | null> {
  const prompt = `Analyze this git commit and respond with ONLY a JSON object (no markdown, no explanation):
{
  "intent": "one sentence describing what this commit does",
  "reasoning": "why this change was likely made",
  "category": "one of: feature, bugfix, refactor, docs, chore, test, style, perf",
  "alternatives_considered": "brief note on alternatives (optional)",
  "session_context": "broader context about what was being worked on (optional)"
}

Commit hash: ${commit.hash.slice(0, 7)}
Author: ${commit.author}
Date: ${commit.timestamp.slice(0, 10)}
Message: ${commit.message}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content ?? data.content?.[0]?.text ?? "";
    // Strip potential markdown code fences
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function resolveEnvVar(val: string): string | undefined {
  if (!val) return undefined;
  const match = val.match(/^\$\{(.+)\}$/);
  return match ? process.env[match[1]] : val;
}

export function enrichCommand(): Command {
  return new Command("enrich")
    .description("Backfill LLM enrichments for commit history")
    .argument("[range]", "Git range to filter commits (e.g. v1.0..v1.1)")
    .option("--dry-run", "Show what would be enriched without doing it")
    .option("--limit <n>", "Max commits to enrich", "50")
    .action(async (range: string | undefined, opts: { dryRun?: boolean; limit: string }) => {
      const historyDir = join(process.cwd(), ".git-history");
      if (!hasDb(historyDir)) {
        process.stdout.write("No .git-history/ database found. Run `git-skill snapshot` first.\n");
        process.exit(1);
      }

      const db = openDb(historyDir);
      try {
        const limit = parseInt(opts.limit, 10) || 50;

        // Get unenriched commits
        let commits = db
          .prepare(`
            SELECT c.hash, c.message, c.author, c.timestamp
            FROM commits c
            LEFT JOIN enrichments e ON c.hash = e.commit_hash
            WHERE e.commit_hash IS NULL
            ORDER BY c.timestamp DESC
            LIMIT ?
          `)
          .all(limit) as CommitRow[];

        // Filter by range if provided
        if (range) {
          try {
            const rangeHashes = execSync(`git rev-list ${range}`, {
              cwd: process.cwd(),
              encoding: "utf-8",
              timeout: 10000,
            }).trim().split("\n").filter(Boolean);
            const rangeSet = new Set(rangeHashes);
            commits = commits.filter((c) => rangeSet.has(c.hash));
          } catch {
            process.stdout.write(`Warning: could not resolve range "${range}"\n`);
          }
        }

        if (commits.length === 0) {
          process.stdout.write("No commits to enrich.\n");
          return;
        }

        const config = readConfig();
        const enrichEnabled = config?.enrichment?.enabled && config.enrichment.url;

        if (opts.dryRun) {
          process.stdout.write(`Would enrich ${commits.length} commit${commits.length !== 1 ? "s" : ""}:\n`);
          for (const c of commits.slice(0, 10)) {
            process.stdout.write(`  ${c.hash.slice(0, 7)}  ${c.message.slice(0, 60)}\n`);
          }
          if (commits.length > 10) {
            process.stdout.write(`  ... and ${commits.length - 10} more\n`);
          }
          return;
        }

        if (!enrichEnabled) {
          process.stdout.write(
            `Enrichment not configured. Set enrichment.enabled and enrichment.url in ~/.config/git-skill/config.json\n`
          );
          process.stdout.write(`${commits.length} commit${commits.length !== 1 ? "s" : ""} would be enriched.\n`);
          return;
        }

        process.stdout.write(`Enriching ${commits.length} commits...\n`);

        const apiKey = resolveEnvVar(config!.enrichment.apiKey);

        const insertEnrichment = db.prepare(`
          INSERT OR REPLACE INTO enrichments
            (commit_hash, intent, reasoning, category, alternatives_considered, session_context)
          VALUES
            (@commitHash, @intent, @reasoning, @category, @alternativesConsidered, @sessionContext)
        `);

        let successCount = 0;
        let failCount = 0;

        for (const commit of commits) {
          const result = await callLlm(
            config!.enrichment.url,
            config!.enrichment.model,
            apiKey,
            commit
          );
          if (result) {
            insertEnrichment.run({
              commitHash: commit.hash,
              intent: result.intent ?? null,
              reasoning: result.reasoning ?? null,
              category: result.category ?? null,
              alternativesConsidered: result.alternatives_considered ?? null,
              sessionContext: result.session_context ?? null,
            });
            successCount++;
          } else {
            failCount++;
          }
        }

        process.stdout.write(`Done. Enriched: ${successCount}, Failed: ${failCount}\n`);
      } finally {
        db.close();
      }
    });
}
