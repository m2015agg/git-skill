import { describe, it, expect } from "vitest";
import { vectorToBuffer, bufferToVector } from "../src/util/embedding.js";
import { hasEmbeddings } from "../src/util/search-hybrid.js";
import { openDb } from "../src/util/db.js";
import { createTempDir, cleanupTempDir } from "./helpers/setup.js";
import { join } from "path";
import { mkdirSync } from "fs";

describe("vector utilities", () => {
  it("vectorToBuffer and bufferToVector roundtrip", () => {
    const original = [0.1, 0.2, 0.3, 0.4, 0.5];
    const buf = vectorToBuffer(original);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(original.length * 4); // Float32 = 4 bytes each

    const recovered = bufferToVector(buf);
    expect(recovered.length).toBe(original.length);
    // Float32 has limited precision, so check with tolerance
    for (let i = 0; i < original.length; i++) {
      expect(recovered[i]).toBeCloseTo(original[i], 5);
    }
  });

  it("handles empty vector", () => {
    const buf = vectorToBuffer([]);
    expect(buf.length).toBe(0);
    expect(bufferToVector(buf)).toEqual([]);
  });
});

describe("hasEmbeddings", () => {
  it("returns false when no embeddings", () => {
    const tmpDir = createTempDir();
    const historyDir = join(tmpDir, ".git-history");
    mkdirSync(historyDir, { recursive: true });
    const db = openDb(historyDir);
    expect(hasEmbeddings(db)).toBe(false);
    db.close();
    cleanupTempDir(tmpDir);
  });

  it("returns true after inserting an embedding", () => {
    const tmpDir = createTempDir();
    const historyDir = join(tmpDir, ".git-history");
    mkdirSync(historyDir, { recursive: true });
    const db = openDb(historyDir);

    const buf = vectorToBuffer([0.1, 0.2, 0.3]);
    db.prepare(
      "INSERT INTO embeddings (commit_hash, content_type, vector, model, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run("abc123", "message", buf, "test-model", new Date().toISOString());

    expect(hasEmbeddings(db)).toBe(true);
    db.close();
    cleanupTempDir(tmpDir);
  });
});
