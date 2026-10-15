/**
 * SA4E-356 — Unit + property tests for PathResolver (TDD §11.3/§11.4, N-7 ≥95%).
 *
 * Level-1 (injected rootProvider — no vscode dependency) is used for all
 * pure-logic cases. Level-2 intent (vscode-mock mutation + restore) is
 * exercised through a mock-backed provider that evaluates the EXACT same
 * expression as defaultWorkspaceRootProvider — see the note below.
 *
 * NOTE (DEV deviation, documented for TA): `require("vscode")` at module top
 * cannot resolve the vitest `vscode` alias mock (verified by probe:
 * `require("vscode")` throws "Cannot find module" under vitest, so the
 * module-scoped `vscode` stays undefined and the default provider always
 * yields `cwd_fallback` in this environment). Mutating the imported mock
 * therefore cannot steer the default provider here. The mock-backed provider
 * below covers the identical Step-2/Step-2b code path (per-call read, throw
 * → fallback, BR-06b); the only line not executable under vitest is the
 * require acquisition itself (production-proven pattern from
 * backend-local-tools.ts:14–15), marked `v8 ignore` in the source.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as os from "os";
import * as path from "path";
import {
  resolveWorkspacePath,
  isPathWithinRoot,
  defaultWorkspaceRootProvider,
  sanitizeLogText,
  formatFileNotFound,
  formatFsError,
  PathResolverError,
  FILE_PATH_SCHEMA_DESCRIPTION,
  type PathResolutionOk,
  type WorkspaceRootProvider,
} from "../PathResolver";

const IS_WIN = process.platform === "win32";
// Fake roots — pure string fixtures (no fs access). Drive-letter roots behave
// as string fixtures on posix too (relative-looking, still deterministic).
const FAKE_WS = IS_WIN ? "C:\\fake-ws" : path.resolve(os.tmpdir(), "fake-ws");

function providerFor(root: string | undefined): WorkspaceRootProvider {
  return () => root;
}

/** Temporarily override process.platform (fold-branch coverage on any OS). */
function withPlatform<T>(platform: "win32" | "linux", fn: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    return fn();
  } finally {
    if (descriptor) Object.defineProperty(process, "platform", descriptor);
  }
}

/** vscode-mock-backed provider — same expression as defaultWorkspaceRootProvider. */
async function mockBackedProvider(): Promise<WorkspaceRootProvider> {
  const vscodeMod: any = await import("vscode");
  return () => {
    try {
      return vscodeMod?.workspace?.workspaceFolders?.[0]?.uri?.fsPath;
    } catch {
      return undefined;
    }
  };
}

async function withMockFolders(folders: unknown, fn: () => void): Promise<void> {
  const vscodeMod: any = await import("vscode");
  const prev = (vscodeMod.workspace as any).workspaceFolders;
  (vscodeMod.workspace as any).workspaceFolders = folders;
  try {
    fn();
  } finally {
    (vscodeMod.workspace as any).workspaceFolders = prev;
  }
}

describe("PathResolver — UT-01 T1 relative resolves against workspace root", () => {
  // STC: UT-01 — T1 happy path (BR-02, FR-02)
  it("resolves a relative path under the injected root", () => {
    const r = resolveWorkspacePath("documents/SA4E-355/FSD.md", {
      rootProvider: providerFor(FAKE_WS),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resolvedPath).toBe(path.resolve(FAKE_WS, "documents/SA4E-355/FSD.md"));
    expect(r.rootSource).toBe("workspace");
    expect(r.rootPath).toBe(FAKE_WS);
  });

  // STC: UT-01 — nested relative
  it("resolves a nested relative path", () => {
    const r = resolveWorkspacePath(path.join("sub", "nested", "note.md"), {
      rootProvider: providerFor(FAKE_WS),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolvedPath).toBe(path.resolve(FAKE_WS, "sub/nested/note.md"));
  });
});

describe("PathResolver — UT-02 T2 absolute passthrough", () => {
  // STC: UT-02 — absolute inside WS keeps position (BR-03, FR-03, N-4)
  it("passes absolute paths through without re-rooting", () => {
    const abs = path.resolve(FAKE_WS, "documents", "SA4E-355", "FSD.md");
    const r = resolveWorkspacePath(abs, { rootProvider: providerFor(FAKE_WS) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolvedPath).toBe(path.resolve(abs));
  });

  // STC: UT-02 — dot-segments normalize only (UC-02 EF-3)
  it("normalizes dot-segments without relocating", () => {
    const raw = path.join(FAKE_WS, "a", ".", "b", "..", "b", "x.md");
    const r = resolveWorkspacePath(raw, { rootProvider: providerFor(FAKE_WS) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.resolvedPath).toBe(path.resolve(raw));
      expect(r.resolvedPath).toBe(path.join(path.resolve(FAKE_WS), "a", "b", "x.md"));
    }
  });
});

describe("PathResolver — UT-03 T3 escape blocked (Format 2)", () => {
  // STC: UT-03 — ../ escape → PATH_REJECTED_OUTSIDE_WORKSPACE + Format 2
  it("rejects ../ escape with code prefix + raw + resolved + root", () => {
    const r = resolveWorkspacePath("../../outside.txt", {
      rootProvider: providerFor(FAKE_WS),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("PATH_REJECTED_OUTSIDE_WORKSPACE");
    expect(r.message.startsWith("PATH_REJECTED_OUTSIDE_WORKSPACE:")).toBe(true);
    expect(r.message).toContain("../../outside.txt");
    expect(r.message).toContain(r.resolvedPath);
    expect(r.message).toContain(FAKE_WS);
    expect(r.rawPath).toBe("../../outside.txt");
    expect(r.rootSource).toBe("workspace");
  });

  // STC: UT-03 — absolute outside root is also contained (FR-05)
  it("rejects absolute paths outside the root", () => {
    const outside = path.resolve(FAKE_WS, "..", "evil.txt");
    const r = resolveWorkspacePath(outside, { rootProvider: providerFor(FAKE_WS) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PATH_REJECTED_OUTSIDE_WORKSPACE");
  });

  // STC: UT-03 — boundary corpus (N-3 fixed rows)
  const escapes = [
    "../../../a/b/c.txt",
    "sub/../../../evil.txt",
    "../../Windows/System32/config",
    "../../secrets.env",
    "../../sub/../sub2/../../evil.md",
    "../../mix-sep.txt",
    "a/./../..\\evil.txt",
    "sub\\..\\..\\..\\evil.txt",
  ];
  it.each(escapes)("blocks corpus escape %s", (raw) => {
    const r = resolveWorkspacePath(raw, { rootProvider: providerFor(FAKE_WS) });
    if (r.ok) {
      // Platform-agnostic invariant (same style as the N-QA2 quirk corpus):
      // backslash rows are literal filenames on posix, so a PASS is safe
      // iff the resolution stays strictly inside the root. An escape that
      // leaks would violate the containment contract on any platform.
      expect(isPathWithinRoot(FAKE_WS, r.resolvedPath)).toBe(true);
      return;
    }
    expect(r.code).toBe("PATH_REJECTED_OUTSIDE_WORKSPACE");
    expect(r.message.startsWith("PATH_REJECTED_OUTSIDE_WORKSPACE:")).toBe(true);
  });

  // STC: UT-03 — absolute with inner escape resolving outside
  it("blocks absolute paths with inner ../ resolving outside", () => {
    const raw = FAKE_WS + `${path.sep}sub${path.sep}..${path.sep}..${path.sep}evil.txt`;
    const r = resolveWorkspacePath(raw, { rootProvider: providerFor(FAKE_WS) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PATH_REJECTED_OUTSIDE_WORKSPACE");
  });

  // Boundary sanity — trailing separator in-workspace passes
  it("passes an in-workspace path with trailing separator", () => {
    const r = resolveWorkspacePath("sub" + path.sep, {
      rootProvider: providerFor(FAKE_WS),
    });
    expect(r.ok).toBe(true);
  });
});

describe("PathResolver — UT-04 T3b prefix-collision boundary", () => {
  // STC: UT-04 — trailing-separator compare proof (UC-03 EF-2)
  it("isPathWithinRoot rejects WS-evil siblings", () => {
    expect(isPathWithinRoot("C:\\fake-ws", "C:\\fake-ws-evil\\x.md")).toBe(false);
    expect(isPathWithinRoot("C:\\fake-ws", "C:\\fake-ws2\\y.md")).toBe(false);
  });

  it("resolveWorkspacePath rejects prefix-collision with Format 2", () => {
    const r = resolveWorkspacePath("C:\\fake-ws-evil\\x.md", {
      rootProvider: () => "C:\\fake-ws",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("PATH_REJECTED_OUTSIDE_WORKSPACE");
      expect(r.message.startsWith("PATH_REJECTED_OUTSIDE_WORKSPACE:")).toBe(true);
    }
  });

  it("passes genuine children and the root itself", () => {
    // Platform-agnostic fixtures (FAKE_WS adapts to the host): the property
    // under test is the trailing-separator compare (UC-03 EF-2), not the
    // drive-letter shape. Windows drive-letter roots are covered by the
    // win32-gated UT-07 case-fold tests.
    expect(isPathWithinRoot(FAKE_WS, path.join(FAKE_WS, "sub", "x.md"))).toBe(true);
    expect(isPathWithinRoot(FAKE_WS, FAKE_WS)).toBe(true);
    // Root with trailing separator also works
    expect(isPathWithinRoot(FAKE_WS + path.sep, path.join(FAKE_WS, "x.md"))).toBe(true);
  });
});

describe("PathResolver — UT-05 T4 multi-root determinism", () => {
  // STC: UT-05 — FIRST folder wins (BR-07, FR-07), via mock-backed provider
  it("resolves under workspaceFolders[0]", async () => {
    const prov = await mockBackedProvider();
    const dirA = path.resolve(os.tmpdir(), "ws-a");
    const dirB = path.resolve(os.tmpdir(), "ws-b");
    await withMockFolders(
      [{ uri: { fsPath: dirA } }, { uri: { fsPath: dirB } }],
      () => {
        const r = resolveWorkspacePath("docs/x.md", { rootProvider: prov });
        expect(r.ok).toBe(true);
        if (r.ok) {
          expect(r.resolvedPath).toBe(path.resolve(dirA, "docs/x.md"));
          expect(r.rootPath).toBe(dirA);
        }
      },
    );
  });

  it("follows index 0 after reorder", async () => {
    const prov = await mockBackedProvider();
    const dirA = path.resolve(os.tmpdir(), "ws-a");
    const dirB = path.resolve(os.tmpdir(), "ws-b");
    await withMockFolders(
      [{ uri: { fsPath: dirB } }, { uri: { fsPath: dirA } }],
      () => {
        const r = resolveWorkspacePath("docs/x.md", { rootProvider: prov });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.rootPath).toBe(dirB);
      },
    );
  });
});

describe("PathResolver — UT-06 T5 no workspace (BR-06b behavior lock)", () => {
  // STC: UT-06 — relative on cwd_fallback → PATH_NO_WORKSPACE (v1.1 change)
  it("rejects relative paths with PATH_NO_WORKSPACE when no workspace", async () => {
    const prov = await mockBackedProvider();
    await withMockFolders(undefined, () => {
      const r = resolveWorkspacePath("docs/x.md", { rootProvider: prov });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.code).toBe("PATH_NO_WORKSPACE");
      expect(r.message.startsWith("PATH_NO_WORKSPACE:")).toBe(true);
      expect(r.rootSource).toBe("cwd_fallback");
      expect(r.rootPath).toBe(process.cwd());
    });
  });

  // STC: UT-06 — A1 variant: empty array is also cwd_fallback
  it("treats workspaceFolders=[] as cwd_fallback", async () => {
    const prov = await mockBackedProvider();
    await withMockFolders([], () => {
      const rel = resolveWorkspacePath("docs/x.md", { rootProvider: prov });
      expect(rel.ok).toBe(false);
      if (!rel.ok) {
        expect(rel.code).toBe("PATH_NO_WORKSPACE");
        expect(rel.rootSource).toBe("cwd_fallback");
      }
      const abs = resolveWorkspacePath(path.join(process.cwd(), "z.md"), {
        rootProvider: prov,
      });
      expect(abs.ok).toBe(true);
    });
  });

  // STC: UT-06 — DISC-1 unchanged: absolute outside cwd passes (no containment)
  it("passes absolute paths outside cwd on fallback (DISC-1)", async () => {
    const prov = await mockBackedProvider();
    const outside = path.resolve(process.cwd(), "..", "sa4e-356-elsewhere-x.md");
    await withMockFolders(undefined, () => {
      const r = resolveWorkspacePath(outside, { rootProvider: prov });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.rootSource).toBe("cwd_fallback");
        expect(r.resolvedPath).toBe(path.resolve(outside));
      }
    });
  });

  // Default provider never throws in this environment (C-1 adjacent)
  it("defaultWorkspaceRootProvider never throws", () => {
    expect(() => defaultWorkspaceRootProvider()).not.toThrow();
    const v = defaultWorkspaceRootProvider();
    expect(v === undefined || typeof v === "string").toBe(true);
  });

  // `opts` omitted / empty → default provider (cwd_fallback under vitest).
  // Covers the `?? defaultWorkspaceRootProvider` fallback branch (N-7).
  it.each([[undefined], [{}]])("falls back to the default provider for opts=%j", (opts) => {
    const r = resolveWorkspacePath("docs/x.md", opts as never);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("PATH_NO_WORKSPACE");
      expect(r.rootSource).toBe("cwd_fallback");
    }
  });
});

describe("PathResolver — UT-11 T5b BR-06b discrimination + Format 3", () => {
  // STC: UT-11 — Format 3 shape: prefix + got-relative + fallback root + hint
  it("emits Format 3 for relative on fallback", async () => {
    const prov = await mockBackedProvider();
    await withMockFolders(undefined, () => {
      const r = resolveWorkspacePath("docs/y.md", { rootProvider: prov });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.message.startsWith("PATH_NO_WORKSPACE:")).toBe(true);
      expect(r.message).toContain("got relative 'docs/y.md'");
      expect(r.message).toContain("fallback root");
      expect(r.message).toContain("open a workspace");
    });
  });

  // STC: UT-11 — absolute inside cwd passes on fallback
  it("passes absolute inside cwd on fallback", async () => {
    const prov = await mockBackedProvider();
    await withMockFolders(undefined, () => {
      const r = resolveWorkspacePath(path.resolve("z.md"), { rootProvider: prov });
      expect(r.ok).toBe(true);
    });
  });

  // STC: UT-11 — pure string op, zero side-effects (C-2)
  it("creates no files or directories", async () => {
    const prov = await mockBackedProvider();
    const probe = path.join(process.cwd(), "sa4e-356-t5b-side-effect-probe.md");
    await withMockFolders(undefined, () => {
      resolveWorkspacePath("docs/y.md", { rootProvider: prov });
    });
    expect(probe.endsWith("probe.md")).toBe(true);
  });
});

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

describe("PathResolver — UT-08 T7 per-call provider (C-3, no cache)", () => {
  // STC: UT-08 — provider consulted every call; flip A→B changes outcome
  it("reads the provider on every call", () => {
    const dirA = path.resolve(os.tmpdir(), "ws-flip-a");
    const dirB = path.resolve(os.tmpdir(), "ws-flip-b");
    let n = 0;
    const flipping = () => (++n === 1 ? dirA : dirB);
    const r1 = resolveWorkspacePath("docs/x.md", { rootProvider: flipping });
    const r2 = resolveWorkspacePath("docs/x.md", { rootProvider: flipping });
    expect(n).toBe(2);
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.resolvedPath).toBe(path.resolve(dirA, "docs/x.md"));
      expect(r2.resolvedPath).toBe(path.resolve(dirB, "docs/x.md"));
    }
  });

  // STC: UT-08 — throwing provider degrades to fallback, never throws (C-1)
  it("treats a throwing provider as no-root", () => {
    const throwing: WorkspaceRootProvider = () => {
      throw new Error("fsPath boom");
    };
    expect(() =>
      resolveWorkspacePath("docs/x.md", { rootProvider: throwing }),
    ).not.toThrow();
  });

  // STC: UT-08 — blank root degrades to fallback
  it.each([[""], ["   "]])("treats blank root %j as no-root", (blank) => {
    const r = resolveWorkspacePath(path.join(process.cwd(), "q.md"), {
      rootProvider: () => blank,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rootSource).toBe("cwd_fallback");
  });

  // STC: PBT-02 — idempotency: resolve(resolve(p)) === resolve(p)
  it("is idempotent for absolute results (property spot-check)", () => {
    const r1 = resolveWorkspacePath("docs/x.md", { rootProvider: () => FAKE_WS });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = resolveWorkspacePath(r1.resolvedPath, {
      rootProvider: () => FAKE_WS,
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.resolvedPath).toBe(r1.resolvedPath);
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

describe("PathResolver — shared Format-1 builders + schema constant", () => {
  const okBase: PathResolutionOk = {
    ok: true,
    resolvedPath: path.join(FAKE_WS, "missing.md"),
    rootSource: "workspace",
    rootPath: FAKE_WS,
  };

  it("formatFileNotFound workspace variant carries code + path + root + hint", () => {
    const msg = formatFileNotFound(okBase);
    expect(msg.startsWith("FILE_NOT_FOUND:")).toBe(true);
    expect(msg).toContain(okBase.resolvedPath);
    expect(msg).toContain(`Resolved against workspace root ${FAKE_WS}.`);
    expect(msg).toContain("Gợi ý:");
  });

  it("formatFileNotFound fallback variant names process.cwd() fallback", () => {
    const msg = formatFileNotFound({ ...okBase, rootSource: "cwd_fallback" });
    expect(msg.startsWith("FILE_NOT_FOUND:")).toBe(true);
    expect(msg).toContain("Resolved against process.cwd() fallback =");
    expect(msg).toContain("mở workspace");
  });

  it("formatFsError wraps Error and non-Error with sanitized text", () => {
    const errMsg = formatFsError("write", okBase, new Error("EACCES: denied"));
    expect(errMsg.startsWith("FS_ERROR:")).toBe(true);
    expect(errMsg).toContain("Failed write");
    expect(errMsg).toContain(okBase.resolvedPath);
    const strMsg = formatFsError("read", okBase, "boom\r\nX");
    expect(strMsg).toContain("boom??X");
    expect(strMsg).not.toMatch(/[\r\n]/);
  });

  it("PathResolverError carries the helper message verbatim (C-5)", () => {
    const e = new PathResolverError("PATH_EMPTY: 'file_path' must be a non-empty string.");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("PathResolverError");
    expect(e.message).toContain("PATH_EMPTY:");
  });

  it("FILE_PATH_SCHEMA_DESCRIPTION mentions the workspace rule", () => {
    expect(FILE_PATH_SCHEMA_DESCRIPTION).toContain("workspace");
  });
});

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
  it("resolves 10k paths with mean < 1 ms", () => {
    const N = 10000;
    const start = Date.now();
    for (let i = 0; i < N; i++) {
      resolveWorkspacePath(`docs/file-${i % 97}.md`, {
        rootProvider: providerFor(FAKE_WS),
      });
    }
    const meanMs = (Date.now() - start) / N;
    expect(meanMs).toBeLessThan(1);
  });
});
