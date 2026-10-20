/**
 * Checkpoint, tool-execution, artifact, event and agent persistence for KnowledgeDb.
 * Extracted from KnowledgeDb (BR-18) — free functions taking the adapter; no behavior change.
 */

import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type {
  Checkpoint, ToolExecution, Artifact,
  KnowledgeEvent, Agent, PendingWrite, SaveCheckpointInput,
} from '../models.js';

/** Parse JSON safely with fallback. */
export function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export async function getCheckpoint(adapter: QueryDatabaseAdapter, threadId: string): Promise<Checkpoint | null> {
  const row = await adapter.getAsync<Record<string, any>>(
    'SELECT * FROM checkpoints WHERE thread_id = ?', [threadId],
  );
  if (!row) return null;
  return {
    thread_id: row.thread_id,
    workspace_id: row.workspace_id,
    checkpoint: parse(row.checkpoint, null),
    metadata: parse(row.metadata, {}),
    channel_versions: parse(row.channel_versions, {}),
    pending_writes: parse<PendingWrite[]>(row.pending_writes, []),
    version: row.version,
    updated_at: row.updated_at,
  };
}

export async function upsertCheckpoint(
  adapter: QueryDatabaseAdapter, workspaceId: string, threadId: string, input: SaveCheckpointInput,
): Promise<Checkpoint> {
  const existing = await getCheckpoint(adapter, threadId);
  const version = (existing?.version ?? 0) + 1;
  const writes = [...(existing?.pending_writes ?? []), ...(input.writes ?? input.pendingWrites ?? [])];
  const checkpoint = input.checkpoint ?? existing?.checkpoint ?? null;
  const metadata = input.metadata ?? existing?.metadata ?? {};
  const channelVersions = input.newVersions ?? existing?.channel_versions ?? {};
  const updatedAt = new Date().toISOString();
  await adapter.runAsync(
    `INSERT INTO checkpoints (thread_id, workspace_id, checkpoint, metadata, channel_versions, pending_writes, version, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (thread_id) DO UPDATE SET
       checkpoint = excluded.checkpoint, metadata = excluded.metadata,
       channel_versions = excluded.channel_versions, pending_writes = excluded.pending_writes,
       version = excluded.version, updated_at = excluded.updated_at`,
    [threadId, workspaceId, JSON.stringify(checkpoint), JSON.stringify(metadata),
     JSON.stringify(channelVersions), JSON.stringify(writes), version, updatedAt],
  );
  return { thread_id: threadId, workspace_id: workspaceId, checkpoint, metadata, channel_versions: channelVersions, pending_writes: writes, version, updated_at: updatedAt };
}

// --- tool executions ---
export async function addToolExecution(adapter: QueryDatabaseAdapter, exec: ToolExecution): Promise<void> {
  await adapter.runAsync(
    'INSERT INTO tool_executions (id, thread_id, workspace_id, tool_id, name, status, input, output, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [exec.id, exec.thread_id, exec.workspace_id, exec.tool_id, exec.name, exec.status, JSON.stringify(exec.input ?? null), JSON.stringify(exec.output ?? null), exec.created_at],
  );
}

// --- artifacts ---
export async function addArtifact(adapter: QueryDatabaseAdapter, a: Artifact): Promise<void> {
  await adapter.runAsync(
    'INSERT INTO artifacts (id, thread_id, workspace_id, type, name, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [a.id, a.thread_id, a.workspace_id, a.type, a.name, JSON.stringify(a.content ?? null), a.created_at],
  );
}

export async function listArtifacts(adapter: QueryDatabaseAdapter, threadId: string): Promise<Artifact[]> {
  const rows = await adapter.allAsync<Record<string, any>>(
    'SELECT * FROM artifacts WHERE thread_id = ? ORDER BY created_at ASC', [threadId],
  );
  return rows.map((row) => ({ ...row, content: parse(row.content, null) })) as unknown as Artifact[];
}

// --- events (append-only log) ---
export async function appendEvent(
  adapter: QueryDatabaseAdapter, workspaceId: string, threadId: string, type: string, payload: unknown,
): Promise<void> {
  // id auto-increments on both engines: SQLite rowid for INTEGER PRIMARY KEY,
  // PostgreSQL via knowledge_events_id_seq default (see migrate()).
  await adapter.runAsync(
    'INSERT INTO events (thread_id, workspace_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
    [threadId, workspaceId, type, JSON.stringify(payload ?? {}), new Date().toISOString()],
  );
}

export async function listEvents(adapter: QueryDatabaseAdapter, threadId: string): Promise<KnowledgeEvent[]> {
  const rows = await adapter.allAsync<Record<string, any>>(
    'SELECT * FROM events WHERE thread_id = ? ORDER BY id ASC', [threadId],
  );
  return rows.map((row) => ({ ...row, payload: parse(row.payload, null) })) as unknown as KnowledgeEvent[];
}

// --- agents (registry) ---
export async function upsertAgent(adapter: QueryDatabaseAdapter, a: Agent): Promise<Agent> {
  await adapter.runAsync(
    `INSERT INTO agents (agent_id, name, description, tools, mcp_servers, auto_approve, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (agent_id) DO UPDATE SET
       name = excluded.name, description = excluded.description, tools = excluded.tools,
       mcp_servers = excluded.mcp_servers, auto_approve = excluded.auto_approve, updated_at = excluded.updated_at`,
    [a.agent_id, a.name, a.description, JSON.stringify(a.tools), JSON.stringify(a.mcp_servers), JSON.stringify(a.auto_approve), a.created_at, a.updated_at],
  );
  return a;
}

export async function listAgents(adapter: QueryDatabaseAdapter): Promise<Agent[]> {
  const rows = await adapter.allAsync<Record<string, any>>(
    'SELECT * FROM agents ORDER BY name ASC', [],
  );
  return rows.map((row) => ({
    agent_id: row.agent_id,
    name: row.name,
    description: row.description,
    tools: parse<string[]>(row.tools, []),
    mcp_servers: parse<string[]>(row.mcp_servers, []),
    auto_approve: parse<string[]>(row.auto_approve, []),
    created_at: row.created_at,
    updated_at: row.updated_at,
  })) as unknown as Agent[];
}
