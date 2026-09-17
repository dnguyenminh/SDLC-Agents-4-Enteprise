export class AdapterError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
  }
}

export interface IApprovalAdapter {
  normalizeId(piToolUseId: string, sessionId: string, ticketKey: string): string;
  extensionToPiId(extensionId: string, sessionId: string): string | undefined;
  getMappingCount(): number;
  clear(): void;
  requestApproval(toolCall: any): Promise<any>;
  handleApproval(decision: 'approve' | 'reject', toolId: string): void;
}

type MappingEntry = { piId: string; ticketKey: string; threadId?: string; ts: number; extId?: string };

import { randomUUID } from 'crypto';

export class ApprovalAdapter implements IApprovalAdapter {
  private map = new Map<string, MappingEntry>();
  private forward = new Map<string, string>();
  private counter = 0;
  private decisions = new Map<string, 'approve' | 'reject'>();

  constructor(private gate?: any) {}

  normalizeId(piToolUseId: string, sessionId: string, ticketKey: string): string {
    if (!piToolUseId) throw new AdapterError('Missing tool_use_id', 'ADAPTER-001');
    if (!sessionId) throw new AdapterError('Invalid session', 'ADAPTER-002');
    const key = `${sessionId}:${piToolUseId}`;
    const existing = this.map.get(key);
    if (existing && existing.extId) return existing.extId;
    const extId = `ext_${randomUUID()}`;
    const entry: MappingEntry = { piId: piToolUseId, ticketKey, ts: Date.now(), extId };
    this.map.set(key, entry);
    this.forward.set(extId, piToolUseId);
    return extId;
  }

  extensionToPiId(extensionId: string, sessionId: string): string | undefined {
    return this.forward.get(extensionId);
  }

  getMappingCount(): number {
    return this.forward.size;
  }

  clear(): void {
    this.map.clear();
    this.forward.clear();
    this.counter = 0;
  }

  async requestApproval(toolCall: any): Promise<any> {
    try {
      const piId = toolCall?.tool_use_id;
      const sessionId = toolCall?.sessionId;
      const ticketKey = toolCall?.ticketKey;
      const threadId = toolCall?.threadId;
      if (!piId) {
        return { error: 'ADAPTER-001', isApproved: false };
      }
      const extId = this.normalizeId(piId, sessionId || 'default', ticketKey || 'unknown');
      const key = `${sessionId || 'default'}:${piId}`;
      const entry = this.map.get(key);
      if (entry) entry.threadId = threadId;
      return { isApproved: false, pending: true, extensionId: extId, piId, threadId };
    } catch (e: any) {
      return { error: e.code || 'ADAPTER-004', isApproved: false };
    }
  }

  // legacy compatibility
  normalizeToolUseId(toolCall: any): string {
    const raw = toolCall?.id ?? toolCall?.tool_use_id ?? toolCall?.toolCallId ?? '';
    return String(raw).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  handleApproval(decision: 'approve' | 'reject', toolId: string): void {
    const normalized = this.normalizeToolUseId({ id: toolId });
    this.decisions.set(normalized, decision);
  }

  getThreadIdForTool(toolId: string, sessionId?: string): string | undefined {
    const key = `${sessionId || 'default'}:${toolId}`;
    return this.map.get(key)?.threadId;
  }

  getDecision(toolId: string): 'approve' | 'reject' | null {
    const normalized = this.normalizeToolUseId({ id: toolId });
    return this.decisions.get(normalized) ?? null;
  }

  requestApprovalLegacy(toolId: string, timeoutMs = 10 * 60 * 1000): void {}
}
