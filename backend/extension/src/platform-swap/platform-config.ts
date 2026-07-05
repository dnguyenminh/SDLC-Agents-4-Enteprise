/**
 * Static platform definitions — maps each platform to its directories,
 * conversion source paths, and detection signals.
 */

import { PlatformDefinition, PlatformId } from "./types";

/** All supported platform definitions */
export const PLATFORM_DEFINITIONS: ReadonlyArray<PlatformDefinition> = [
  {
    id: "kiro",
    displayName: "Kiro",
    directories: [
      ".kiro/agents/",
      ".kiro/steering/",
      ".kiro/hooks/",
      ".kiro/settings/",
    ],
    conversionPath: ".kiro/",
    detectionSignals: [
      { type: "appName", pattern: "Kiro", priority: 100 },
    ],
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    directories: ["CLAUDE.md", ".claude/"],
    conversionPath: "conversions/claude-code/",
    detectionSignals: [
      { type: "extension", pattern: "anthropic.claude", priority: 80 },
      { type: "appName", pattern: "Cursor", priority: 80 },
      { type: "appName", pattern: "Windsurf", priority: 80 },
    ],
  },
  {
    id: "github-copilot",
    displayName: "GitHub Copilot",
    directories: [
      ".github/copilot-instructions.md",
      ".github/instructions/",
      ".github/agents/",
      ".github/hooks/",
    ],
    conversionPath: "conversions/github-copilot/",
    detectionSignals: [
      { type: "extension", pattern: "github.copilot", priority: 60 },
    ],
  },
  {
    id: "antigravity",
    displayName: "Antigravity",
    directories: ["AGENTS.md", "GEMINI.md", ".agents/", "skills/"],
    conversionPath: "conversions/antigravity/",
    detectionSignals: [
      { type: "envVar", pattern: "GEMINI_API_KEY", priority: 40 },
    ],
  },
];

/** Paths that must NEVER be modified by swap operations */
export const PROTECTED_PATHS: ReadonlyArray<string> = [
  "documents/",
  ".code-intel/",
  "jira.conf",
  "conversions/",
  ".agent-config.json",
  ".agent-config-backup/",
  ".gitignore",
  "backend/",
  "node_modules/",
  ".git/",
];

/** Get definition by platform ID */
export function getPlatformDefinition(
  id: PlatformId,
): PlatformDefinition | undefined {
  return PLATFORM_DEFINITIONS.find((p) => p.id === id);
}

/** Get all platform IDs */
export function getAllPlatformIds(): PlatformId[] {
  return PLATFORM_DEFINITIONS.map((p) => p.id);
}
