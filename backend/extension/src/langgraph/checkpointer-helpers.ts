/**
 * Checkpointer helpers — serialization, cleanup, and sanitization.
 * Extracted from checkpointer.ts.
 */
import * as path from "path";
import * as fs from "fs";
import type { CheckpointMetadata } from "@langchain/langgraph";
import { PersistedPipelineInfo } from "./state";

const SENSITIVE_PATTERNS = [/token/i, /key/i, /secret/i, /password/i, /credential/i];
const MAX_PIPELINES = 10;
const RETENTION_DAYS = 7;

export function sanitizeMetadata(metadata: CheckpointMetadata): CheckpointMetadata {
  if (!metadata || typeof metadata !== "object") { return metadata; }
  const sanitized = structuredClone(metadata) as Record<string, unknown>;
  deepSanitize(sanitized);
  return sanitized as CheckpointMetadata;
}

function deepSanitize(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_PATTERNS.some(p => p.test(key))) { delete obj[key]; }
    else if (obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
      deepSanitize(obj[key] as Record<string, unknown>);
    }
  }
}

export function listPersistedPipelines(stateDir: string): PersistedPipelineInfo[] {
  if (!fs.existsSync(stateDir)) { return []; }
  const pipelines: PersistedPipelineInfo[] = [];
  const files = fs.readdirSync(stateDir).filter(f => f.endsWith(".json") && !f.endsWith(".tmp"));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(stateDir, file), "utf-8"));
      const state = data.state || {};
      pipelines.push({
        threadId: file.replace(".json", ""),
        ticketKey: state.ticketKey || "unknown",
        phase: state.currentPhase || "requirements",
        status: state.pipelineStatus || "idle",
        lastUpdatedAt: data.lastModified || "",
      });
    } catch { /* skip corrupted */ }
  }
  return pipelines.sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt));
}

export function cleanupPipelines(stateDir: string, maxAgeDays: number = RETENTION_DAYS): void {
  if (!fs.existsSync(stateDir)) { return; }
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const tmpCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const allFiles = fs.readdirSync(stateDir);
  for (const file of allFiles) {
    try {
      const filePath = path.join(stateDir, file);
      if (file.endsWith(".tmp")) { if (fs.statSync(filePath).mtimeMs < tmpCutoff) { fs.unlinkSync(filePath); } continue; }
      if (!file.endsWith(".json")) continue;
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const modified = new Date(data.lastModified || 0).getTime();
      if (data.state?.pipelineStatus === "completed" && modified < cutoff) { fs.unlinkSync(filePath); }
    } catch { /* skip */ }
  }
  enforceMaxPipelines(stateDir);
}

function enforceMaxPipelines(stateDir: string): void {
  const pipelines = listPersistedPipelines(stateDir);
  if (pipelines.length <= MAX_PIPELINES) { return; }
  const completed = pipelines.filter(p => p.status === "completed").sort((a, b) => a.lastUpdatedAt.localeCompare(b.lastUpdatedAt));
  let toRemove = pipelines.length - MAX_PIPELINES;
  for (const p of completed) {
    if (toRemove <= 0) break;
    const filePath = path.join(stateDir, `${p.threadId}.json`);
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); toRemove--; }
  }
}
