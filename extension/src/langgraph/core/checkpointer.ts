/**
 * WorkspaceCheckpointer — KSA-210
 * Persists LangGraph checkpoint state to workspace JSON files.
 * Cleanup/sanitization logic in checkpointer-helpers.ts.
 */
import * as path from "path";
import * as fs from "fs";
import { BaseCheckpointSaver, Checkpoint, CheckpointMetadata } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import { PersistedPipelineInfo } from "./state";
import { sanitizeMetadata, listPersistedPipelines, cleanupPipelines } from "./checkpointer-helpers";

interface CheckpointTuple { config: RunnableConfig; checkpoint: Checkpoint; metadata?: CheckpointMetadata; parentConfig?: RunnableConfig; }
type ChannelVersions = Record<string, number | string>;
type PendingWrite = [string, unknown];

export class WorkspaceCheckpointer extends BaseCheckpointSaver {
  private readonly stateDir: string;
  constructor(workspaceRoot: string) { super(); this.stateDir = path.join(workspaceRoot, ".vscode", "kiro-pipeline-state"); }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string | undefined;
    if (!threadId) { return undefined; }
    const filePath = path.join(this.stateDir, `${threadId}.json`);
    if (!fs.existsSync(filePath)) { return undefined; }
    try { const data = JSON.parse(fs.readFileSync(filePath, "utf-8")); return { config, checkpoint: data.graphCheckpoint, metadata: data.state || {} }; }
    catch { return undefined; }
  }

  async put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, _newVersions: ChannelVersions): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id as string | undefined;
    if (!threadId) { throw new Error("thread_id required"); }
    this.ensureDir();
    const filePath = path.join(this.stateDir, `${threadId}.json`);
    const tmpPath = filePath + ".tmp";
    let createdAt = new Date().toISOString();
    if (fs.existsSync(filePath)) { try { createdAt = JSON.parse(fs.readFileSync(filePath, "utf-8")).createdAt || createdAt; } catch { } }
    const data = { version: 1, schemaVersion: "1.0.0", graphCheckpoint: checkpoint, state: sanitizeMetadata(metadata), createdAt, lastModified: new Date().toISOString() };
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmpPath, filePath);
    return config;
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], _taskId: string): Promise<void> {
    const threadId = config.configurable?.thread_id as string | undefined;
    if (!threadId) { return; }
    const filePath = path.join(this.stateDir, `${threadId}.json`);
    if (!fs.existsSync(filePath)) { return; }
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (!data.pendingWrites) { data.pendingWrites = []; }
      data.pendingWrites.push(...writes);
      data.lastModified = new Date().toISOString();
      const tmpPath = filePath + ".tmp";
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
      fs.renameSync(tmpPath, filePath);
    } catch { /* non-critical */ }
  }

  async *list(config: RunnableConfig, _options?: { limit?: number; before?: RunnableConfig; filter?: Record<string, unknown> }): AsyncGenerator<CheckpointTuple> {
    if (!fs.existsSync(this.stateDir)) { return; }
    const files = fs.readdirSync(this.stateDir).filter(f => f.endsWith(".json") && !f.endsWith(".tmp"));
    for (const file of files) {
      try { const data = JSON.parse(fs.readFileSync(path.join(this.stateDir, file), "utf-8")); yield { config: { configurable: { thread_id: file.replace(".json", "") } }, checkpoint: data.graphCheckpoint, metadata: data.state || {} }; }
      catch { /* skip */ }
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    if (!threadId) { return; }
    const fp = path.join(this.stateDir, `${threadId}.json`);
    if (fs.existsSync(fp)) { fs.unlinkSync(fp); }
  }

  async delete(config: RunnableConfig): Promise<void> {
    const threadId = config.configurable?.thread_id as string | undefined;
    if (threadId) { return this.deleteThread(threadId); }
  }

  listPersistedPipelines(): PersistedPipelineInfo[] { return listPersistedPipelines(this.stateDir); }
  cleanup(maxAgeDays?: number): void { cleanupPipelines(this.stateDir, maxAgeDays); }
  private ensureDir(): void { if (!fs.existsSync(this.stateDir)) { fs.mkdirSync(this.stateDir, { recursive: true }); } }
}
