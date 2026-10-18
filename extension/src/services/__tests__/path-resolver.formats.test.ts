/**
 * SA4E-356 — Unit tests for PathResolver (TDD §11.3): shared Format-1 error
 * builders + the FILE_PATH_SCHEMA_DESCRIPTION constant.
 * (Split from path-resolver.test.ts — error formatting concern.)
 */
import { describe, it, expect } from "vitest";
import * as path from "path";
import {
  formatFileNotFound,
  formatFsError,
  PathResolverError,
  FILE_PATH_SCHEMA_DESCRIPTION,
  type PathResolutionOk,
} from "../PathResolver";
import { FAKE_WS } from "./path-resolver.helpers";

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
