import { execSync } from "child_process";

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  email: string;
  timestamp: string;
  branch: string;
  parentHash: string;
  mergeCommit: boolean;
  insertions: number;
  deletions: number;
  filesChanged: number;
}

export interface GitFile {
  path: string;
  status: string; // A, M, D, R
  insertions: number;
  deletions: number;
  oldPath: string | null;
}

export interface GitBranch {
  name: string;
  headHash: string;
  isActive: boolean;
}

export interface GitTag {
  name: string;
  hash: string;
  timestamp: string;
  message: string;
}

interface LogOptions {
  limit?: number;
  since?: string;
  until?: string;
  author?: string;
  branch?: string;
}

const EXEC_OPTS = { timeout: 30000, encoding: "utf-8" as const };
const SEP = "---GIT-SKILL-SEP---";

export function isGitRepo(dir: string): boolean {
  try {
    execSync("git rev-parse --git-dir", { ...EXEC_OPTS, cwd: dir, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function getLastCommitHash(cwd: string): string {
  try {
    return execSync("git rev-parse HEAD", { ...EXEC_OPTS, cwd }).trim();
  } catch {
    return "";
  }
}

export function getLog(cwd: string, opts: LogOptions = {}): GitCommit[] {
  try {
    const args: string[] = [
      "git",
      "log",
      `--format=${SEP}%H${SEP}%s${SEP}%an${SEP}%ae${SEP}%aI${SEP}%P`,
      "--numstat",
    ];

    if (opts.limit) args.push(`-n`, String(opts.limit));
    if (opts.since) args.push(`--since=${opts.since}`);
    if (opts.until) args.push(`--until=${opts.until}`);
    if (opts.author) args.push(`--author=${opts.author}`);
    if (opts.branch) args.push(opts.branch);

    const raw = execSync(args.join(" "), { ...EXEC_OPTS, cwd });

    // Split on the SEP that begins each commit header
    // Each commit block starts with SEP
    const blocks = raw.split(new RegExp(`^${SEP}`, "m")).filter(Boolean);

    const commits: GitCommit[] = [];

    for (const block of blocks) {
      // First line is the fields (after stripping the leading SEP from split)
      const newlineIdx = block.indexOf("\n");
      const headerLine = newlineIdx === -1 ? block : block.slice(0, newlineIdx);
      const numstatSection = newlineIdx === -1 ? "" : block.slice(newlineIdx + 1);

      // Fields: hash SEP message SEP author SEP email SEP timestamp SEP parentHash
      const parts = headerLine.split(SEP);
      if (parts.length < 6) continue;

      const [hash, message, author, email, timestamp, parentHashRaw] = parts;
      const parentHash = parentHashRaw?.trim() ?? "";
      const mergeCommit = parentHash.includes(" ");

      // Parse numstat lines: "<insertions>\t<deletions>\t<filepath>"
      let insertions = 0;
      let deletions = 0;
      let filesChanged = 0;

      const numstatLines = numstatSection
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      for (const line of numstatLines) {
        const parts = line.split("\t");
        if (parts.length < 3) continue;
        const ins = parseInt(parts[0], 10);
        const del = parseInt(parts[1], 10);
        if (!isNaN(ins)) insertions += ins;
        if (!isNaN(del)) deletions += del;
        filesChanged++;
      }

      commits.push({
        hash: hash.trim(),
        message: message.trim(),
        author: author.trim(),
        email: email.trim(),
        timestamp: timestamp.trim(),
        branch: "",
        parentHash,
        mergeCommit,
        insertions,
        deletions,
        filesChanged,
      });
    }

    return commits;
  } catch {
    return [];
  }
}

export function getDiffTree(cwd: string, hash: string): GitFile[] {
  try {
    const numstatRaw = execSync(
      `git diff-tree --no-commit-id -r --numstat -M ${hash}`,
      { ...EXEC_OPTS, cwd }
    );
    const nameStatusRaw = execSync(
      `git diff-tree --no-commit-id -r --name-status -M ${hash}`,
      { ...EXEC_OPTS, cwd }
    );

    // Build a map from path -> status
    const statusMap = new Map<string, { status: string; oldPath: string | null }>();
    for (const line of nameStatusRaw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split("\t");
      if (parts.length < 2) continue;
      const statusCode = parts[0][0]; // e.g. R100 -> R, M -> M
      if (parts.length === 3) {
        // Rename: old\tnew
        statusMap.set(parts[2], { status: statusCode, oldPath: parts[1] });
      } else {
        statusMap.set(parts[1], { status: statusCode, oldPath: null });
      }
    }

    const files: GitFile[] = [];
    for (const line of numstatRaw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split("\t");
      if (parts.length < 3) continue;
      const ins = parseInt(parts[0], 10);
      const del = parseInt(parts[1], 10);
      // For renames, numstat uses "old => new" path or two tabs
      const filePath = parts[2];
      const statusInfo = statusMap.get(filePath) ?? { status: "M", oldPath: null };
      files.push({
        path: filePath,
        status: statusInfo.status,
        insertions: isNaN(ins) ? 0 : ins,
        deletions: isNaN(del) ? 0 : del,
        oldPath: statusInfo.oldPath,
      });
    }

    return files;
  } catch {
    return [];
  }
}

export function getBranches(cwd: string): GitBranch[] {
  try {
    const raw = execSync(
      `git branch -a --format="%(refname:short)\t%(HEAD)\t%(objectname:short)"`,
      { ...EXEC_OPTS, cwd }
    );

    const branches: GitBranch[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim().replace(/^"|"$/g, "");
      if (!trimmed) continue;
      const parts = trimmed.split("\t");
      if (parts.length < 3) continue;
      const name = parts[0].trim();
      const isActive = parts[1].trim() === "*";
      const headHash = parts[2].trim();
      branches.push({ name, headHash, isActive });
    }

    return branches;
  } catch {
    return [];
  }
}

export function getTags(cwd: string): GitTag[] {
  try {
    const raw = execSync(
      `git tag -l --format="%(refname:short)\t%(objectname:short)\t%(creatordate:iso-strict)\t%(subject)"`,
      { ...EXEC_OPTS, cwd }
    );

    const tags: GitTag[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim().replace(/^"|"$/g, "");
      if (!trimmed) continue;
      const parts = trimmed.split("\t");
      if (parts.length < 4) continue;
      tags.push({
        name: parts[0].trim(),
        hash: parts[1].trim(),
        timestamp: parts[2].trim(),
        message: parts[3].trim(),
      });
    }

    return tags;
  } catch {
    return [];
  }
}
