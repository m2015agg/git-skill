import { readFileSync, writeFileSync, existsSync, chmodSync, unlinkSync } from "fs";
import { join } from "path";

const HOOK_MARKER = "# git-skill hook";
const HOOK_CONTENT = `\n${HOOK_MARKER}\ngit-skill capture --hook 2>/dev/null &\n`;

export function installHook(gitDir: string): "installed" | "updated" | "already_installed" {
  const hookPath = join(gitDir, "hooks", "post-commit");

  if (existsSync(hookPath)) {
    const content = readFileSync(hookPath, "utf-8");
    if (content.includes(HOOK_MARKER)) return "already_installed";
    writeFileSync(hookPath, content + HOOK_CONTENT);
    chmodSync(hookPath, 0o755);
    return "updated";
  }

  writeFileSync(hookPath, `#!/bin/sh\n${HOOK_CONTENT}`);
  chmodSync(hookPath, 0o755);
  return "installed";
}

export function removeHook(gitDir: string): "removed" | "not_found" {
  const hookPath = join(gitDir, "hooks", "post-commit");
  if (!existsSync(hookPath)) return "not_found";
  const content = readFileSync(hookPath, "utf-8");
  if (!content.includes(HOOK_MARKER)) return "not_found";
  const lines = content.split("\n");
  const filtered = lines.filter(line => !line.includes(HOOK_MARKER) && !line.includes("git-skill capture"));
  const result = filtered.join("\n").trim();
  if (result === "#!/bin/sh" || result === "") {
    unlinkSync(hookPath);
  } else {
    writeFileSync(hookPath, result + "\n");
  }
  return "removed";
}

export function hasHook(gitDir: string): boolean {
  const hookPath = join(gitDir, "hooks", "post-commit");
  if (!existsSync(hookPath)) return false;
  return readFileSync(hookPath, "utf-8").includes(HOOK_MARKER);
}
