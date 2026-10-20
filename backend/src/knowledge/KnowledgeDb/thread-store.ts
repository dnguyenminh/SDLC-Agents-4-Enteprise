/**
 * Thread & message persistence for KnowledgeDb.
 * Extracted from KnowledgeDb (BR-18) — free functions taking the adapter; no behavior change.
 */

import * as crypto from 'crypto';
import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { Thread, Message, MessageInput } from '../models.js';

export async function createThread(adapter: QueryDatabaseAdapter, t: Thread): Promise<void> {
  await adapter.runAsync(
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
export async function ensureThread(
  adapter: QueryDatabaseAdapter, t: Thread,
): Promise<{ created: boolean; thread: Thread }> {
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
  const result = await adapter.runAsync(
    `INSERT INTO threads (thread_id, workspace_id, title, agent_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (thread_id) DO NOTHING`,
    [candidate.thread_id, candidate.workspace_id, candidate.title, candidate.agent_id, candidate.status, candidate.created_at, candidate.updated_at],
  );
  const row = await adapter.getAsync<Thread>(
    'SELECT * FROM threads WHERE thread_id = ?', [candidate.thread_id],
  );
  return { created: (result.changes ?? 0) > 0, thread: row as Thread };
}

export function listThreads(adapter: QueryDatabaseAdapter, workspaceId: string): Promise<Thread[]> {
  return adapter.allAsync<Thread>(
    'SELECT * FROM threads WHERE workspace_id = ? ORDER BY updated_at DESC', [workspaceId],
  );
}

export async function getThread(adapter: QueryDatabaseAdapter, threadId: string): Promise<Thread | null> {
  const row = await adapter.getAsync<Thread>(
    'SELECT * FROM threads WHERE thread_id = ?', [threadId],
  );
  return row ?? null;
}

export async function deleteThread(adapter: QueryDatabaseAdapter, threadId: string): Promise<void> {
  await adapter.transactionAsync(async () => {
    for (const table of ['threads', 'messages', 'checkpoints', 'tool_executions', 'artifacts', 'events']) {
      await adapter.runAsync(`DELETE FROM ${table} WHERE thread_id = ?`, [threadId]);
    }
  });
}

export async function appendMessage(
  adapter: QueryDatabaseAdapter, workspaceId: string, threadId: string, m: MessageInput, seq: number,
): Promise<void> {
  const id = m.id ?? crypto.randomUUID();
  const timestamp = m.timestamp ?? new Date().toISOString();
  await adapter.runAsync(
    `INSERT INTO messages (id, thread_id, workspace_id, role, content, agent_id, timestamp, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
    [id, threadId, workspaceId, m.role, m.content, m.agent_id ?? null, timestamp, seq],
  );
}

export function listMessages(adapter: QueryDatabaseAdapter, threadId: string): Promise<Message[]> {
  return adapter.allAsync<Message>(
    'SELECT * FROM messages WHERE thread_id = ? ORDER BY seq ASC', [threadId],
  );
}

export async function countMessages(adapter: QueryDatabaseAdapter, threadId: string): Promise<number> {
  const row = await adapter.getAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM messages WHERE thread_id = ?', [threadId],
  );
  return row?.cnt ?? 0;
}
