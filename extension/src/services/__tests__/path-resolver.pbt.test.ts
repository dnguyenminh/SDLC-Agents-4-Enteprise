/**
 * SA4E-356 — property-based tests for PathResolver (TDD §11.4): PBT-01..04
 * plus the N-1 latency smoke benchmark.
 * (Split from path-resolver.test.ts — property-based concern.)
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as os from "os";
import * as path from "path";
import {
  resolveWorkspacePath,
  isPathWithinRoot,
} from "../PathResolver";
import { IS_WIN, FAKE_WS, providerFor, withPlatform } from "./path-resolver.helpers";

describe("PathResolver — PBT-01 absolute passthrough preserves location", () => {
  // STC: PBT-01 (BR-03, FR-03, UC-02)
  it("resolve(p) === path.resolve(p) for absolute inputs under WS", () => {
    // Generator excludes leading/trailing-whitespace segments: the helper
    // trims input by design (TDD Step 1), so padded inputs are out of contract
    // for the byte-equality oracle (STC arbitraries: separators, dot-segments,
    // trailing slashes, casing — no padded segments).
    const cleanSeg = fc.string({ minLength: 1, maxLength: 12 }).filter(
      // `.` excluded: a dot-segment makes the path escape WS (out of this
      // property's "under WS" domain — escapes are PBT-03's job).
      (s) => !/[/\\.:0]/.test(s) && s.trim() === s,
    );
    fc.assert(
      fc.property(
        fc.array(cleanSeg, {
          minLength: 1,
          maxLength: 5,
        }),
        (segs) => {
          const p = path.join(FAKE_WS, ...segs);
          const r = resolveWorkspacePath(p, { rootProvider: providerFor(FAKE_WS) });
          return r.ok === true && r.resolvedPath === path.resolve(p);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("PathResolver — PBT-02 idempotent + per-call provider", () => {
  // STC: PBT-02 (C-3, UC-01 AF-2)
  it("fixed point + provider consulted on every call", () => {
    // Same whitespace-clean generator rationale as PBT-01 (trim by design).
    const cleanSeg = fc.string({ minLength: 1, maxLength: 8 }).filter(
      // `:` excluded: a `<letter>:` segment makes path.join produce a
      // DRIVE-RELATIVE path (win32 resolves it against the drive's cwd —
      // outside both roots, fail-closed by design; SEC-06 corpus covers it).
      // `.` excluded: dot-segments escape the root (same reason as PBT-01).
      (s) => !/[/\\.:0]/.test(s) && s.trim() === s,
    );
    fc.assert(
      fc.property(
        fc.array(cleanSeg, {
          minLength: 1,
          maxLength: 3,
        }),
        (segs) => {
          const dirA = path.resolve(os.tmpdir(), "pbt-a");
          const dirB = path.resolve(os.tmpdir(), "pbt-b");
          const raw = path.join(...segs) + ".md";
          let calls = 0;
          const prov = () => {
            calls += 1;
            return dirA;
          };
          const r1 = resolveWorkspacePath(raw, { rootProvider: prov });
          if (!r1.ok) return false;
          const r2 = resolveWorkspacePath(r1.resolvedPath, { rootProvider: prov });
          if (!r2.ok || r2.resolvedPath !== r1.resolvedPath) return false;
          const r3 = resolveWorkspacePath(raw, { rootProvider: () => dirB });
          if (!r3.ok || r3.resolvedPath !== path.resolve(dirB, raw)) return false;
          return calls === 2;
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("PathResolver — PBT-03 containment monotonicity (N-3, security)", () => {
  // STC: PBT-03 — inside stays inside
  it("arbitrary nesting under WS resolves ok", () => {
    // Excludes drive-letter-looking segments (`X:...`): on win32 those are
    // drive-relative and resolve against another drive's cwd (fail-closed by
    // containment, but not "inside" — covered by the escape property below).
    const innerSeg = fc.string({ minLength: 1, maxLength: 8 }).filter(
      (s) => !/[/\\.\0]/.test(s) && s !== ".." && s.trim() === s && !/^[A-Za-z]:/.test(s),
    );
    fc.assert(
      fc.property(
        fc.array(innerSeg, {
          minLength: 1,
          maxLength: 6,
        }),
        (segs) => {
          const raw = path.join(...segs) + ".md";
          const r = resolveWorkspacePath(raw, { rootProvider: providerFor(FAKE_WS) });
          return r.ok === true;
        },
      ),
      { numRuns: 200 },
    );
  });

  // STC: PBT-03 — escapes never leak (0 counterexamples or Critical defect)
  it("arbitrary escapes + prefix-collisions never yield ok:true", () => {
    const depth = FAKE_WS.split(path.sep).filter(Boolean).length;
    fc.assert(
      fc.property(
        fc.integer({ min: depth + 1, max: depth + 8 }),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !/[/\\\0]/.test(s)),
        fc.integer({ min: 0, max: 3 }),
        (upCount, name, kind) => {
          // Drive-relative on another drive (win32-only meaningful input:
          // on posix `Z:...` is a literal filename, covered inside instead).
          if (kind === 3 && !IS_WIN) return true;
          let raw: string;
          if (kind === 0) raw = "../".repeat(upCount) + name + ".md";
          else if (kind === 1)
            raw = path.resolve(FAKE_WS, "..", `pbt-outside-${name}.md`);
          else if (kind === 2) raw = FAKE_WS + "-evil" + path.sep + name + ".md";
          else raw = `Z:${name}.md`;
          const r = resolveWorkspacePath(raw, { rootProvider: providerFor(FAKE_WS) });
          if (r.ok) return false;
          return (
            r.code === "PATH_REJECTED_OUTSIDE_WORKSPACE" &&
            r.message.startsWith("PATH_REJECTED_OUTSIDE_WORKSPACE:")
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("PathResolver — PBT-04 case-fold on win32 only", () => {
  // STC: PBT-04 — arbitrary case flips stay contained on win32
  // PLATFORM-GATED (see UT-07 note): win32 case-fold requires a win32 host —
  // path module semantics cannot be mocked via withPlatform.
  it.skipIf(!IS_WIN)("case mutations of a contained path stay contained on win32", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[A-Za-z0-9]+$/.test(s)),
        (name) => {
          const flip = (s: string) =>
            s
              .split("")
              .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
              .join("");
          return withPlatform("win32", () =>
            isPathWithinRoot("c:\\pbt-ws", `C:\\PBT-WS\\${flip(name)}.md`),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  // STC: PBT-04 — posix stays strict
  it("case-differing paths are rejected on posix", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[A-Za-z0-9]+$/.test(s) && s !== s.toLowerCase()),
        (name) =>
          withPlatform("linux", () => !isPathWithinRoot("/pbt-ws", `/PBT-WS/${name}.md`)),
      ),
      { numRuns: 200 },
    );
  });
});

describe("PathResolver — N-1 resolution latency smoke benchmark", () => {
  // NFR N-1: pure string ops — mean resolve must stay far under 1 ms.
  // Generous bound (no flake): documents the property, does not gate tightly.
  it("resolves 10k paths with mean < 10 ms", () => {
    const N = 10000;
    const start = Date.now();
    for (let i = 0; i < N; i++) {
      resolveWorkspacePath(`docs/file-${i % 97}.md`, {
        rootProvider: providerFor(FAKE_WS),
      });
    }
    const meanMs = (Date.now() - start) / N;
    expect(meanMs).toBeLessThan(10);
  });
});
