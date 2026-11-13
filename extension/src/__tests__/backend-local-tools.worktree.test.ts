/**
 * SA4E-393 Addendum 5 — end-to-end through executeLocalTool (stream_write_file /
 * embed_image) with a REAL `git worktree add` base_dir, plus SEC-WT-16 symlink guard.
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { executeLocalTool, checkSymlinkGuard } from "../backend-local-tools";
import type { PathResolutionOk } from "../services/PathResolver";
import { resetDefaultTrust } from "../services/worktree-open-folders";
import { addWorktree, cleanupTmp, makeRepo, makeTmp } from "./worktree-trust/worktree-fixture";

afterAll(cleanupTmp);
afterEach(() => { delete process.env.MCP_WORKSPACE_ROOTS; resetDefaultTrust(); });

function world() {
  const tmp = makeTmp();
  const repo = makeRepo(tmp, "repo");
  const outside = path.join(tmp, "outside");
  fs.mkdirSync(path.join(outside, "sub"), { recursive: true });
  fs.writeFileSync(path.join(outside, "secret.txt"), "top-secret");
  process.env.MCP_WORKSPACE_ROOTS = repo;
  resetDefaultTrust();
  return { tmp, repo, outside, wt: addWorktree(repo, path.join(tmp, "wt"), "bx") };
}
/** Join WITHOUT normalising: path.join would collapse `..` lexically and hide the SEC-WT-16 case. */
const raw = (...parts: string[]): string => parts.join(path.sep);
const ok = (root: string, p: string): PathResolutionOk =>
  ({ ok: true, resolvedPath: p, rootSource: "workspace", rootPath: root });

describe("executeLocalTool with a worktree base_dir", () => {
  it("stream_write_file writes inside an auto-trusted worktree", async () => {
    const { wt } = world();
    const r = await executeLocalTool("stream_write_file", { file_path: "docs/a.md", content: "hi", base_dir: wt });
    expect(r.isError).toBe(false);
    expect(fs.readFileSync(path.join(wt, "docs", "a.md"), "utf8")).toBe("hi");
  });

  it("stream_write_file refuses an untrusted dir and a path escaping the worktree", async () => {
    const { tmp, wt } = world();
    const plain = path.join(tmp, "plain"); fs.mkdirSync(plain);
    const a = await executeLocalTool("stream_write_file", { file_path: "a", content: "x", base_dir: plain });
    expect(a.isError).toBe(true);
    expect(a.content[0].text).toContain("is not registered in the allowlist");
    const b = await executeLocalTool("stream_write_file", { file_path: "../esc.txt", content: "x", base_dir: wt });
    expect(b.isError).toBe(true);
    expect(fs.existsSync(path.join(tmp, "esc.txt"))).toBe(false);
  });

  it("a committed-style symlink dir inside the worktree pointing outside cannot be written through", async () => {
    const { wt, outside } = world();
    fs.symlinkSync(outside, path.join(wt, "link"), "junction");
    const r = await executeLocalTool("stream_write_file", { file_path: "link/pwn.txt", content: "x", base_dir: wt });
    expect(r.isError).toBe(true);
    expect(fs.existsSync(path.join(outside, "pwn.txt"))).toBe(false);
  });
});

describe("SEC-WT-16 checkSymlinkGuard (component-wise realResolve)", () => {
  it("'..' after a symlink hop resolves physically and is rejected when it escapes", () => {
    const { wt, outside } = world();
    fs.symlinkSync(path.join(outside, "sub"), path.join(wt, "link"), "junction");
    // physical: <outside>/sub/.. = <outside>  -> secret.txt is OUTSIDE the worktree
    const msg = checkSymlinkGuard(ok(wt, raw(wt, "link", "..", "secret.txt")), "link/../secret.txt");
    expect(msg).toContain("PATH_REJECTED_OUTSIDE_WORKSPACE");
  });

  it("symlink as FINAL component pointing outside is rejected (parent-only check missed it)", () => {
    const { wt, outside } = world();
    const link = path.join(wt, "final");
    try { fs.symlinkSync(path.join(outside, "secret.txt"), link, "file"); } catch (e: any) {
      if (e?.code === "EPERM") return; // no symlink privilege on this Windows host
      throw e;
    }
    expect(checkSymlinkGuard(ok(wt, link), "final")).toContain("PATH_REJECTED_OUTSIDE_WORKSPACE");
  });

  it("new file inside and '..' that stays inside are accepted; messages for clean paths unchanged", () => {
    const { wt } = world();
    fs.mkdirSync(path.join(wt, "d"));
    expect(checkSymlinkGuard(ok(wt, path.join(wt, "d", "new.txt")), "d/new.txt")).toBeNull();
    expect(checkSymlinkGuard(ok(wt, raw(wt, "d", "..", "README.md")), "d/../README.md")).toBeNull();
  });

  it("cwd_fallback is still skipped entirely", () => {
    const r: PathResolutionOk = { ok: true, resolvedPath: "/x", rootSource: "cwd_fallback", rootPath: "/" };
    expect(checkSymlinkGuard(r, "x")).toBeNull();
  });
});
