/**
 * SA4E-85 — SessionManager (Task 4, v3.1).
 * Stateless session resolution backed by the Backend Knowledge Service.
 * The session thread_id is resolved from Backend KB (multi-IDE hydrate) —
 * the local `.code-intel/.run/session.json` file no longer exists.
 *
 * Flow: ensureSession() → query active thread → reuse, or createThread() in KB.
 */

import type { ISessionManager, SessionData, HydratedMessage } from './ISessionManager';
import { KnowledgeClient, resolveKbBaseUrl, type KbMessage } from '../../knowledge-client';

/**
 * Concrete session manager: resolves thread_id from the Backend KB.
 * Constructor accepts an optional injected KnowledgeClient for testability (DIP).
 */
export class SessionManager implements ISessionManager {
  private session: SessionData | null = null;
  private client: KnowledgeClient;

  /**
   * @param workspaceRoot - Absolute path to workspace root (kept for API compat)
   * @param client - Injected KB client (defaults to resolved backend URL)
   */
  constructor(_workspaceRoot: string, client?: KnowledgeClient) {
    this.client = client ?? new KnowledgeClient(resolveKbBaseUrl());
  }

  /**
   * Swap in a KB client bound to a new backend URL, without an extension
   * reload (SA4E-320). Clears the cached session so the next call re-resolves
   * the thread against the new backend.
   * @param client KnowledgeClient pointing at the new backend URL.
   */
  updateClient(client: KnowledgeClient): void {
    this.client = client;
    this.session = null;
  }

  /**
   * Ensure a session exists. Resolves the most recent active thread from the
   * Backend KB, or creates a new thread if none exists.
   * @returns Session data bound to a Backend KB thread_id
   */
  async ensureSession(): Promise<SessionData> {
    if (this.session) { return this.session; }
    const resolved = await this.resolveSession(true);
    return resolved as SessionData;
  }

  /** @inheritdoc */
  getSession(): SessionData | null {
    return this.session;
  }

  /** @inheritdoc */
  async getSessionMessages(): Promise<{ threadId: string; messages: HydratedMessage[] } | null> {
    const session = this.session ?? (await this.resolveSession(false));
    if (!session) { return null; }
    const messages = await this.client.getMessages(session.thread_id);
    if (!messages) { return null; }
    return { threadId: session.thread_id, messages: messages.map(toHydratedMessage) };
  }

  /**
   * Clean up session cache on extension deactivation.
   * Session state lives in Backend KB — nothing to delete locally.
   */
  async cleanup(): Promise<void> {
    this.session = null;
  }

  /** @inheritdoc */
  dispose(): void {
    this.session = null;
  }

  /** Resolve the session thread from the Backend KB (create if requested). */
  private async resolveSession(createIfMissing: boolean): Promise<SessionData | null> {
    const threads = await this.client.listThreads();
    const active = threads
      .filter(t => t.status === 'active')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (active) {
      this.session = { thread_id: active.thread_id, started_at: active.created_at, ide: 'vscode' };
      return this.session;
    }
    if (!createIfMissing) { return null; }
    const created = await this.client.createThread();
    this.session = { thread_id: created.thread_id, started_at: created.created_at, ide: 'vscode' };
    return this.session;
  }
}

/** Map a Backend KB message to the webview hydration shape. */
function toHydratedMessage(m: KbMessage): HydratedMessage {
  const role = m.role === 'user' || m.role === 'assistant' ? m.role : 'system';
  return {
    id: m.id,
    role,
    content: m.content,
    agentId: m.agent_id ?? undefined,
    timestamp: m.timestamp,
  };
}
