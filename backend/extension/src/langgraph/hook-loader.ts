/**
 * HookLoader --- KSA-242
 * Reads .kiro/hooks/*.json and *.kiro.hook files at runtime,
 * parses hook definitions, and provides trigger methods for LangGraph nodes.
 */

import * as vscode from "vscode";
import * as path from "path";
import { validateHookSchema, filterHooksByType, filterPreToolUseHooks, filterFileHooks } from "./hook-filters";
export type { HookValidationError } from "./hook-filters";
export { validateHookSchema, filterHooksByType, filterPreToolUseHooks, filterFileHooks } from "./hook-filters";

export interface HookDefinition {
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
  when: HookTrigger;
  then: HookAction;
  filePath: string;
}

export interface HookTrigger {
  type: "promptSubmit" | "agentStop" | "preToolUse" | "postToolUse"
    | "fileEdited" | "fileCreated" | "fileDeleted" | "userTriggered"
    | "preTaskExecution" | "postTaskExecution";
  patterns?: string[];
  toolTypes?: string[];
}

export interface HookAction {
  type: "askAgent" | "runCommand";
  prompt?: string;
  command?: string;
}

/** Cached hooks */
let cachedHooks: HookDefinition[] | null = null;
let hookOutputChannel: vscode.OutputChannel | undefined;

function getHookOutputChannel(): vscode.OutputChannel {
  if (!hookOutputChannel) { hookOutputChannel = vscode.window.createOutputChannel("Kiro SDLC Hooks"); }
  return hookOutputChannel;
}

/**
 * Load all hook definitions from .kiro/hooks/ directory.
 * Validates schema; invalid hooks are skipped with logged errors.
 */
export async function loadHooks(workspaceRoot: string, forceReload = false): Promise<HookDefinition[]> {
  if (cachedHooks && !forceReload) return cachedHooks;
  const hooksDir = path.join(workspaceRoot, ".kiro", "hooks");
  const hooks: HookDefinition[] = [];
  const channel = getHookOutputChannel();
  try {
    const dirUri = vscode.Uri.file(hooksDir);
    const entries = await vscode.workspace.fs.readDirectory(dirUri);
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.File) continue;
      if (!name.endsWith(".json") && !name.endsWith(".kiro.hook")) continue;
      try {
        const filePath = path.join(hooksDir, name);
        const uri = vscode.Uri.file(filePath);
        const bytes = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(bytes).toString("utf-8");
        const parsed = JSON.parse(content);
        const validationErrors = validateHookSchema(parsed, name);
        if (validationErrors.length > 0) {
          for (const err of validationErrors) { channel.appendLine(`[WARN] ${err.file}: ${err.field} --- ${err.message}`); }
          continue;
        }
        const hook: HookDefinition = {
          name: parsed.name, version: parsed.version, description: parsed.description,
          enabled: parsed.enabled !== false, when: parsed.when, then: parsed.then,
          filePath: `.kiro/hooks/${name}`,
        };
        if (hook.enabled) { hooks.push(hook); }
      } catch (err) { channel.appendLine(`[ERROR] Failed to parse ${name}: ${(err as Error).message}`); }
    }
  } catch { /* Hooks directory doesn't exist */ }
  channel.appendLine(`[INFO] Loaded ${hooks.length} valid hooks`);
  cachedHooks = hooks;
  return hooks;
}

export function clearHookCache(): void { cachedHooks = null; }
