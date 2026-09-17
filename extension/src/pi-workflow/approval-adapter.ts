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
  private pending = new Map<string, { piId: string; sessionId: string; ticketKey: string; threadId?: string; ts: number }>();

  constructor(private gate?: any) {}

  private purgeStalePending(maxAgeMs = 30 * 60 * 1000) {
    const now = Date.now();
    for (const [extId, entry] of this.pending.entries()) {
      if (now - entry.ts > maxAgeMs) {
        this.pending.delete(extId);
      }
    }
  }

  private normPiId(piId: string) {
    return this.normalizeToolUseId({ id: piId });
  }

  private decisionKey(sessionId: string, piId: string) {
    return this.normalizeToolUseId({ id: `${sessionId}:${piId}` });
  }

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
    this.purgeStalePending();
    let extId: string | undefined;
    try {
      const piId = toolCall?.tool_use_id;
      const sessionId = toolCall?.sessionId ?? 'default';
      const ticketKey = toolCall?.ticketKey ?? 'unknown';
      const threadId = toolCall?.threadId;
      if (!piId) {
        return { error: 'ADAPTER-001', isApproved: false };
      }
      extId = this.normalizeId(piId, sessionId, ticketKey);
      const key = `${sessionId}:${piId}`;
      const entry = this.map.get(key);
      if (entry) entry.threadId = threadId;
      this.pending.set(extId, { piId, sessionId, ticketKey, threadId, ts: Date.now() });
      const existingDecision = this.getDecision(piId, sessionId);
      if (existingDecision) {
        this.pending.delete(extId);
        return { isApproved: existingDecision === 'approve', pending: false, extensionId: extId, piId, threadId, decision: existingDecision };
      }
      return { isApproved: false, pending: true, extensionId: extId, piId, threadId };
    } catch (e: any) {
      if (extId) this.pending.delete(extId);
      return { error: e.code || 'ADAPTER-004', isApproved: false };
    }
  }

  // legacy compatibility
  normalizeToolUseId(toolCall: any): string {
    const raw = toolCall?.id ?? toolCall?.tool_use_id ?? toolCall?.toolCallId ?? '';
    return String(raw).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  handleApproval(decision: 'approve' | 'reject', toolId: string): void {
    const piId = this.extensionToPiId(toolId) ?? toolId;
    const normalized = this.normPiId(piId);
    this.decisions.set(normalized, decision);
  }

  getThreadIdForTool(toolId: string, sessionId?: string): string | undefined {
    const piId = this.extensionToPiId(toolId) ?? toolId;
    const key = `${sessionId || 'default'}:${piId}`;
    return this.map.get(key)?.threadId;
  }

  getDecision(toolId: string, sessionId?: string): 'approve' | 'reject' | null {
    const piId = this.extensionToPiId(toolId) ?? toolId;
    const key = sessionId ? this.decisionKey(sessionId, piId) : this.normPiId(piId);
    return this.decisions.get(key) ?? this.decisions.get(this.normPiId(piId)) ?? null;
  }

  getPendingApprovals(): Array<{ extensionId: string; piId: string; sessionId: string; ticketKey: string; threadId?: string; ts: number }> {
    return Array.from(this.pending.entries()).map(([extensionId, v]) => ({ extensionId, ...v }));
  }

  resolveApprovalFromUI(extensionId: string, decision: 'approve' | 'reject'): void {
    const pending = this.pending.get(extensionId);
    if (!pending) return;
    const key = this.decisionKey(pending.sessionId, pending.piId);
    const norm = this.normPiId(pending.piId);
    this.decisions.set(key, decision);
    this.decisions.set(norm, decision);
    if (this.gate && typeof this.gate.handleToolApproval === 'function') {
      try { this.gate.handleToolApproval(decision, pending.piId); } catch {}
    }
    this.pending.delete(extensionId);
  }

  getPendingApproval(extensionId: string): { piId: string; sessionId: string; ticketKey: string; threadId?: string } | undefined {
    const p = this.pending.get(extensionId);
    if (!p) return undefined;
    return { piId: p.piId, sessionId: p.sessionId, ticketKey: p.ticketKey, threadId: p.threadId };
  }

  requestApprovalLegacy(toolId: string, timeoutMs = 10 * 60 * 1000): void {}
}
