/**
 * IDE Adapters — Strategy pattern for injecting pre-converted agents into target IDE folder structures.
 *
 * Pre-converted files live in resources/conversions/{ide}/.
 * Each adapter copies the correct pre-built files to the target workspace.
 * NO runtime conversion — files are crafted offline with proper format per IDE.
 *
 * OCP: Use registerAdapter() to add new IDE adapters without editing this file.
 * Built-in adapters are registered at module load time below.
 */

import * as fs from "fs";
import * as path from "path";
import { copyDirRecursive } from "./file-utils";

export type IdeTarget = "kiro" | "vscode" | "claude" | "codex" | "opencode" | "antigravity";

export interface IdeTargetInfo {
  id: IdeTarget;
  label: string;
  description: string;
}

export const IDE_TARGETS: IdeTargetInfo[] = [
  { id: "kiro", label: "Kiro (default)", description: ".kiro/agents/, .kiro/steering/, .kiro/hooks/" },
  { id: "vscode", label: "VSCode (GitHub Copilot)", description: ".github/agents/, .github/copilot-instructions.md" },
  { id: "claude", label: "Claude Code", description: ".claude/agents/, .claude/rules/, CLAUDE.md" },
  { id: "codex", label: "Codex (OpenAI)", description: "AGENTS.md, agents/ subdirectory" },
  { id: "opencode", label: "OpenCode", description: ".opencode/agents/, .opencode/skills/, opencode.json" },
  { id: "antigravity", label: "AntiGravity", description: ".agents/, skills/ (Agentic Coding)" },
];

/** Strategy interface — each IDE adapter knows how to inject pre-converted files. */
export interface IdeAdapter {
  readonly target: IdeTarget;
  inject(root: string, extensionPath: string): boolean;
}

// --- Kiro Adapter (copies .kiro/ resources directly) ---

export class KiroAdapter implements IdeAdapter {
  readonly target: IdeTarget = "kiro";

  inject(root: string, extensionPath: string): boolean {
    const resourcesDir = path.join(extensionPath, "resources", ".kiro");
    if (!fs.existsSync(resourcesDir)) { return false; }
    const targetDir = path.join(root, ".kiro");
    copyDirRecursive(resourcesDir, targetDir);
    return true;
  }
}

// --- Pre-Converted Adapter (shared logic for Claude, Copilot, Codex) ---

class PreConvertedAdapter implements IdeAdapter {
  constructor(readonly target: IdeTarget, private readonly conversionId: string) {}

  inject(root: string, extensionPath: string): boolean {
    const sourceDir = path.join(extensionPath, "resources", "conversions", this.conversionId);
    if (!fs.existsSync(sourceDir)) { return false; }
    copyDirRecursive(sourceDir, root);
    return true;
  }
}

// --- OCP Registry ---

/** Internal registry — keyed by IDE target id. */
const _adapterRegistry = new Map<string, () => IdeAdapter>();

/**
 * Register a factory for a given IDE target id.
 * Call this to add new IDE adapters without modifying this file (OCP).
 * @param id   Unique IDE identifier (e.g. "cursor", "windsurf")
 * @param factory  Factory function that creates the adapter instance
 */
export function registerAdapter(id: string, factory: () => IdeAdapter): void {
  _adapterRegistry.set(id, factory);
}

/**
 * Create an adapter for the given target id.
 * @throws Error if no adapter is registered for the id.
 */
export function createAdapter(id: string): IdeAdapter {
  const factory = _adapterRegistry.get(id);
  if (!factory) {
    throw new Error(`No IDE adapter registered for '${id}'. Available: ${[..._adapterRegistry.keys()].join(", ")}`);
  }
  return factory();
}

/** Return all registered adapter ids. */
export function getRegisteredAdapterIds(): string[] {
  return [..._adapterRegistry.keys()];
}

// --- Register built-in adapters ---
registerAdapter("kiro", () => new KiroAdapter());
registerAdapter("vscode", () => new PreConvertedAdapter("vscode", "github-copilot"));
registerAdapter("claude", () => new PreConvertedAdapter("claude", "claude-code"));
registerAdapter("codex", () => new PreConvertedAdapter("codex", "codex-openai"));
registerAdapter("opencode", () => new PreConvertedAdapter("opencode", "opencode"));
registerAdapter("antigravity", () => new PreConvertedAdapter("antigravity", "antigravity"));
