/**
 * Skill context resolution for the chat Message Handler (KSA-210).
 * - resolveSkillContext: explicit /skill:<id> mentions
 * - autoResolveSkillContext: description-scoring fallback for plain chat
 * Pure fs-backed helpers — no VS Code API, no side effects beyond reads.
 */

import { debugLog } from "../../debug-logger";

export type SkillContextItem = { type: string; label: string; content: string };

/** Resolve explicitly mentioned /skill:<id> or /<id> contexts from the text. */
export function resolveSkillContext(workspaceRoot: string, text: string): SkillContextItem[] {
  const fs = require("fs");
  const path = require("path");
  const skillDir = path.join(workspaceRoot, ".code-intel", "skills");
  const result: SkillContextItem[] = [];
  if (!fs.existsSync(skillDir)) return result;
  let entries: any[];
  try { entries = fs.readdirSync(skillDir, { withFileTypes: true }); } catch { return result; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const skillFile = path.join(skillDir, id, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("/skill:" + escaped + "\\b|/" + escaped + "\\b", "g");
    if (re.test(text)) {
      try {
        result.push({ type: "skill", label: id, content: fs.readFileSync(skillFile, "utf-8") });
      } catch (e) { /* skill file unreadable — skip */ }
    }
  }
  return result;
}

/** Heuristic: plain conversational input vs command-like input. */
export function isPlainChat(text: string): boolean {
  const t = text.trim();
  if (/^[A-Z]+-\d+\s+/i.test(t)) return false;
  if (/^\/[a-z][-a-z]*\s+/i.test(t)) return false;
  const lc = t.toLowerCase();
  if (lc === "status" || lc === "resume" || lc === "cancel") return false;
  return true;
}

/** Auto-resolve the best-matching skill by scoring descriptions against the text. */
export function autoResolveSkillContext(workspaceRoot: string, text: string): SkillContextItem[] {
  const fs = require("fs");
  const path = require("path");
  const skillDir = path.join(workspaceRoot, ".code-intel", "skills");
  if (!fs.existsSync(skillDir)) return [];
  let entries: any[];
  try { entries = fs.readdirSync(skillDir, { withFileTypes: true }); } catch { return []; }
  const lower = text.toLowerCase();
  const STOP = new Set(["the", "and", "for", "with", "when", "use", "this", "that", "from", "your", "agent", "will", "into", "have", "are", "you", "our", "via", "how", "what", "which", "each", "other", "based", "such", "than", "then", "them", "they", "their", "about", "these", "those", "should", "must", "can", "may", "not", "but", "all", "any", "per", "within", "across", "between", "during", "using", "used", "also", "more", "most", "some", "only", "over", "under", "after", "before"]);
  const scored: Array<{ score: number; item: SkillContextItem }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const skillFile = path.join(skillDir, id, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;
    let content = "";
    try { content = fs.readFileSync(skillFile, "utf-8"); } catch { continue; }
    const m = content.match(/description:\s*["']([^"']+)["']/);
    const description = m ? m[1] : "";
    const tokens = (description + " " + id).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w));
    let score = 0;
    for (const kw of tokens) { if (lower.includes(kw)) score++; }
    if (score >= 2) {
      scored.push({ score, item: { type: "skill", label: id, content } });
    }
  }
  if (scored.length === 0) return [];
  scored.sort((a, b) => b.score - a.score);
  debugLog(` autoResolveSkillContext: best="${scored[0].item.label}" score=${scored[0].score}`);
  return [scored[0].item];
}
