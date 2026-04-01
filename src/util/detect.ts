import { existsSync } from "fs";
import { join } from "path";

export type ProjectType = "nodejs" | "python" | "rust" | "go" | "generic";

export function detectProjectType(cwd: string): ProjectType {
  if (existsSync(join(cwd, "package.json"))) return "nodejs";
  if (existsSync(join(cwd, "requirements.txt")) || existsSync(join(cwd, "pyproject.toml"))) return "python";
  if (existsSync(join(cwd, "Cargo.toml"))) return "rust";
  if (existsSync(join(cwd, "go.mod"))) return "go";
  return "generic";
}
