/**
 * SA4E-356 — shared helpers for PathResolver tests (TDD §11.3/§11.4, N-7 ≥95%).
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
 *
 * (Extracted from path-resolver.test.ts when the suite was split by concern;
 * the per-concern test files live in path-resolver*.test.ts siblings.)
 */
import * as os from "os";
import * as path from "path";
import type { WorkspaceRootProvider } from "../PathResolver";

export const IS_WIN = process.platform === "win32";
// Fake roots — pure string fixtures (no fs access). Drive-letter roots behave
// as string fixtures on posix too (relative-looking, still deterministic).
export const FAKE_WS = IS_WIN ? "C:\\fake-ws" : path.resolve(os.tmpdir(), "fake-ws");

export function providerFor(root: string | undefined): WorkspaceRootProvider {
  return () => root;
}

/** Temporarily override process.platform (fold-branch coverage on any OS). */
export function withPlatform<T>(platform: "win32" | "linux", fn: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    return fn();
  } finally {
    if (descriptor) Object.defineProperty(process, "platform", descriptor);
  }
}

/** vscode-mock-backed provider — same expression as defaultWorkspaceRootProvider. */
export async function mockBackedProvider(): Promise<WorkspaceRootProvider> {
  const vscodeMod: any = await import("vscode");
  return () => {
    try {
      return vscodeMod?.workspace?.workspaceFolders?.[0]?.uri?.fsPath;
    } catch {
      return undefined;
    }
  };
}

export async function withMockFolders(folders: unknown, fn: () => void): Promise<void> {
  const vscodeMod: any = await import("vscode");
  const prev = (vscodeMod.workspace as any).workspaceFolders;
  (vscodeMod.workspace as any).workspaceFolders = folders;
  try {
    fn();
  } finally {
    (vscodeMod.workspace as any).workspaceFolders = prev;
  }
}
