/**
 * SA4E-356 — Unit tests for PathResolver (TDD §11.3): platform behavior
 * (UT-07 casing, UT-09 UNC/empty/non-string, UT-12 NUL/CRLF) and the
 * N-QA2 quirk corpus (SEC-06).
 * (Split from path-resolver.test.ts — platform/quirk concern.)
 */
import { describe, it, expect } from "vitest";
import * as os from "os";
import * as path from "path";
import {
  resolveWorkspacePath,
  isPathWithinRoot,
  sanitizeLogText,
} from "../PathResolver";
import { IS_WIN, FAKE_WS, providerFor, withPlatform } from "./path-resolver.helpers";

describe("PathResolver — UT-07 T6 casing (R-1)", () => {
  // STC: UT-07 — win32 fold both sides; posix strict (safe direction, OI-3)
  // PLATFORM-GATED: these verify WIN32 case-insensitive containment. Node's
  // path.normalize/sep follow the REAL host OS (only the fold branch reads
  // process.platform, so withPlatform cannot steer separator semantics) —
  // they are only meaningful on a win32 host.
  it.skipIf(!IS_WIN)("folds case on win32 (no false reject)", () => {
    withPlatform("win32", () => {
      expect(isPathWithinRoot("c:\\fake-ws", "C:\\FAKE-WS\\sub\\file.md")).toBe(true);
      const r = resolveWorkspacePath("C:\\fake-ws\\sub\\file.md", {
        rootProvider: () => "c:\\fake-ws",
      });
      expect(r.ok).toBe(true);
    });
  });

  it.skipIf(!IS_WIN)("folds reversed casing on win32", () => {
    withPlatform("win32", () => {
      expect(isPathWithinRoot("C:\\FAKE-WS", "c:\\fake-ws\\sub\\file.md")).toBe(true);
    });
  });

  it("compares strictly on posix (safe direction)", () => {
    withPlatform("linux", () => {
      expect(isPathWithinRoot("/ws/lower", "/WS/LOWER/x.md")).toBe(false);
      expect(isPathWithinRoot("/ws/same", "/ws/same/x.md")).toBe(true);
    });
  });

  // Current-platform behavior matches the platform rule
  it("applies the host platform rule end-to-end", () => {
    const root = path.resolve(os.tmpdir(), "case-ws");
    const sameCase = path.join(root, "sub", "file.md");
    const r = resolveWorkspacePath(sameCase, { rootProvider: () => root });
    expect(r.ok).toBe(true);
  });
});

describe("PathResolver — UT-09 T8 UNC / empty / non-string (C-1)", () => {
  // STC: UT-09 — UNC outside a drive-letter root is rejected
  it("rejects UNC outside a drive-letter root", () => {
    if (IS_WIN) {
      const r = resolveWorkspacePath("\\\\server\\share\\x.md", {
        rootProvider: () => "C:\\fake-ws",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("PATH_REJECTED_OUTSIDE_WORKSPACE");
    } else {
      // Posix: backslashes are literal filename chars → the UNC-looking input
      // is an ordinary relative path resolving STRICTLY INSIDE a real posix
      // root. (A `C:\`-style root is RELATIVE on posix and would resolve
      // against cwd — use the real FAKE_WS fixture here.)
      const r = resolveWorkspacePath("\\\\server\\share\\x.md", {
        rootProvider: providerFor(FAKE_WS),
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(isPathWithinRoot(FAKE_WS, r.resolvedPath)).toBe(true);
    }
  });

  // STC: UT-09 — empty / whitespace → PATH_EMPTY before resolve
  it.each([[""], ["   "]])("rejects %j with PATH_EMPTY", (raw) => {
    const r = resolveWorkspacePath(raw, { rootProvider: providerFor(FAKE_WS) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("PATH_EMPTY");
      expect(r.message).toBe("PATH_EMPTY: 'file_path' must be a non-empty string.");
    }
  });

  // STC: UT-09 — non-string → PATH_EMPTY, zero exceptions
  it.each([[null], [undefined], [123], [{}]])("rejects %j with PATH_EMPTY", (raw) => {
    expect(() =>
      resolveWorkspacePath(raw, { rootProvider: providerFor(FAKE_WS) }),
    ).not.toThrow();
    const r = resolveWorkspacePath(raw, { rootProvider: providerFor(FAKE_WS) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PATH_EMPTY");
  });
});

describe("PathResolver — UT-12 T8-ext NUL / CRLF (SEC-05)", () => {
  // STC: UT-12 — embedded NUL → PATH_INVALID before resolve
  it("rejects NUL-containing paths with PATH_INVALID", () => {
    const r = resolveWorkspacePath("a\0b", { rootProvider: providerFor(FAKE_WS) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("PATH_INVALID");
    expect(r.message).toBe(
      "PATH_INVALID: 'file_path' contains invalid characters (NUL byte).",
    );
    expect(r.rawPath).not.toContain("\0");
    expect(r.rawPath).toContain("?");
  });

  // STC: UT-12 — NUL-hidden escape never reaches containment/fs
  it("rejects NUL-hidden escapes as PATH_INVALID", () => {
    const r = resolveWorkspacePath("..\0..", { rootProvider: providerFor(FAKE_WS) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PATH_INVALID");
  });

  // STC: UT-12 — CRLF resolves but echoes sanitized
  it("sanitizes CR/LF in failure echoes", () => {
    // Legal-shape CRLF relative resolves under a workspace root...
    const okCase = resolveWorkspacePath("file\r\nINJECTED.txt", {
      rootProvider: providerFor(FAKE_WS),
    });
    expect(okCase.ok).toBe(true);
    // ...but a failing sibling carrying CRLF must not echo raw CR/LF.
    // path.join makes the escape host-correct: `..\..\` on win32, `../../`
    // on posix (a backslash raw string is a literal in-root filename on
    // posix and would NOT be rejected there).
    const bad = resolveWorkspacePath(path.join("..", "..", "evil\r\nX.txt"), {
      rootProvider: providerFor(FAKE_WS),
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.message).not.toMatch(/[\r\n]/);
    expect(sanitizeLogText("a\rb\nc\0d")).toBe("a?b?c?d");
  });
});

describe("PathResolver — N-QA2 quirk corpus (SEC-06, invariant style)", () => {
  // Every quirk input must EITHER fail closed OR resolve strictly inside root.
  // Rationale: single quirks cannot traverse on their own (escape still needs
  // ../ or an outside absolute); path.resolve neutralizes drive-relative and
  // literalizes trailing-dot/8.3 forms inside the root. Fail-closed (reject)
  // and neutralized-pass are both safe; silent escape is the only failure.
  const quirks = [
    "secret.",
    "spaced ..",
    "dir .",
    "PROJEC~1\\file.md",
    "C:foo",
    "C:/fake-ws/sub/x.md",
    "sub\\trailing.",
  ];
  it.each(quirks)("quirk %s never escapes the root", (raw) => {
    const r = resolveWorkspacePath(raw, { rootProvider: providerFor(FAKE_WS) });
    if (r.ok) {
      expect(isPathWithinRoot(FAKE_WS, r.resolvedPath)).toBe(true);
    } else {
      expect(["PATH_REJECTED_OUTSIDE_WORKSPACE", "PATH_INVALID", "PATH_NO_WORKSPACE"]).toContain(
        r.code,
      );
    }
  });

  // STC: boundary-corpus — \\?\ candidate side must not bypass (win32 fail-closed)
  it("extended-prefix candidate stays contained-or-rejected on win32", () => {
    withPlatform("win32", () => {
      const r = resolveWorkspacePath("\\\\?\\C:\\fake-ws\\x.md", {
        rootProvider: () => "C:\\fake-ws",
      });
      // Either rejected (fail-closed) or inside — never an outside pass.
      if (r.ok) {
        expect(isPathWithinRoot("C:\\fake-ws", r.resolvedPath)).toBe(true);
      } else {
        expect(r.code).toBe("PATH_REJECTED_OUTSIDE_WORKSPACE");
      }
    });
  });

  // STC: boundary-corpus — forward-slash absolute outside is blocked
  it("blocks forward-slash absolute outside the root", () => {
    const outside = FAKE_WS + "-other/evil.md";
    const r = resolveWorkspacePath(outside, { rootProvider: providerFor(FAKE_WS) });
    if (path.isAbsolute(outside)) {
      expect(r.ok).toBe(false);
    }
  });
});
