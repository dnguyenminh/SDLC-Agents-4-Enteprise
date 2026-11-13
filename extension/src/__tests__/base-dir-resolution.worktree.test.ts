/**
 * SA4E-393 Addendum 5 — extension resolver: auto-trust of git worktrees (real
 * `git worktree add` fixtures), allowlist-first, kill switches, UNC guard (OI-WT2),
 * realpath-aware allowlist (WT-IT-23), legacy message byte-compat.
 */
import { afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { resolveWorkspacePath } from "../services/PathResolver";
import { isRootAllowlisted } from "../services/base-dir-resolution";
import { createExtensionTrust, resetDefaultTrust } from "../services/worktree-open-folders";
import { addWorktree, cleanupTmp, makeRepo, makeTmp } from "./worktree-trust/worktree-fixture";

afterAll(cleanupTmp);
const legacy = (b: string): string =>
  `PATH_REJECTED_OUTSIDE_ALLOWLIST: Workspace root '${b}' is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS to include this path.`;

function world() {
  const tmp = makeTmp();
  const repo = makeRepo(tmp, "repo");
  return { tmp, repo, wt: addWorktree(repo, path.join(tmp, "wt"), "bx") };
}

beforeEach(() => resetDefaultTrust());
afterEach(() => { delete process.env.MCP_WORKSPACE_ROOTS; delete process.env.MCP_WORKTREE_AUTOTRUST; resetDefaultTrust(); });

describe("extension auto-trust of worktrees (default singleton, env allowlist)", () => {
  it("accepts a worktree of an allowlisted repo; rootSource stays workspace; BR-07 intact", () => {
    const { repo, wt } = world();
    process.env.MCP_WORKSPACE_ROOTS = repo;
    const r = resolveWorkspacePath("README.md", { baseDir: wt });
    expect(r).toMatchObject({ ok: true, rootSource: "workspace", trustSource: "worktree", rootPath: wt });
    expect(resolveWorkspacePath("../x.txt", { baseDir: wt })).toMatchObject({ ok: false, code: "PATH_REJECTED_OUTSIDE_ALLOWLIST" });
  });

  it("plain dir keeps the byte-identical legacy message; forged pointer exposes only base_dir", () => {
    const { tmp, repo, wt } = world();
    process.env.MCP_WORKSPACE_ROOTS = repo;
    const plain = path.join(tmp, "plain"); fs.mkdirSync(plain);
    expect(resolveWorkspacePath("a", { baseDir: plain })).toMatchObject({ ok: false, message: legacy(plain) });
    const forged = path.join(tmp, "forged"); fs.mkdirSync(forged);
    fs.copyFileSync(path.join(wt, ".git"), path.join(forged, ".git"));
    const r = resolveWorkspacePath("a", { baseDir: forged });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message.startsWith(legacy(forged))).toBe(true);
    expect(r.message).not.toContain(repo);
  });

  it("env kill switch MCP_WORKTREE_AUTOTRUST=0 restores legacy rejection", () => {
    const { repo, wt } = world();
    process.env.MCP_WORKSPACE_ROOTS = repo;
    process.env.MCP_WORKTREE_AUTOTRUST = "0";
    expect(resolveWorkspacePath("README.md", { baseDir: wt })).toMatchObject({ ok: false, message: legacy(wt) });
  });

  it("allowlist hit wins: trust never consulted, trustSource allowlist", () => {
    const { repo } = world();
    process.env.MCP_WORKSPACE_ROOTS = repo;
    const trust = { check: vi.fn() };
    const r = resolveWorkspacePath("README.md", { baseDir: repo, worktreeTrust: trust });
    expect(r).toMatchObject({ ok: true, trustSource: "allowlist" });
    expect(trust.check).not.toHaveBeenCalled();
  });
});

describe("extension trust service (injected settings / open folders)", () => {
  const noRoots = new Set<string>();
  const quiet = { debug() {}, info() {}, warn() {} };

  it("accepts when the parent repo is an open workspace folder (not allowlisted)", () => {
    const { repo, wt } = world();
    const trust = createExtensionTrust({ folders: () => [repo], allowlistRoots: () => [], logger: quiet });
    expect(resolveWorkspacePath("README.md", { baseDir: wt, allowlist: noRoots, worktreeTrust: trust }))
      .toMatchObject({ ok: true, trustSource: "worktree" });
  });

  it("rejects when parent is neither allowlisted nor open", () => {
    const { wt } = world();
    const trust = createExtensionTrust({ folders: () => [], allowlistRoots: () => [], logger: quiet });
    expect(resolveWorkspacePath("README.md", { baseDir: wt, allowlist: noRoots, worktreeTrust: trust }))
      .toMatchObject({ ok: false, code: "PATH_REJECTED_OUTSIDE_ALLOWLIST" });
  });

  it("VS Code setting worktreeAutoTrust=false disables (fail-closed on throwing reader)", () => {
    const { repo, wt } = world();
    const mk = (setting: () => boolean) =>
      createExtensionTrust({ folders: () => [repo], allowlistRoots: () => [], setting, logger: quiet });
    for (const setting of [() => false, () => { throw new Error("boom"); }]) {
      expect(resolveWorkspacePath("a", { baseDir: wt, allowlist: noRoots, worktreeTrust: mk(setting) }))
        .toMatchObject({ ok: false, message: legacy(wt) });
    }
  });
});

describe("OI-WT2 realpath parity + UNC guard", () => {
  it("WT-IT-23: symlinked spelling of an allowlisted root is accepted (realpath)", () => {
    const { tmp, repo } = world();
    const alias = path.join(tmp, "alias");
    fs.symlinkSync(repo, alias, "junction");
    const set = new Set([process.platform === "win32" ? repo.toLowerCase() : repo]);
    expect(isRootAllowlisted(alias, set)).toBe(true);
    expect(isRootAllowlisted(path.join(tmp, "nope"), set)).toBe(false);
  });

  it.skipIf(process.platform !== "win32")("UNC/device base_dir is rejected with legacy text and no fs probing", () => {
    const t0 = Date.now();
    for (const unc of ["\\\\unreachable-host-sa4e393\\share\\wt", "\\\\?\\GLOBALROOT\\Device\\x"]) {
      const r = resolveWorkspacePath("a", { baseDir: unc, allowlist: new Set(["c:\\x"]) });
      expect(r).toMatchObject({ ok: false, code: "PATH_REJECTED_OUTSIDE_ALLOWLIST" });
    }
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
