/**
 * SA4E-241 — File checksum strategy tests (Source C/D).
 * IC-C1: GitBlobChecksumStrategy == `git hash-object` (independent vectors).
 * IC-C2: FileContentFallbackStrategy == sha256(path + NUL + content).
 * IC-01: ChecksumStrategyFactory selects impl by (kind, hasGit).
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { GitBlobChecksumStrategy } from "../GitBlobChecksumStrategy";
import { FileContentFallbackStrategy } from "../FileContentFallbackStrategy";
import { ChecksumStrategyFactory } from "../ChecksumStrategyFactory";
import { gitBlobVectors, fallbackVectors } from "./fixtures/loadFixtures";

describe("GitBlobChecksumStrategy — vs git hash-object (IC-C1, TD-2)", () => {
  const strategy = new GitBlobChecksumStrategy("code");
  for (const v of gitBlobVectors()) {
    it(`${v.id}: matches git hash-object`, () => {
      expect(strategy.compute({ relativePath: v.relativePath, content: v.content })).toBe(v.expected);
    });
  }

  it("empty file == git empty blob sanity vector", () => {
    expect(strategy.compute({ relativePath: "x", content: "" }))
      .toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });
});

describe("FileContentFallbackStrategy — sha256(path+NUL+content) (IC-C2)", () => {
  const strategy = new FileContentFallbackStrategy("code");
  for (const v of fallbackVectors()) {
    it(`${v.id}: matches independent sha256 vector`, () => {
      expect(strategy.compute({ relativePath: v.relativePath, content: v.content })).toBe(v.expected);
    });
  }

  it("PBT: path is part of the digest — same content, different path → different checksum", () => {
    fc.assert(fc.property(fc.string(), fc.string(), fc.string(), (content, p1, p2) => {
      fc.pre(p1 !== p2);
      const a = strategy.compute({ relativePath: p1, content });
      const b = strategy.compute({ relativePath: p2, content });
      expect(a).not.toBe(b);
    }));
  });
});

describe("ChecksumStrategyFactory (IC-01, OCP)", () => {
  it("forFile(code, hasGit=true) → GitBlobChecksumStrategy", () => {
    expect(ChecksumStrategyFactory.forFile("code", true)).toBeInstanceOf(GitBlobChecksumStrategy);
  });
  it("forFile(document, hasGit=false) → FileContentFallbackStrategy", () => {
    expect(ChecksumStrategyFactory.forFile("document", false)).toBeInstanceOf(FileContentFallbackStrategy);
  });
  it("forPega() → strategy producing the shared Pega checksum", () => {
    const s = ChecksumStrategyFactory.forPega();
    expect(s.sourceKind).toBe("pega-rule");
    expect(s.compute({ pzInsKey: "R" })).toMatch(/^[0-9a-f]{64}$/);
  });
});
