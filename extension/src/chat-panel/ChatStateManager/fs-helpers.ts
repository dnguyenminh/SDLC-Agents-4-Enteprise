/**
 * ChatStateManager — filesystem helpers for agents / steering / skills info.
 * Pure fs helpers extracted from ChatStateManager; behavior and log strings
 * are preserved exactly.
 */

import { debugLog } from "../../debug-logger";

export interface AgentInfo { id: string; name: string; description: string }
export interface SkillInfo { id: string; label: string; description: string }

/** Extract name + description from agent frontmatter. */
export function parseAgentFrontmatter(content: string, fallbackId: string): AgentInfo {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) { return { id: fallbackId, name: fallbackId, description: "" }; }
  const yaml = match[1];
  const nameMatch = yaml.match(/^(?:label|name):\s*(.+)$/m);
  const descMatch = yaml.match(/^description:\s*(.+)$/m);
  return {
    id: fallbackId,
    name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, "") : fallbackId,
    description: descMatch ? descMatch[1].trim().replace(/^["'>]|["']$/g, "").slice(0, 80) : "",
  };
}

/** Read a steering file and decide whether its frontmatter inclusion is auto-injected. */
export function shouldIncludeSteeringFile(fullPath: string, validInclusions: Set<string>): boolean {
  try {
    const fs = require("fs");
    const content: string = fs.readFileSync(fullPath, "utf-8");
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) { return false; }
    const inclusionMatch = fmMatch[1].match(/^inclusion\s*:\s*["']?(\w+)["']?\s*$/m);
    if (!inclusionMatch) { return false; }
    return validInclusions.has(inclusionMatch[1].toLowerCase());
  } catch (err) {
    console.debug("[ChatStateManager] shouldIncludeSteeringFile failed: " + (err as Error).message);
    return false;
  }
}

/** List steering .md files under dir (recursively) as base-relative POSIX paths. */
export function getSteeringFilesRecursive(dir: string, baseDir: string): string[] {
  const fs = require("fs");
  const path = require("path");
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getSteeringFilesRecursive(fullPath, baseDir));
      } else if (entry.name.endsWith(".md")) {
        results.push(path.relative(baseDir, fullPath).replace(/\\/g, "/"));
      }
    }
  } catch (err) {
    console.debug(`[ChatStateManager] getSteeringFilesRecursive failed (non-fatal): ${(err as Error).message}`);
  }
  return results;
}

/** List agent .md files under dir (recursively) as absolute paths. */
export function getAgentFilesRecursive(dir: string): string[] {
  const fs = require("fs");
  const path = require("path");
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getAgentFilesRecursive(fullPath));
      } else if (entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    console.debug(`[ChatStateManager] getAgentFilesRecursive failed (non-fatal): ${(err as Error).message}`);
  }
  return results;
}

/** Read .code-intel/steering rules (name + file) whose inclusion is auto-injected. */
export function collectSteeringRules(workspaceRoot: string): Array<{ name: string; file: string }> {
  const fs = require("fs");
  const path = require("path");
  const steeringDir = path.join(workspaceRoot, ".code-intel", "steering");
  const rules: Array<{ name: string; file: string }> = [];
  const autoInjectInclusions = new Set(["always", "auto"]);

  if (!fs.existsSync(steeringDir)) { return rules; }

  const files = getSteeringFilesRecursive(steeringDir, steeringDir);
  for (const file of files) {
    if (shouldIncludeSteeringFile(path.join(steeringDir, file), autoInjectInclusions)) {
      const name = path.basename(file, ".md").replace(/-/g, " ");
      rules.push({ name, file });
    }
  }
  return rules;
}

/** Read agent .md files from .code-intel/agents and parse their frontmatter. */
export function readAgentInfos(workspaceRoot: string): AgentInfo[] {
  const fs = require("fs");
  const path = require("path");
  const agentsDir = path.join(workspaceRoot, ".code-intel", "agents");
  if (!fs.existsSync(agentsDir)) { return []; }

  const agents: AgentInfo[] = [];
  const files = fs.readdirSync(agentsDir).filter((f: string) => f.endsWith(".md"));

  for (const file of files) {
    const id = path.basename(file, ".md");
    const filePath = path.join(agentsDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const meta = parseAgentFrontmatter(content, id);
    agents.push({ ...meta, id });
  }
  return agents;
}

/** Read one skill's description from its SKILL.md (empty when absent/unparsable). */
function readSkillDescription(skillFile: string): string {
  const fs = require("fs");
  if (!fs.existsSync(skillFile)) { return ""; }
  const content = fs.readFileSync(skillFile, "utf-8");
  const m = content.match(/description:\s*["']([^"']+)["']/);
  return m ? m[1] : "";
}

/** Read skill descriptions from .code-intel/skills/<id>/SKILL.md. */
export function readSkillInfos(workspaceRoot: string): SkillInfo[] {
  const fs = require("fs");
  const path = require("path");
  const skillsDir = path.join(workspaceRoot, ".code-intel", "skills");
  if (!fs.existsSync(skillsDir)) {
    debugLog("[ChatStateManager] skills dir not found: " + skillsDir);
    return [];
  }
  const skills: SkillInfo[] = [];
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillId = entry.name;
    const description = readSkillDescription(path.join(skillsDir, skillId, "SKILL.md"));
    skills.push({ id: skillId, label: skillId, description });
  }
  return skills;
}
