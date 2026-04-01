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
  insertions: number;
  deletions: number;
  files_changed: number;
}

interface FileRow {
  file_path: string;
  status: string;
  insertions: number;
  deletions: number;
}

function getDiff(cwd: string, hash: string, maxChars = 3000): string {
  try {
    const raw = execSync(`git show --patch --no-color ${hash}`, {
      cwd,
      encoding: "utf-8",
      timeout: 10000,
      maxBuffer: 10 * 1024 * 1024,
    });
    // Skip the header (everything before first diff --git)
    const diffStart = raw.indexOf("diff --git");
    if (diffStart === -1) return "(no diff)";
    const diff = raw.slice(diffStart);
    if (diff.length <= maxChars) return diff;
    return diff.slice(0, maxChars) + `\n... (truncated, ${diff.length - maxChars} chars omitted)`;
  } catch {
    return "(diff unavailable)";
  }
}

function getRecentMessages(db: ReturnType<typeof openDb>, beforeTimestamp: string, limit = 3): string[] {
  const rows = db
    .prepare("SELECT message FROM commits WHERE timestamp < ? ORDER BY timestamp DESC LIMIT ?")
    .all(beforeTimestamp, limit) as { message: string }[];
  return rows.map((r) => r.message);
}

async function callLlm(
  url: string,
  model: string,
  apiKey: string | undefined,
  maxTokens: number,
  prompt: string
): Promise<Record<string, string> | null> {
  const isAnthropic = url.includes("anthropic.com");
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (isAnthropic) {
    if (apiKey) headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const body = isAnthropic
    ? { model, max_tokens: maxTokens, temperature: 0, messages: [{ role: "user", content: prompt }] }
    : { model, max_tokens: maxTokens, temperature: 0, messages: [{ role: "user", content: prompt }] };

  try {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) {
      const err = await response.text().catch(() => "");
      if (err) process.stderr.write(`API error: ${response.status} ${err.slice(0, 200)}\n`);
      return null;
    }
    const data = (await response.json()) as any;
    // OpenAI format: choices[0].message.content
    // Anthropic format: content[0].text
    const text = data.choices?.[0]?.message?.content ?? data.content?.[0]?.text ?? "";
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function buildPrompt(
  commit: CommitRow,
  files: FileRow[],
  diff: string,
  recentMessages: string[]
): string {
  const fileList = files
    .map((f) => `  [${f.status}] ${f.file_path} (+${f.insertions}/-${f.deletions})`)
    .join("\n");

  const recentContext =
    recentMessages.length > 0
      ? `\nRecent commits before this one:\n${recentMessages.map((m) => `  - ${m}`).join("\n")}\n`
      : "";

  return `You are analyzing a git commit to extract structured intelligence about what changed and why.

Study the commit message, file list, and diff carefully. Respond with ONLY a JSON object — no markdown fences, no explanation.

{
  "intent": "One clear sentence: what is the developer trying to accomplish with this commit?",
  "what_changed": "Concrete description of the actual code changes (functions added/removed/modified, config changes, structural changes). Be specific — reference actual names from the diff.",
  "goal": "The broader goal or problem being solved. Why does this change exist? What user/system need does it serve?",
  "reasoning": "Why was this approach chosen? What tradeoffs were made?",
  "category": "One of: feature, bugfix, refactor, cleanup, docs, test, config, perf, revert",
  "impact": "One of: low (typo, comment, minor tweak), medium (single feature/fix, localized change), high (architecture change, breaking change, cross-cutting concern)",
  "alternatives_considered": "What other approaches could have been taken? Say 'none apparent' if the change is straightforward.",
  "session_context": "Based on the recent commits and this change, what broader work session or initiative is this part of?"
}

--- COMMIT ---
Hash: ${commit.hash.slice(0, 7)}
Author: ${commit.author}
Date: ${commit.timestamp.slice(0, 10)}
Message: ${commit.message}
Stats: +${commit.insertions}/-${commit.deletions} across ${commit.files_changed} files
${recentContext}
--- FILES CHANGED ---
${fileList}

--- DIFF ---
${diff}`;
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
    .option("--limit <n>", "Max commits to enrich (default: all)")
    .action(async (range: string | undefined, opts: { dryRun?: boolean; limit?: string }) => {
      const cwd = process.cwd();
      const historyDir = join(cwd, ".git-history");
      if (!hasDb(historyDir)) {
        process.stdout.write("No .git-history/ database found. Run `git-skill snapshot` first.\n");
        process.exit(1);
      }

      const db = openDb(historyDir);
      try {
        let query = `
          SELECT c.hash, c.message, c.author, c.timestamp, c.insertions, c.deletions, c.files_changed
          FROM commits c
          LEFT JOIN enrichments e ON c.hash = e.commit_hash
          WHERE e.commit_hash IS NULL
          ORDER BY c.timestamp DESC
        `;
        if (opts.limit) query += ` LIMIT ${parseInt(opts.limit, 10)}`;

        let commits = db.prepare(query).all() as CommitRow[];

        // Filter by range if provided
        if (range) {
          try {
            const rangeHashes = execSync(`git rev-list ${range}`, {
              cwd,
              encoding: "utf-8",
              timeout: 10000,
            })
              .trim()
              .split("\n")
              .filter(Boolean);
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
          process.stdout.write(
            `Would enrich ${commits.length} commit${commits.length !== 1 ? "s" : ""}:\n`
          );
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
            "Enrichment not configured. Set enrichment.enabled and enrichment.url in ~/.config/git-skill/config.json\n"
          );
          process.stdout.write(
            `Recommended models: claude-sonnet-4-5-20250514, gpt-4o, gpt-4o-mini\n`
          );
          process.stdout.write(
            `${commits.length} commit${commits.length !== 1 ? "s" : ""} would be enriched.\n`
          );
          return;
        }

        const maxTokens = config!.enrichment.maxTokensPerCommit || 5000;
        process.stdout.write(
          `Enriching ${commits.length} commits (model: ${config!.enrichment.model}, max_tokens: ${maxTokens})...\n`
        );

        const apiKey = resolveEnvVar(config!.enrichment.apiKey);

        const insertEnrichment = db.prepare(`
          INSERT OR REPLACE INTO enrichments
            (commit_hash, intent, reasoning, category, alternatives_considered, session_context)
          VALUES
            (@commitHash, @intent, @reasoning, @category, @alternativesConsidered, @sessionContext)
        `);

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < commits.length; i++) {
          const commit = commits[i];

          // Get file list from SQLite
          const files = db
            .prepare(
              "SELECT file_path, status, insertions, deletions FROM commit_files WHERE commit_hash = ?"
            )
            .all(commit.hash) as FileRow[];

          // Get actual diff (truncated)
          const diff = getDiff(cwd, commit.hash);

          // Get recent commit messages for session context
          const recentMessages = getRecentMessages(db, commit.timestamp);

          // Build rich prompt
          const prompt = buildPrompt(commit, files, diff, recentMessages);

          const result = await callLlm(
            config!.enrichment.url,
            config!.enrichment.model,
            apiKey,
            maxTokens,
            prompt
          );

          if (result) {
            // Combine new fields into existing schema
            const intentParts = [result.intent];
            if (result.what_changed) intentParts.push(`Changes: ${result.what_changed}`);
            if (result.goal) intentParts.push(`Goal: ${result.goal}`);
            if (result.impact) intentParts.push(`Impact: ${result.impact}`);

            insertEnrichment.run({
              commitHash: commit.hash,
              intent: intentParts.join(" | "),
              reasoning: result.reasoning ?? null,
              category: result.category ?? null,
              alternativesConsidered: result.alternatives_considered ?? null,
              sessionContext: result.session_context ?? null,
            });
            successCount++;
          } else {
            failCount++;
          }

          // Progress
          if ((i + 1) % 10 === 0 || i === commits.length - 1) {
            process.stdout.write(
              `  ${i + 1}/${commits.length} (${successCount} ok, ${failCount} failed)\n`
            );
          }
        }

        process.stdout.write(
          `Done. Enriched: ${successCount}, Failed: ${failCount}\n`
        );
      } finally {
        db.close();
      }
    });
}
