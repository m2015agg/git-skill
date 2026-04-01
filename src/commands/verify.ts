import { Command } from "commander";
import { join } from "path";
import { execFileSync } from "child_process";
import { openDb, hasDb } from "../util/db.js";
import { readConfig } from "../util/config.js";
import { loadDotEnv, resolveEnvVar } from "../util/env.js";

const MAX_BUFFER = 10 * 1024 * 1024;

interface VerifyResult {
  file: string;
  status: "PASS" | "WARN" | "BLOCK";
  reason: string;
  related_commits: string[];
  edit_count?: number;
  revert_count?: number;
}

interface RevertRow {
  hash: string;
  message: string;
}

interface DecisionRow {
  type: string;
  message: string;
  hash: string;
}

interface EnrichmentRow {
  intent: string;
  reasoning: string;
  category: string;
}

function getStagedDiff(cwd: string): string {
  try {
    return execFileSync("git", ["diff", "--cached"], {
      cwd,
      encoding: "utf-8",
      timeout: 15000,
      maxBuffer: MAX_BUFFER,
    });
  } catch {
    return "";
  }
}

function getFileDiff(cwd: string, filePath: string): string {
  try {
    return execFileSync("git", ["diff", "HEAD", "--", filePath], {
      cwd,
      encoding: "utf-8",
      timeout: 15000,
      maxBuffer: MAX_BUFFER,
    });
  } catch {
    return "";
  }
}

function getStagedFiles(cwd: string): string[] {
  try {
    const out = execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd,
      encoding: "utf-8",
      timeout: 15000,
      maxBuffer: MAX_BUFFER,
    });
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function getCommitDiff(cwd: string, hash: string, maxChars = 2000): string {
  try {
    const raw = execFileSync("git", ["show", "--patch", "--no-color", hash], {
      cwd,
      encoding: "utf-8",
      timeout: 10000,
      maxBuffer: MAX_BUFFER,
    });
    const diffStart = raw.indexOf("diff --git");
    if (diffStart === -1) return "(no diff)";
    const diff = raw.slice(diffStart);
    return diff.length <= maxChars ? diff : diff.slice(0, maxChars) + `\n... (truncated)`;
  } catch {
    return "(diff unavailable)";
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + `\n... (truncated, ${s.length - max} chars omitted)`;
}

async function callLlmVerify(
  url: string,
  model: string,
  apiKey: string | undefined,
  maxTokens: number,
  prompt: string
): Promise<VerifyResult[] | null> {
  const isAnthropic = url.includes("anthropic.com");
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (isAnthropic) {
    if (apiKey) headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const body = {
    model,
    max_tokens: maxTokens,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  };

  try {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!response.ok) {
      const err = await response.text().catch(() => "");
      if (err) process.stderr.write(`API error: ${response.status} ${err.slice(0, 200)}\n`);
      return null;
    }
    const data = (await response.json()) as any;
    const text = data.choices?.[0]?.message?.content ?? data.content?.[0]?.text ?? "";
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    return JSON.parse(cleaned) as VerifyResult[];
  } catch (e: any) {
    process.stderr.write(`Verify LLM error: ${e.message?.slice(0, 150) ?? "unknown"}\n`);
    return null;
  }
}

function buildVerifyPrompt(
  stagedDiff: string,
  fileHistories: Array<{ file: string; summary: string }>,
  enrichmentSummaries: string
): string {
  const perFileHistory = fileHistories
    .map((fh) => `### ${fh.file}\n${fh.summary}`)
    .join("\n\n");

  return `You are reviewing staged code changes against this repository's git history.
Your job: identify if any of these changes repeat a pattern that was previously
tried and reverted, thrash on a value that's been changed multiple times, or
re-introduce something that was intentionally removed.

STAGED DIFF:
${truncate(stagedDiff, 5000)}

FILE HISTORY:
${perFileHistory}

ENRICHMENT CONTEXT:
${enrichmentSummaries}

For each modified file, respond with a JSON array:
[
  {
    "file": "path/to/file",
    "status": "PASS" | "WARN" | "BLOCK",
    "reason": "explanation with commit references",
    "related_commits": ["hash1", "hash2"]
  }
]

Rules:
- BLOCK: change directly re-introduces a reverted pattern or re-introduces intentionally removed code
- WARN: file has high churn history, recent thrashing, or multiple related reverts nearby
- PASS: no concerning patterns detected
- Be concise. Reference short hashes (7 chars) when citing commits.
- Respond ONLY with the JSON array, no markdown fences, no explanation.`;
}

function localFallback(
  files: string[],
  fileData: Map<
    string,
    { editCount: number; recentEdits: number; reverts: RevertRow[]; decisions: DecisionRow[] }
  >
): VerifyResult[] {
  return files.map((file) => {
    const data = fileData.get(file);
    if (!data) {
      return { file, status: "PASS", reason: "No history found for this file.", related_commits: [] };
    }

    const { editCount, recentEdits, reverts } = data;
    const revertHashes = reverts.map((r) => r.hash.slice(0, 7));

    if (reverts.length > 0) {
      return {
        file,
        status: "WARN",
        reason: `File has ${reverts.length} revert(s) in history (${revertHashes.join(", ")}). ${editCount} total edits, ${recentEdits} in last 10 commits.`,
        related_commits: revertHashes,
        edit_count: editCount,
        revert_count: reverts.length,
      };
    }

    if (recentEdits >= 5) {
      return {
        file,
        status: "WARN",
        reason: `High churn: ${recentEdits} edits in last 10 commits (${editCount} total). May be thrashing.`,
        related_commits: [],
        edit_count: editCount,
        revert_count: 0,
      };
    }

    return {
      file,
      status: "PASS",
      reason: `${editCount} total edit(s), ${recentEdits} in last 10 commits. No reverts detected.`,
      related_commits: [],
      edit_count: editCount,
      revert_count: 0,
    };
  });
}

function formatResultsText(results: VerifyResult[]): string {
  const lines: string[] = [];
  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : r.status === "WARN" ? "⚠" : "✗";
    lines.push(`${icon} [${r.status}] ${r.file}`);
    lines.push(`  ${r.reason}`);
    if (r.related_commits.length > 0) {
      lines.push(`  Related commits: ${r.related_commits.join(", ")}`);
    }
  }
  return lines.join("\n") + "\n";
}

export function verifyCommand(): Command {
  return new Command("verify")
    .description("Check staged changes against git history for repeated mistakes and reverted patterns")
    .option("--file <path>", "Check a specific file instead of staged changes")
    .option("--json", "Output structured JSON")
    .action(async (opts: { file?: string; json?: boolean }) => {
      const cwd = process.cwd();

      // Get the diff to analyze
      let stagedDiff: string;
      let files: string[];

      if (opts.file) {
        stagedDiff = getFileDiff(cwd, opts.file);
        files = stagedDiff ? [opts.file] : [];
        if (!stagedDiff) {
          process.stdout.write(`No diff found for ${opts.file}\n`);
          return;
        }
      } else {
        stagedDiff = getStagedDiff(cwd);
        files = getStagedFiles(cwd);
        if (!stagedDiff || files.length === 0) {
          process.stdout.write("Nothing staged. Use --file or stage changes first.\n");
          return;
        }
      }

      // Check if history DB exists
      const historyDir = join(cwd, ".git-history");
      if (!hasDb(historyDir)) {
        process.stdout.write("No .git-history/ database found. Run `git-skill snapshot` first.\n");
        if (opts.json) {
          process.stdout.write(JSON.stringify([]) + "\n");
        }
        return;
      }

      const db = openDb(historyDir);

      try {
        // Gather per-file history
        const fileData = new Map<
          string,
          { editCount: number; recentEdits: number; reverts: RevertRow[]; decisions: DecisionRow[]; enrichments: EnrichmentRow[] }
        >();

        const revertDiffs: string[] = [];

        for (const file of files) {
          // Total edit count
          const editCountRow = db
            .prepare("SELECT COUNT(*) as count FROM commit_files WHERE file_path = ?")
            .get(file) as { count: number };
          const editCount = editCountRow?.count ?? 0;

          // Recent 10 commits touching this file
          const recentRows = db
            .prepare(
              `SELECT cf.commit_hash FROM commit_files cf
               JOIN commits c ON c.hash = cf.commit_hash
               WHERE cf.file_path = ?
               ORDER BY c.timestamp DESC LIMIT 10`
            )
            .all(file) as { commit_hash: string }[];
          const recentEdits = recentRows.length;

          // Reverts
          const reverts = db
            .prepare(
              `SELECT c.hash, c.message FROM commits c
               JOIN commit_files cf ON c.hash = cf.commit_hash
               WHERE cf.file_path = ?
               AND (c.message LIKE '%revert%' OR c.message LIKE '%Revert%')
               ORDER BY c.timestamp DESC LIMIT 5`
            )
            .all(file) as RevertRow[];

          // Decision points
          const decisions = db
            .prepare(
              `SELECT dp.type, c.message, c.hash FROM decision_points dp
               JOIN commits c ON c.hash = dp.commit_hash
               JOIN commit_files cf ON cf.commit_hash = c.hash
               WHERE cf.file_path = ?
               ORDER BY c.timestamp DESC LIMIT 5`
            )
            .all(file) as DecisionRow[];

          // Enrichments
          const enrichments = db
            .prepare(
              `SELECT e.intent, e.reasoning, e.category FROM enrichments e
               JOIN commit_files cf ON cf.commit_hash = e.commit_hash
               WHERE cf.file_path = ?
               ORDER BY e.commit_hash DESC LIMIT 5`
            )
            .all(file) as EnrichmentRow[];

          fileData.set(file, { editCount, recentEdits, reverts, decisions, enrichments });

          // Pull revert diffs for context (up to 2 per file)
          for (const revert of reverts.slice(0, 2)) {
            const diff = getCommitDiff(cwd, revert.hash, 2000);
            revertDiffs.push(`Revert commit ${revert.hash.slice(0, 7)}: ${revert.message}\n${diff}`);
          }
        }

        // Try LLM if configured
        const config = readConfig();
        const enrichEnabled = config?.enrichment?.enabled && config.enrichment.url;

        let results: VerifyResult[];

        if (enrichEnabled) {
          loadDotEnv();
          const apiKey = resolveEnvVar(config!.enrichment.apiKey);
          const maxTokens = config!.enrichment.maxTokensPerCommit || 5000;

          // Build per-file history summaries
          const fileHistories = files.map((file) => {
            const data = fileData.get(file)!;
            const parts: string[] = [];
            parts.push(`Total edits: ${data.editCount}`);
            parts.push(`Edits in last 10 commits: ${data.recentEdits}`);
            if (data.reverts.length > 0) {
              parts.push(`Reverts (${data.reverts.length}):`);
              data.reverts.forEach((r) => parts.push(`  - ${r.hash.slice(0, 7)}: ${r.message}`));
            }
            if (data.decisions.length > 0) {
              parts.push(`Decision points:`);
              data.decisions.forEach((d) => parts.push(`  - [${d.type}] ${d.hash.slice(0, 7)}: ${d.message}`));
            }
            return { file, summary: parts.join("\n") };
          });

          // Build enrichment summaries
          const enrichmentParts: string[] = [];
          for (const file of files) {
            const data = fileData.get(file)!;
            if (data.enrichments.length > 0) {
              enrichmentParts.push(`${file}:`);
              data.enrichments.forEach((e) => {
                enrichmentParts.push(`  [${e.category ?? "?"}] ${e.intent ?? ""}`);
                if (e.reasoning) enrichmentParts.push(`    Reasoning: ${e.reasoning.slice(0, 200)}`);
              });
            }
          }

          if (revertDiffs.length > 0) {
            enrichmentParts.push("\nHistorical revert diffs:");
            revertDiffs.forEach((d) => enrichmentParts.push(d));
          }

          const prompt = buildVerifyPrompt(stagedDiff, fileHistories, enrichmentParts.join("\n"));

          const llmResults = await callLlmVerify(
            config!.enrichment.url,
            config!.enrichment.model,
            apiKey,
            maxTokens,
            prompt
          );

          if (llmResults) {
            results = llmResults;
          } else {
            process.stderr.write("LLM call failed, falling back to local analysis.\n");
            results = localFallback(files, fileData);
          }
        } else {
          results = localFallback(files, fileData);
        }

        if (opts.json) {
          process.stdout.write(JSON.stringify(results, null, 2) + "\n");
        } else {
          process.stdout.write(formatResultsText(results));
        }
      } finally {
        db.close();
      }
    });
}
