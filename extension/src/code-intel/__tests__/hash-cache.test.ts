/**
 * Unit tests for HashCache — SHA-256 hashing and dedup semantics.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { HashCache } from "../HashCache";

describe("HashCache", () => {
  let cache: HashCache;

  beforeEach(() => {
    cache = new HashCache();
  });

  it("computes a deterministic 64-char SHA-256 hex digest", () => {
    const hash = HashCache.computeHash("hello world");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(HashCache.computeHash("hello world")).toBe(hash);
  });

  it("computes different hashes for different content", () => {
    expect(HashCache.computeHash("a")).not.toBe(HashCache.computeHash("b"));
  });

  it("starts empty with size 0", () => {
    expect(cache.size).toBe(0);
    expect(cache.get("a.ts")).toBeUndefined();
    expect(cache.has("a.ts")).toBe(false);
  });

  it("stores and retrieves hashes per path", () => {
    cache.set("a.ts", "hash-a");
    cache.set("b.ts", "hash-b");
    expect(cache.get("a.ts")).toBe("hash-a");
    expect(cache.get("b.ts")).toBe("hash-b");
    expect(cache.size).toBe(2);
  });

  it("delete removes a single entry", () => {
    cache.set("a.ts", "hash-a");
    cache.set("b.ts", "hash-b");
    cache.delete("a.ts");
    expect(cache.has("a.ts")).toBe(false);
    expect(cache.has("b.ts")).toBe(true);
    expect(cache.size).toBe(1);
  });

  it("clear empties the cache", () => {
    cache.set("a.ts", "hash-a");
    cache.set("b.ts", "hash-b");
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has("a.ts")).toBe(false);
  });

  it("hasChanged returns true for a never-seen file", () => {
    expect(cache.hasChanged("new.ts", "content")).toBe(true);
  });

  it("hasChanged returns false when content is unchanged", () => {
    cache.updateHash("a.ts", "some content");
    expect(cache.hasChanged("a.ts", "some content")).toBe(false);
  });

  it("hasChanged returns true when content changes", () => {
    cache.updateHash("a.ts", "old");
    expect(cache.hasChanged("a.ts", "new")).toBe(true);
  });

  it("updateHash stores the computed delta checksum and returns it", () => {
    // SA4E-241: the delta checksum now uses the git-blob strategy (default),
    // NOT the legacy static sha256(content). It is a valid sha1 hex (40 chars)
    // and the dedup contract holds.
    const hash = cache.updateHash("a.ts", "content");
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
    expect(cache.get("a.ts")).toBe(hash);
    expect(cache.hasChanged("a.ts", "content")).toBe(false);
  });

  it("SA4E-241: delta checksum is git-blob (matches git hash-object), not plain sha256", () => {
    // Empty content → git empty-blob sha1 (independent sanity vector).
    const hash = cache.updateHash("empty.ts", "");
    expect(hash).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
    expect(hash).not.toBe(HashCache.computeHash(""));
  });
});