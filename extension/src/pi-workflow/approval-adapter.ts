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
  extensionToPiId(extensionId: string, sessionId?: string): string | undefined;
  getMappingCount(): number;
  clear(): void;
  requestApproval(toolCall: any): Promise<any>;
  handleApproval(decision: 'approve' | 'reject', toolId: string, sessionId?: string): void;
}

type MappingEntry = { piId: string; ticketKey: string; threadId?: string; ts: number; extId?: string };

import { randomUUID } from 'crypto';

export class ApprovalAdapter implements IApprovalAdapter {
  private map = new Map<string, MappingEntry>();
  private forward = new Map<string, { piId: string; sessionId: string }>();
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
    this.forward.set(extId, { piId: piToolUseId, sessionId });
    return extId;
  }

  extensionToPiId(extensionId: string, sessionId?: string): string | undefined {
    const fwd = this.forward.get(extensionId);
    if (!fwd) return undefined;
    const sid = sessionId || fwd.sessionId;
    // Session-scoped: reject cross-session leakage
    if (fwd.sessionId !== sid) return undefined;
    return fwd.piId;
  }

  getMappingCount(): number {
    return this.forward.size;
  }

  clear(): void {
    this.map.clear();
    this.forward.clear();
    this.pending.clear();
    this.decisions.clear();
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

  handleApproval(decision: 'approve' | 'reject', toolId: string, sessionId?: string): void {
    const fwd = this.forward.get(toolId);
    const pending = this.pending.get(toolId);
    const sid = sessionId || fwd?.sessionId || pending?.sessionId || 'default';
    let piId: string | undefined;
    if (fwd || toolId.startsWith('ext_')) {
      piId = this.extensionToPiId(toolId, sid);
      if (!piId) return; // Early return on extensionId session mismatch or invalid extId
    } else {
      piId = toolId;
    }
    this.decisions.set(this.decisionKey(sid, piId), decision);
    if (toolId && this.pending.has(toolId)) {
      this.pending.delete(toolId);
    }
    for (const [extId, p] of Array.from(this.pending.entries())) {
      if (p.piId === piId && p.sessionId === sid) {
        this.pending.delete(extId);
      }
    }
  }

  getThreadIdForTool(toolId: string, sessionId?: string): string | undefined {
    const fwd = this.forward.get(toolId);
    const pending = this.pending.get(toolId);
    const sid = sessionId || fwd?.sessionId || pending?.sessionId || 'default';
    let piId: string | undefined;
    if (fwd || toolId.startsWith('ext_')) {
      piId = this.extensionToPiId(toolId, sid);
      if (!piId) return undefined;
    } else {
      piId = toolId;
    }
    const key = `${sid}:${piId}`;
    const entry = this.map.get(key);
    if (entry?.threadId) return entry.threadId;
    if (pending && pending.sessionId === sid && pending.piId === piId) {
      return pending.threadId;
    }
    return undefined;
  }

  getDecision(toolId: string, sessionId?: string): 'approve' | 'reject' | null {
    const fwd = this.forward.get(toolId);
    const pending = this.pending.get(toolId);
    const sid = sessionId || fwd?.sessionId || pending?.sessionId || 'default';
    let piId: string | undefined;
    if (fwd || toolId.startsWith('ext_')) {
      piId = this.extensionToPiId(toolId, sid);
      if (!piId) return null;
    } else {
      piId = toolId;
    }
    const key = this.decisionKey(sid, piId);
    return this.decisions.get(key) ?? null;
  }

  getPendingApprovals(): Array<{ extensionId: string; piId: string; sessionId: string; ticketKey: string; threadId?: string; ts: number }> {
    return Array.from(this.pending.entries()).map(([extensionId, v]) => ({ extensionId, ...v }));
  }

  resolveApprovalFromUI(extensionId: string, decision: 'approve' | 'reject', sessionId?: string): void {
    const pending = this.pending.get(extensionId);
    if (!pending) return;
    const effectiveSessionId = sessionId || pending.sessionId;
    if (!effectiveSessionId || pending.sessionId !== effectiveSessionId) return;
    const key = this.decisionKey(effectiveSessionId, pending.piId);
    this.decisions.set(key, decision);
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
