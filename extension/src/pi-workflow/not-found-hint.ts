/**
 * Not-found / not-a-directory hint wrapper for path-taking tools.
 *
 * Extracted from workspace-info-tool.ts (file-size standard) and extended
 * (v1.53.7 UAT 17/10): not-found errors now include "Did you mean" candidates
 * (see path-suggestion.ts) and `ls`-on-a-file errors explain the read tool.
 * The model self-corrects on its NEXT call — no extra UI, no extra turn.
 */
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { getWorkspaceLayoutText } from './workspace-info-tool.js';
import { suggestExistingPaths } from './path-suggestion.js';

export const NOT_FOUND_PATTERNS = /ENOENT|no such file|not found|does not exist|ENOTDIR|EISDIR/i;
const FILE_NOT_DIR_PATTERNS = /not a directory|illegal operation on a directory/i;

/** First absolute Windows path inside a tool error message, if any. */
export function extractMissingPath(message: string): string | undefined {
  const m = message.match(/[a-zA-Z]:[\\/][^\s'"|,:)\]]+/);
  return m ? m[0] : undefined;
}

/**
 * Hint text for a path-tool error, or undefined when the error is foreign
 * (not path-related) and must be rethrown untouched.
 */
export function buildNotFoundHint(workspaceRoot: string, message: string): string | undefined {
  if (FILE_NOT_DIR_PATTERNS.test(message)) {
    return (
      `${message}\n\n[HINT] That path exists but is NOT a directory — ls can only list folders. ` +
      `Use the read tool to read files; to find neighbors, list the PARENT folder and copy exact names.`
    );
  }
  if (!NOT_FOUND_PATTERNS.test(message)) return undefined;

  const missing = extractMissingPath(message);
  const suggestions = missing ? suggestExistingPaths(workspaceRoot, missing) : [];
  const didYouMean =
    suggestions.length > 0
      ? `\nDid you mean (existing paths, best match first):\n${suggestions.map((s) => `- ${s}`).join('\n')}\n`
      : '\n';
  return (
    `${message}\n\n[HINT] That path does not exist.${didYouMean}` +
    `${getWorkspaceLayoutText(workspaceRoot)}\n` +
    `Re-list the PARENT folder and copy exact names — never guess deeper nested paths.`
  );
}

/**
 * Wrap a path-taking tool so not-found/ENOTDIR failures come back with the
 * real layout and closest existing paths attached.
 */
export function withNotFoundHint<T extends AgentTool>(tool: T, workspaceRoot: string): T {
  const execute = tool.execute;
  const wrapped = async (
    toolCallId: string,
    params: never,
    signal?: AbortSignal,
    onUpdate?: never
  ): Promise<AgentToolResult<unknown>> => {
    try {
      return (await (execute as (...a: unknown[]) => Promise<AgentToolResult<unknown>>)(
        toolCallId,
        params,
        signal,
        onUpdate
      )) as AgentToolResult<unknown>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const hint = buildNotFoundHint(workspaceRoot, message);
      if (hint) throw err instanceof Error ? new Error(hint, { cause: err }) : new Error(hint);
      throw err;
    }
  };
  return { ...tool, execute: wrapped as T['execute'] };
}
