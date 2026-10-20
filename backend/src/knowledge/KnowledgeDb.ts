/**
 * SA4E-85 — Knowledge persistence layer (database-agnostic).
 * Internal storage behind KnowledgeService. Uses DatabaseAdapter abstraction
 * to support both SQLite and PostgreSQL. DB perms hardened (Finding #22).
 * BR-18 facade — thread/message persistence lives in ./KnowledgeDb/thread-store.ts,
 * checkpoint/state persistence in ./KnowledgeDb/state-store.ts.
 */

import type { QueryDatabaseAdapter } from '../database/adapters/DatabaseAdapter.js';
import { SqliteWasmAdapter } from '../database/adapters/wasm/SqliteWasmAdapter.js';
import { KNOWLEDGE_SCHEMA } from './schema.js';
import type {
  Thread, Message, Checkpoint, ToolExecution, Artifact,
  KnowledgeEvent, Agent, PendingWrite, SaveCheckpointInput, MessageInput,
} from './models.js';
import * as threadStore from './KnowledgeDb/thread-store.js';
import * as stateStore from './KnowledgeDb/state-store.js';

/**
 * KnowledgeDb — adapter-based persistence for LangGraph thread state.
 * All methods are async to support both SQLite and PostgreSQL engines.
 */
export class KnowledgeDb {
  constructor(private readonly adapter: QueryDatabaseAdapter) {}

  /**
   * Create an in-memory KnowledgeDb for testing.
   * Uses the wasm SQLite adapter (:memory:) — async because wasm init is async.
   */
  static async createInMemory(): Promise<KnowledgeDb> {
    const adapter = new SqliteWasmAdapter(':memory:');
    await adapter.connect();
    await adapter.execAsync(KNOWLEDGE_SCHEMA);
    return new KnowledgeDb(adapter);
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
  createThread(t: Thread): Promise<void> {
    return threadStore.createThread(this.adapter, t);
  }

  ensureThread(t: Thread): Promise<{ created: boolean; thread: Thread }> {
    return threadStore.ensureThread(this.adapter, t);
  }

  listThreads(workspaceId: string): Promise<Thread[]> {
    return threadStore.listThreads(this.adapter, workspaceId);
  }

  getThread(threadId: string): Promise<Thread | null> {
    return threadStore.getThread(this.adapter, threadId);
  }

  deleteThread(threadId: string): Promise<void> {
    return threadStore.deleteThread(this.adapter, threadId);
  }

  // --- messages ---
  appendMessage(workspaceId: string, threadId: string, m: MessageInput, seq: number): Promise<void> {
    return threadStore.appendMessage(this.adapter, workspaceId, threadId, m, seq);
  }

  listMessages(threadId: string): Promise<Message[]> {
    return threadStore.listMessages(this.adapter, threadId);
  }

  countMessages(threadId: string): Promise<number> {
    return threadStore.countMessages(this.adapter, threadId);
  }

  // --- checkpoints ---
  getCheckpoint(threadId: string): Promise<Checkpoint | null> {
    return stateStore.getCheckpoint(this.adapter, threadId);
  }

  upsertCheckpoint(workspaceId: string, threadId: string, input: SaveCheckpointInput): Promise<Checkpoint> {
    return stateStore.upsertCheckpoint(this.adapter, workspaceId, threadId, input);
  }

  // --- tool executions ---
  addToolExecution(exec: ToolExecution): Promise<void> {
    return stateStore.addToolExecution(this.adapter, exec);
  }

  // --- artifacts ---
  addArtifact(a: Artifact): Promise<void> {
    return stateStore.addArtifact(this.adapter, a);
  }

  listArtifacts(threadId: string): Promise<Artifact[]> {
    return stateStore.listArtifacts(this.adapter, threadId);
  }

  // --- events (append-only log) ---
  appendEvent(workspaceId: string, threadId: string, type: string, payload: unknown): Promise<void> {
    return stateStore.appendEvent(this.adapter, workspaceId, threadId, type, payload);
  }

  listEvents(threadId: string): Promise<KnowledgeEvent[]> {
    return stateStore.listEvents(this.adapter, threadId);
  }

  // --- agents (registry) ---
  upsertAgent(a: Agent): Promise<Agent> {
    return stateStore.upsertAgent(this.adapter, a);
  }

  listAgents(): Promise<Agent[]> {
    return stateStore.listAgents(this.adapter);
  }
}
