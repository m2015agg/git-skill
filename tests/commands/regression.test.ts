import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { createTestRepo } from "../fixtures/create-test-repo.js";
import { cleanupTempDir } from "../helpers/setup.js";
import { resolve } from "path";

describe("regression command", () => {
  let repoDir: string;
  const cliPath = resolve("dist/index.js");

  beforeAll(() => {
    repoDir = createTestRepo();
    execSync(`node ${cliPath} snapshot`, { cwd: repoDir });
  });
  afterAll(() => cleanupTempDir(repoDir));

  it("returns some output", () => {
    const output = execSync(`node ${cliPath} regression`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(output.length).toBeGreaterThan(0);
  });

  it("outputs valid JSON", () => {
    const output = execSync(`node ${cliPath} regression --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output);
    expect(parsed).toBeDefined();
  });

  it("JSON has required fields", () => {
    const output = execSync(`node ${cliPath} regression --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as {
      metric: string;
      method: string;
      significant: boolean;
      message: string;
    };
    expect(parsed).toHaveProperty("metric");
    expect(parsed).toHaveProperty("method");
    expect(parsed).toHaveProperty("significant");
    expect(parsed).toHaveProperty("message");
  });

  it("--metric flag changes metric analyzed", () => {
    // First get available metrics
    const trendsOutput = execSync(`node ${cliPath} trends --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const trends = JSON.parse(trendsOutput) as Array<{ metric_name: string }>;
    if (trends.length === 0) return; // Skip if no data

    const firstMetric = trends[0].metric_name;
    const output = execSync(`node ${cliPath} regression --metric "${firstMetric}" --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as { metric: string };
    expect(parsed.metric).toBe(firstMetric);
  });

  it("reports no significant change or finds inflection", () => {
    const output = execSync(`node ${cliPath} regression --json`, {
      cwd: repoDir,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as { message: string; significant: boolean };
    // Either finds change or reports none — both are valid outcomes
    expect(typeof parsed.message).toBe("string");
    expect(typeof parsed.significant).toBe("boolean");
  });
});
