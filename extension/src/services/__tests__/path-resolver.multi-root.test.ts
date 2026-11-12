/**
 * SA4E-406 — multi-root resolution matrix (F1/F2/F3/F5 + A7/A8 resolver level).
 * Mock-backed like path-resolver.test.ts: roots are injected via opts; the
 * existence probe (existingRelativeCandidates) runs against REAL temp dirs.
 * Env (MCP_WORKSPACE_ROOTS / MCP_WORKSPACE_ROOT_PARENTS) steers the A7 trust
 * rule because require("vscode") is unresolvable under vitest (documented in
 * path-resolver.helpers.ts) — the vscode-backed branches degrade to [] here.
 */
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveWorkspacePath } from "../PathResolver";
import { getExtensionWorkspaceRoots, resolveWithBaseDir } from "../base-dir-resolution";
import { existingRelativeCandidates, formatPathNoCandidate, logCandidateResolution } from "../root-candidates";

const BASE = path.join(os.tmpdir(), "sa4e-406-multi-root");
const DIR_A = path.join(BASE, "ws-a"); // first (legacy primary) folder
const DIR_B = path.join(BASE, "ws-b"); // second folder
const OUTSIDE = path.join(BASE, "outside"); // exists under NO root
const PARENT = path.join(BASE, "trusted-parent"); // A7 trusted parent
const UNDER_PARENT = path.join(PARENT, "wt-x"); // A7 admitted via parent
const UNREG = path.join(BASE, "wt-unreg"); // existing dir, under nothing

const LEGACY_MSG = (root: string) =>
  `PATH_REJECTED_OUTSIDE_ALLOWLIST: Workspace root '${root}' ` +
  "is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS to include this path.";

const envBackup = { roots: process.env.MCP_WORKSPACE_ROOTS, parents: process.env.MCP_WORKSPACE_ROOT_PARENTS };

beforeAll(() => {
  for (const dir of [path.join(DIR_A, "docs"), path.join(DIR_B, "docs"), OUTSIDE, UNDER_PARENT, UNREG]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(DIR_B, "docs", "only-b.md"), "b");
  fs.writeFileSync(path.join(DIR_A, "docs", "both.md"), "a");
  fs.writeFileSync(path.join(DIR_B, "docs", "both.md"), "b");
  fs.writeFileSync(path.join(UNDER_PARENT, "doc.md"), "p");
  delete process.env.MCP_WORKSPACE_ROOTS;
  delete process.env.MCP_WORKSPACE_ROOT_PARENTS;
});

afterAll(() => {
  process.env.MCP_WORKSPACE_ROOTS = envBackup.roots;
  process.env.MCP_WORKSPACE_ROOT_PARENTS = envBackup.parents;
  fs.rmSync(BASE, { recursive: true, force: true });
});

afterEach(() => {
  delete process.env.MCP_WORKSPACE_ROOTS;
  delete process.env.MCP_WORKSPACE_ROOT_PARENTS;
  vi.restoreAllMocks();
});

describe("SA4E-406 F2 — existence-driven multi-root pick", () => {
  // F2(1): two folders, file exists only under the second → resolves under second
  it("picks the second folder when the file exists only there", () => {
    const candidates = existingRelativeCandidates("docs/only-b.md", [DIR_A, DIR_B]);
    expect(candidates).toEqual([path.resolve(DIR_B)]);
    const r = resolveWorkspacePath("docs/only-b.md", {
      rootProvider: () => DIR_A, // stale folders[0]
      rootCandidates: () => candidates,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resolvedPath).toBe(path.resolve(DIR_B, "docs/only-b.md"));
    expect(r.rootSource).toBe("workspace_candidate");
    expect(r.rootPath).toBe(path.resolve(DIR_B));
    expect(r.candidateIndex).toBe(0);
  });

  // F2(2): same relative path exists under BOTH → FIRST folder wins
  it("lets the first folder win on ties and records folder[0] in the audit line", () => {
    const candidates = existingRelativeCandidates("docs/both.md", [DIR_A, DIR_B]);
    expect(candidates).toEqual([path.resolve(DIR_A), path.resolve(DIR_B)]);
    const r = resolveWorkspacePath("docs/both.md", { rootProvider: () => DIR_A, rootCandidates: () => candidates });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rootPath).toBe(path.resolve(DIR_A)); // FIRST folder wins (BR-07)
    expect(r.candidateIndex).toBe(0);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logCandidateResolution("mem_ingest_file", r, candidates.length);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(path.resolve(DIR_A));
    expect(String(warn.mock.calls[0][0])).toContain("#0/2");
  });

  // F2(4)/regression: no candidates + no workspace → legacy behaviour unchanged
  it("falls back to legacy workspace pick when nothing was probed", () => {
    const r = resolveWorkspacePath("docs/none.md", { rootProvider: () => DIR_A, rootCandidates: () => [] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rootSource).toBe("workspace"); // legacy label intact
  });

  // F2(5): containment still rejects `..` escapes even with candidates fed
  it("still rejects ../ escapes against every candidate", () => {
    const r = resolveWorkspacePath("../escape.md", {
      rootProvider: () => DIR_A,
      rootCandidates: () => [DIR_A, DIR_B],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PATH_REJECTED_OUTSIDE_WORKSPACE");
  });
});

describe("SA4E-406 A8 — session root first, then folders", () => {
  it("picks the bound session root before existence-probed folders", () => {
    const candidates = existingRelativeCandidates("docs/both.md", [DIR_A, DIR_B]);
    const r = resolveWorkspacePath("docs/both.md", {
      rootProvider: () => DIR_A,
      rootCandidates: () => candidates,
      sessionRoot: DIR_B, // bound at MCP initialize — wins over folders
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rootSource).toBe("session");
    expect(r.rootPath).toBe(path.resolve(DIR_B));
  });

  it("falls through to folder candidates when the session root cannot contain the path", () => {
    // "../ws-a/docs/only-b.md" escapes the session root (DIR_B) but is
    // contained by folder candidate DIR_A → A8 "else next".
    const r = resolveWorkspacePath(path.join("..", "ws-a", "docs", "only-b.md"), {
      rootProvider: () => DIR_A,
      rootCandidates: () => [DIR_A],
      sessionRoot: DIR_B,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rootSource).toBe("workspace_candidate");
      expect(r.rootPath).toBe(path.resolve(DIR_A));
    }
  });

  it("unbound session root ⇒ byte-identical legacy behaviour", () => {
    const r = resolveWorkspacePath("docs/only-b.md", { rootProvider: () => DIR_A });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rootSource).toBe("workspace");
      expect(r.resolvedPath).toBe(path.resolve(DIR_A, "docs/only-b.md"));
    }
  });

  it("formats the F3 not-found error listing all probed roots", () => {
    const msg = formatPathNoCandidate("docs/missing.md", [DIR_A, DIR_B]);
    expect(msg).toContain("PATH_NO_CANDIDATE:");
    expect(msg).toContain("'docs/missing.md' not found under any of 2 candidate roots:");
    expect(msg).toContain(path.resolve(DIR_A));
    expect(msg).toContain("; " + path.resolve(DIR_B));
    expect(msg).toContain("Use base_dir or an absolute path.");
  });
});

describe("SA4E-406 F1/A7 — allowlist union + trust-by-parents", () => {
  // F1(3): base_dir = an OPEN workspace folder → allowed WITHOUT setting/env
  it("admits base_dir pointing at an open workspace folder (live union)", () => {
    const allowlist = getExtensionWorkspaceRoots({ folderRoots: () => [DIR_A] });
    expect(allowlist.has(path.resolve(DIR_A).toLowerCase())).toBe(true);
    const r = resolveWithBaseDir("docs/only-b.md", DIR_A, { allowlist });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolvedPath).toBe(path.resolve(DIR_A, "docs/only-b.md"));
  });

  it("still rejects an unregistered folder with the exact legacy message (no parents)", () => {
    const allowlist = getExtensionWorkspaceRoots({ folderRoots: () => [DIR_A] });
    const r = resolveWithBaseDir("docs/only-b.md", UNREG, { allowlist });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(LEGACY_MSG(path.resolve(UNREG)));
  });

  // A7: base_dir under a CONFIGURED PARENT (not in the static allowlist) → admitted
  it("admits base_dir under a configured trusted parent (env MCP_WORKSPACE_ROOT_PARENTS)", () => {
    process.env.MCP_WORKSPACE_ROOT_PARENTS = PARENT;
    const r = resolveWithBaseDir("doc.md", UNDER_PARENT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolvedPath).toBe(path.resolve(UNDER_PARENT, "doc.md"));
  });

  it("names configured parents in the actionable rejection (legacy prefix preserved)", () => {
    process.env.MCP_WORKSPACE_ROOT_PARENTS = PARENT;
    const r = resolveWithBaseDir("doc.md", UNREG);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message.startsWith(LEGACY_MSG(path.resolve(UNREG)))).toBe(true); // extend, don't break
      expect(r.message).toContain(PARENT);
      expect(r.message).toContain("PATH_REJECTED_OUTSIDE_ALLOWLIST");
    }
  });
});
