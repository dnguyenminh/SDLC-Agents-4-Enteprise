/**
 * IDE Adapters — Strategy pattern for injecting pre-converted agents into target IDE folder structures.
 *
 * Pre-converted files live in resources/conversions/{ide}/.
 * Each adapter copies the correct pre-built files to the target workspace.
 * NO runtime conversion — files are crafted offline with proper format per IDE.
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

// --- Factory ---

const ADAPTER_MAP: Record<IdeTarget, () => IdeAdapter> = {
  kiro: () => new KiroAdapter(),
  vscode: () => new PreConvertedAdapter("vscode", "github-copilot"),
  claude: () => new PreConvertedAdapter("claude", "claude-code"),
  codex: () => new PreConvertedAdapter("codex", "codex-openai"),
  opencode: () => new PreConvertedAdapter("opencode", "opencode"),
  antigravity: () => new PreConvertedAdapter("antigravity", "antigravity"),
};

export function createAdapter(target: IdeTarget): IdeAdapter {
  return ADAPTER_MAP[target]();
}
