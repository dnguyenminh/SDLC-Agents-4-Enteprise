/**
 * panel-utils.ts — Shared VS Code panel utilities.
 *
 * DRY: Eliminates 3 identical "open file and reveal" blocks in
 * security-panel.ts, impact-panel.ts, and symbol-search.ts.
 */

import * as vscode from "vscode";

/**
 * Open a file in the editor and center the cursor on the given line.
 * @param file - Absolute or workspace-relative path to the file.
 * @param line - 1-based line number (defaults to 1).
 * @throws {Error} if the file cannot be opened.
 */
export async function openFileAndReveal(file: string, line: number = 1): Promise<void> {
  const uri = vscode.Uri.file(file);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  const pos = new vscode.Position(Math.max(0, line - 1), 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}

/**
 * Show a user-facing error message and optionally log the underlying error.
 * @param label   - Human-readable context label (e.g. "Security scan").
 * @param err     - The caught error instance.
 * @param notify  - Whether to call vscode.window.showErrorMessage (default true).
 */
export function showUserError(label: string, err: unknown, notify = true): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[${label}] ${msg}`);
  if (notify) {
    vscode.window.showErrorMessage(`${label} failed: ${msg}`);
  }
}

/**
 * Normalise a raw JSON string from an MCP tool response into an array.
 *
 * Many tools return either:
 *   - a top-level array:   `[...]`
 *   - a keyed object:      `{ results: [...] }` or `{ symbols: [...] }` etc.
 *
 * DRY: Eliminates 6 duplicate normalisation patterns across
 * diagnostics-provider.ts, symbol-search.ts, security-panel.ts,
 * impact-panel.ts, and WrapperServer.ts.
 *
 * @param raw         - Raw JSON string from invokeTool.
 * @param fallbackKey - Object key to look for if top-level is not an array.
 * @returns           - Parsed array (empty array on error or missing data).
 */
export function normalizeResponse<T = unknown>(raw: string, fallbackKey = "results"): T[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as T[];
    if (parsed && typeof parsed === "object") {
      const keyed = (parsed as Record<string, unknown>)[fallbackKey];
      if (Array.isArray(keyed)) return keyed as T[];
      // Try common fallback keys
      for (const k of ["items", "data", "symbols", "issues", "entries"]) {
        const v = (parsed as Record<string, unknown>)[k];
        if (Array.isArray(v)) return v as T[];
      }
    }
    return [];
  } catch (err) {
    // JSON.parse failed — raw is not valid JSON, return empty array (safe degraded value)
    console.debug(`[panel-utils] normalizeResponse parse failed: ${(err as Error).message}`);
    return [];  }
}


