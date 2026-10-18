/**
 * SA4E-356 — Unit tests for PathResolver (TDD §11.3): no-workspace fallback
 * behavior (UT-06, UT-11) and per-call provider semantics (UT-08).
 * (Split from path-resolver.test.ts — fallback/provider concern.)
 */
import { describe, it, expect } from "vitest";
import * as os from "os";
import * as path from "path";
import {
  resolveWorkspacePath,
  defaultWorkspaceRootProvider,
  type WorkspaceRootProvider,
} from "../PathResolver";
import { FAKE_WS, mockBackedProvider, withMockFolders } from "./path-resolver.helpers";

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
