import * as crypto from 'crypto';
import { z } from 'zod';
import { KnowledgeClient, resolveKbBaseUrl, isUuidV4 } from '../knowledge-client.js';
import { buildBackendAuthHeaders } from '../utils/backend-auth-headers.js';
import { debugLog, debugError } from '../debug-logger.js';
import type { RemoteCheckpointerStore } from './checkpointer-adapter.js';
import type { PipelineState } from './types/pi-workflow-state.js';

export const PipelineStateSchema = z.object({
  ticketKey: z.string().min(1),
  threadId: z.string().min(1),
  currentPhase: z.string().min(1),
  pipelineStatus: z.string().optional(),
  chatHistory: z.array(z.object({
    role: z.string(),
    content: z.unknown(),
  })).optional(),
  agentOutputs: z.record(z.string(), z.unknown()).optional(),
  errors: z.array(z.object({ code: z.string(), message: z.string() })).optional(),
}).passthrough();

export interface KbRemoteCheckpointerStoreOptions {
  client?: KnowledgeClient;
  workspaceRoot?: string;
  hmacKey?: string;
  getHeaders?: () => Record<string, string>;
}

/**
 * Derives a per-workspace or install-bound secret HMAC key.
 * Prevents anyone with a known threadId from calculating the UUID (anti-IDOR).
 */
export function deriveHmacKey(workspaceRoot?: string): string {
  if (process.env.CHECKPOINT_HMAC_KEY) {
    return process.env.CHECKPOINT_HMAC_KEY;
  }
  const salt = workspaceRoot || process.cwd();
  return crypto.createHash('sha256').update(`sdlc-checkpoint-salt:${salt}`).digest('hex');
}

/**
 * Maps ticket/session thread IDs to a persistent UUID v4 string via HMAC-SHA256.
 * Ensures the thread_id conforms to the Backend KB UUID v4 validation and cannot
 * be inferred without the secret HMAC key.
 */
export function ensureUuidV4(threadId: string, hmacKey: string): string {
  if (isUuidV4(threadId)) {
    return threadId;
  }
  const hmac = crypto.createHmac('sha256', hmacKey).update(threadId).digest('hex');
  return [
    hmac.substring(0, 8),
    hmac.substring(8, 12),
    '4' + hmac.substring(13, 16), // version 4
    ((parseInt(hmac.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hmac.substring(18, 20), // variant
    hmac.substring(20, 32)
  ].join('-');
}

export class KbRemoteCheckpointerStore implements RemoteCheckpointerStore {
  private readonly client: KnowledgeClient;
  private readonly hmacKey: string;

  constructor(options: KbRemoteCheckpointerStoreOptions = {}) {
    this.hmacKey = options.hmacKey || deriveHmacKey(options.workspaceRoot);
    if (options.client) {
      this.client = options.client;
    } else {
      const getHeaders = options.getHeaders || (() => buildBackendAuthHeaders());
      this.client = new KnowledgeClient(resolveKbBaseUrl(), { getHeaders });
    }
  }

  async getCheckpoint(threadId: string): Promise<PipelineState | null> {
    if (!threadId) return null;
    const validThreadId = ensureUuidV4(threadId, this.hmacKey);
    try {
      const kb = await this.client.getCheckpoint(validThreadId);
      if (!kb?.checkpoint) return null;

      const parsed = PipelineStateSchema.safeParse(kb.checkpoint);
      if (!parsed.success) {
        debugError(`[KbRemoteCheckpointerStore] Malformed checkpoint data for ${threadId}`, new Error(parsed.error.message));
        return null;
      }
      return parsed.data as PipelineState;
    } catch (err) {
      debugError(`[KbRemoteCheckpointerStore] getCheckpoint failed for ${threadId}`, err as Error);
      return null;
    }
  }

  async saveCheckpoint(threadId: string, checkpoint: PipelineState): Promise<void> {
    if (!threadId || !checkpoint) return;
    const validThreadId = ensureUuidV4(threadId, this.hmacKey);
    try {
      const messages = Array.isArray(checkpoint.chatHistory)
        ? checkpoint.chatHistory.map((m: any) => ({
            role: m.role || 'user',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
          }))
        : [];

      await this.client.saveCheckpoint(validThreadId, {
        checkpoint: checkpoint as unknown as Record<string, unknown>,
        metadata: {
          ticketKey: checkpoint.ticketKey || '',
          phase: checkpoint.currentPhase || '',
          updatedAt: new Date().toISOString(),
        },
        messages,
      });
      debugLog(`[KbRemoteCheckpointerStore] Checkpoint saved successfully for thread ${threadId}`);
    } catch (err) {
      debugError(`[KbRemoteCheckpointerStore] saveCheckpoint failed for thread ${threadId}`, err as Error);
      throw err;
    }
  }
}
