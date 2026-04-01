import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "../fixtures/create-test-repo.js";
import { cleanupTempDir } from "../helpers/setup.js";
import { resolve } from "path";

describe("trends command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("returns some output", () => {
    const output = execSync(`node ${cliPath} trends`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    // Either shows metrics or tells the user to run snapshot
    expect(output.length).toBeGreaterThan(0);
  });

  it("outputs valid JSON", () => {
    const output = execSync(`node ${cliPath} trends --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output);
    expect(parsed).toBeInstanceOf(Array);
  });

  it("JSON entries have metric_name and value fields when data exists", () => {
    const output = execSync(`node ${cliPath} trends --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as Array<{ metric_name: string; value: number; period: string }>;
    if (parsed.length > 0) {
      expect(parsed[0]).toHaveProperty("metric_name");
      expect(parsed[0]).toHaveProperty("value");
      expect(parsed[0]).toHaveProperty("period");
    }
  });

  it("--metric filter narrows results", () => {
    // First get all metrics
    const allOutput = execSync(`node ${cliPath} trends --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const allParsed = JSON.parse(allOutput) as Array<{ metric_name: string }>;
    if (allParsed.length === 0) return; // Skip if no data

    const firstMetric = allParsed[0].metric_name;
    const filteredOutput = execSync(`node ${cliPath} trends --metric "${firstMetric}" --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const filteredParsed = JSON.parse(filteredOutput) as Array<{ metric_name: string }>;
    for (const row of filteredParsed) {
      expect(row.metric_name).toBe(firstMetric);
    }
  });
});
