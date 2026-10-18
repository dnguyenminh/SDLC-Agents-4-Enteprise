/**
 * SA4E-356 — Unit tests for PathResolver (TDD §11.3): UT-01..UT-05.
 * (Split from path-resolver.test.ts — resolution + containment concern.)
 */
import { describe, it, expect } from "vitest";
import * as os from "os";
import * as path from "path";
import {
  resolveWorkspacePath,
  isPathWithinRoot,
} from "../PathResolver";
import { FAKE_WS, providerFor, mockBackedProvider, withMockFolders } from "./path-resolver.helpers";

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
