import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const MARKER_START = "<!-- git-skill:start -->";
const MARKER_END = "<!-- git-skill:end -->";

export function upsertSection(filePath: string, content: string): "created" | "updated" | "unchanged" {
  const snippet = `${MARKER_START}\n${content}\n${MARKER_END}`;

  if (!existsSync(filePath)) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, snippet + "\n");
    return "created";
  }

  const existing = readFileSync(filePath, "utf-8");
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const currentSection = existing.slice(startIdx, endIdx + MARKER_END.length);
    if (currentSection === snippet) return "unchanged";
    const updated = existing.slice(0, startIdx) + snippet + existing.slice(endIdx + MARKER_END.length);
    writeFileSync(filePath, updated);
    return "updated";
  }

  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  writeFileSync(filePath, existing + separator + snippet + "\n");
  return "updated";
}

export function removeSection(filePath: string): "removed" | "not_found" {
  if (!existsSync(filePath)) return "not_found";
  const content = readFileSync(filePath, "utf-8");
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1) return "not_found";
  const before = content.slice(0, startIdx).replace(/\n+$/, "");
  const after = content.slice(endIdx + MARKER_END.length).replace(/^\n+/, "");
  const result = before + (after ? "\n\n" + after : "") + "\n";
  writeFileSync(filePath, result);
  return "removed";
}
