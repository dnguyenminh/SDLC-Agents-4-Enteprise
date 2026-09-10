/**
 * SA4E-85 — Knowledge persistence layer (database-agnostic).
 * Internal storage behind KnowledgeService. Uses DatabaseAdapter abstraction
 * to support both SQLite and PostgreSQL. DB perms hardened (Finding #22).
 */

import * as crypto from 'crypto';
import type { QueryDatabaseAdapter } from '../database/adapters/DatabaseAdapter.js';
import { SqliteAdapter } from '../database/adapters/SqliteAdapter.js';
import { KNOWLEDGE_SCHEMA } from './schema.js';
import type {
  Thread, Message, Checkpoint, ToolExecution, Artifact,
  KnowledgeEvent, Agent, PendingWrite, SaveCheckpointInput, MessageInput,
} from './models.js';

import * as path from 'path';
/** Parse JSON safely with fallback. */
function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/**
 * KnowledgeDb — adapter-based persistence for LangGraph thread state.
 * All methods are async to support both SQLite and PostgreSQL engines.
 */
export class KnowledgeDb {
  constructor(private readonly adapter: QueryDatabaseAdapter) {}

  /**
   * Create an in-memory KnowledgeDb for testing.
   * Uses SqliteAdapter in-memory.
   */
  static createInMemory(): KnowledgeDb {
    const adapter = new SqliteAdapter(':memory:');
    adapter.connect();
    adapter.exec(KNOWLEDGE_SCHEMA);
    return new KnowledgeDb(adapter as unknown as QueryDatabaseAdapter);
  }

  /** Detect PostgreSQL via runtime duck-typing (composed adapters expose getEngine). */
  private isPostgres(): boolean {
    const withEngine = (this.adapter as unknown as { getEngine?: () => string });
    return typeof withEngine.getEngine === 'function'
      && (withEngine.getEngine as () => string)() === 'postgresql';
  }

  /** Run schema migration (CREATE IF NOT EXISTS). */
  async migrate(): Promise<void> {
    await this.adapter.execAsync(KNOWLEDGE_SCHEMA);
    // PostgreSQL: events.id has no auto-increment default in the shared DDL
    // (INTEGER PRIMARY KEY auto-increments only in SQLite). Ensure a sequence
    // so concurrent LangGraph put/putWrites compute ids atomically (no MAX() race).
    if (this.isPostgres()) {
      await this.adapter.execAsync(`
        CREATE SEQUENCE IF NOT EXISTS knowledge_events_id_seq;
        SELECT setval('knowledge_events_id_seq', COALESCE((SELECT MAX(id) FROM events), 1));
        ALTER TABLE events ALTER COLUMN id SET DEFAULT nextval('knowledge_events_id_seq');
      `);
    }
  }

  /** No-op for adapter-based lifecycle (adapter manages its own connection). */
  close(): void { /* adapter lifecycle managed externally */ }

  // --- threads ---
  async createThread(t: Thread): Promise<void> {
    await this.adapter.runAsync(
      'INSERT INTO threads (thread_id, workspace_id, title, agent_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [t.thread_id, t.workspace_id, t.title, t.agent_id, t.status, t.created_at, t.updated_at],
    );
  }

  /**
   * Concurrency-safe thread creation for the checkpointer path. LangGraph fires
   * put/putWrites concurrently for the SAME thread_id — both may observe the
   * thread absent and both attempt creation. ON CONFLICT DO NOTHING lets one win;
   * the loser re-reads the winning row. `created` tells the caller whether to
   * append the THREAD_CREATED event (exactly once).
   */
  async ensureThread(t: Thread): Promise<{ created: boolean; thread: Thread }> {
    const now = new Date().toISOString();
    const candidate: Thread = {
      thread_id: t.thread_id,
      workspace_id: t.workspace_id,
      title: t.title ?? 'New thread',
      agent_id: t.agent_id ?? null,
      status: 'active',
      created_at: t.created_at ?? now,
      updated_at: now,
    };
    const result = await this.adapter.runAsync(
      `INSERT INTO threads (thread_id, workspace_id, title, agent_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (thread_id) DO NOTHING`,
      [candidate.thread_id, candidate.workspace_id, candidate.title, candidate.agent_id, candidate.status, candidate.created_at, candidate.updated_at],
    );
    const row = await this.adapter.getAsync<Thread>(
      'SELECT * FROM threads WHERE thread_id = ?', [candidate.thread_id],
    );
    return { created: (result.changes ?? 0) > 0, thread: row as Thread };
  }

  async listThreads(workspaceId: string): Promise<Thread[]> {
    return this.adapter.allAsync<Thread>(
      'SELECT * FROM threads WHERE workspace_id = ? ORDER BY updated_at DESC', [workspaceId],
    );
  }

  async getThread(threadId: string): Promise<Thread | null> {
    const row = await this.adapter.getAsync<Thread>(
      'SELECT * FROM threads WHERE thread_id = ?', [threadId],
    );
    return row ?? null;
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.adapter.transactionAsync(async () => {
      for (const table of ['threads', 'messages', 'checkpoints', 'tool_executions', 'artifacts', 'events']) {
        await this.adapter.runAsync(`DELETE FROM ${table} WHERE thread_id = ?`, [threadId]);
      }
    });
  }

  // --- messages ---
  async appendMessage(workspaceId: string, threadId: string, m: MessageInput, seq: number): Promise<void> {
    const id = m.id ?? crypto.randomUUID();
    const timestamp = m.timestamp ?? new Date().toISOString();
    await this.adapter.runAsync(
      `INSERT INTO messages (id, thread_id, workspace_id, role, content, agent_id, timestamp, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [id, threadId, workspaceId, m.role, m.content, m.agent_id ?? null, timestamp, seq],
    );
  }

  async listMessages(threadId: string): Promise<Message[]> {
    return this.adapter.allAsync<Message>(
      'SELECT * FROM messages WHERE thread_id = ? ORDER BY seq ASC', [threadId],
    );
  }

  async countMessages(threadId: string): Promise<number> {
    const row = await this.adapter.getAsync<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM messages WHERE thread_id = ?', [threadId],
    );
    return row?.cnt ?? 0;
  }

  // --- checkpoints ---
  async getCheckpoint(threadId: string): Promise<Checkpoint | null> {
    const row = await this.adapter.getAsync<Record<string, any>>(
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

  async upsertCheckpoint(workspaceId: string, threadId: string, input: SaveCheckpointInput): Promise<Checkpoint> {
    const existing = await this.getCheckpoint(threadId);
    const version = (existing?.version ?? 0) + 1;
    const writes = [...(existing?.pending_writes ?? []), ...(input.writes ?? input.pendingWrites ?? [])];
    const checkpoint = input.checkpoint ?? existing?.checkpoint ?? null;
    const metadata = input.metadata ?? existing?.metadata ?? {};
    const channelVersions = input.newVersions ?? existing?.channel_versions ?? {};
    const updatedAt = new Date().toISOString();
    await this.adapter.runAsync(
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
  async addToolExecution(exec: ToolExecution): Promise<void> {
    await this.adapter.runAsync(
      'INSERT INTO tool_executions (id, thread_id, workspace_id, tool_id, name, status, input, output, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [exec.id, exec.thread_id, exec.workspace_id, exec.tool_id, exec.name, exec.status, JSON.stringify(exec.input ?? null), JSON.stringify(exec.output ?? null), exec.created_at],
    );
  }

  // --- artifacts ---
  async addArtifact(a: Artifact): Promise<void> {
    await this.adapter.runAsync(
      'INSERT INTO artifacts (id, thread_id, workspace_id, type, name, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [a.id, a.thread_id, a.workspace_id, a.type, a.name, JSON.stringify(a.content ?? null), a.created_at],
    );
  }

  async listArtifacts(threadId: string): Promise<Artifact[]> {
    const rows = await this.adapter.allAsync<Record<string, any>>(
      'SELECT * FROM artifacts WHERE thread_id = ? ORDER BY created_at ASC', [threadId],
    );
    return rows.map((row) => ({ ...row, content: parse(row.content, null) })) as unknown as Artifact[];
  }

  // --- events (append-only log) ---
  async appendEvent(workspaceId: string, threadId: string, type: string, payload: unknown): Promise<void> {
    // id auto-increments on both engines: SQLite rowid for INTEGER PRIMARY KEY,
    // PostgreSQL via knowledge_events_id_seq default (see migrate()).
    await this.adapter.runAsync(
      'INSERT INTO events (thread_id, workspace_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
      [threadId, workspaceId, type, JSON.stringify(payload ?? {}), new Date().toISOString()],
    );
  }

  async listEvents(threadId: string): Promise<KnowledgeEvent[]> {
    const rows = await this.adapter.allAsync<Record<string, any>>(
      'SELECT * FROM events WHERE thread_id = ? ORDER BY id ASC', [threadId],
    );
    return rows.map((row) => ({ ...row, payload: parse(row.payload, null) })) as unknown as KnowledgeEvent[];
  }

  // --- agents (registry) ---
  async upsertAgent(a: Agent): Promise<Agent> {
    await this.adapter.runAsync(
      `INSERT INTO agents (agent_id, name, description, tools, mcp_servers, auto_approve, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (agent_id) DO UPDATE SET
         name = excluded.name, description = excluded.description, tools = excluded.tools,
         mcp_servers = excluded.mcp_servers, auto_approve = excluded.auto_approve, updated_at = excluded.updated_at`,
      [a.agent_id, a.name, a.description, JSON.stringify(a.tools), JSON.stringify(a.mcp_servers), JSON.stringify(a.auto_approve), a.created_at, a.updated_at],
    );
    return a;
  }

  async listAgents(): Promise<Agent[]> {
    const rows = await this.adapter.allAsync<Record<string, any>>(
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
}
