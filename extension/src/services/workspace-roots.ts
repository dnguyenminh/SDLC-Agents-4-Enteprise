/**
 * Workspace-root accessors (SA4E-406 F2 seam).
 * Extracted from PathResolver.ts to keep the 200-line budget. The vscode
 * lazy-require is the production-proven pattern (backend-local-tools.ts:14–15).
 *
 * NOTE (documented probe, SA4E-356): `require("vscode")` cannot resolve the
 * vitest `vscode` alias mock, so outside the extension host every reader here
 * degrades to undefined/[] and callers fall back (cwd_fallback / injected
 * providers). The selection LOGIC this feeds is covered via mock-backed
 * providers in path-resolver*.test.ts; the require lines are `v8 ignore`.
 */
/* v8 ignore start */
let vscode: any;
try {
  vscode = require("vscode");
} catch {
  /* stay undefined — fallback cwd */
}

/** Primary workspace folder AT CALL TIME — never cached (UC-01 AF-2). */
export function defaultWorkspaceRootProvider(): string | undefined {
  try {
    return vscode?.workspace?.workspaceFolders?.[0]?.uri?.fsPath; // per-call, no cache
  } catch {
    return undefined; // UC-05 EF-2
  }
}

/**
 * ALL open workspace folders' fsPaths, in VS Code order, read PER CALL
 * (SA4E-406 F1/F2 — the live folders are allowlist members and candidate
 * roots; never cached so window changes apply immediately).
 */
export function allWorkspaceFolderRoots(): string[] {
  try {
    const folders = vscode?.workspace?.workspaceFolders;
    if (!Array.isArray(folders)) return [];
    const out: string[] = [];
    for (const folder of folders) {
      const fsPath = folder?.uri?.fsPath;
      if (typeof fsPath === "string" && fsPath.trim() !== "") out.push(fsPath);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Root + origin selection for the legacy single-root flow (BR-02, BR-06).
 * Provider is consulted per call; a throwing/blank provider degrades to the
 * process.cwd() fallback (BR-06) — NEVER throws (C-1).
 */
export function selectWorkspaceRoot(
  rootProvider: (() => string | undefined) | undefined,
): { rootPath: string; rootSource: "workspace" | "cwd_fallback" } {
  let rootPath: string | undefined;
  try {
    rootPath = (rootProvider ?? defaultWorkspaceRootProvider)();
  } catch {
    rootPath = undefined; // UC-08 — throwing provider degrades to fallback
  }
  if (rootPath && rootPath.trim() !== "") return { rootPath, rootSource: "workspace" };
  return { rootPath: process.cwd(), rootSource: "cwd_fallback" }; // BR-06 fallback
}
/* v8 ignore stop */
