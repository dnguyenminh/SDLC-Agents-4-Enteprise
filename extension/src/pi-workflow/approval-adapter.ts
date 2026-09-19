import type { NormalizedToolCall } from './types/executor.types.js';
import { normalizeToolCall } from './utils/tool-normalizer.js';

export interface ToolApprovalGateHandler {
  requestApproval(request: {
    toolUseId: string;
    toolName: string;
    input: Record<string, unknown>;
    agentId?: string;
    ticketKey?: string;
  }): Promise<{ approved: boolean; reason?: string; modifiedInput?: Record<string, unknown> }>;
}

export class ApprovalAdapter {
  constructor(private gateHandler?: ToolApprovalGateHandler) {}

  normalizeToolUseId(rawId: string): string {
    if (!rawId || rawId.trim() === '') {
      return `tu-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }
    return rawId.trim();
  }

  async processToolApproval(
    toolCall: NormalizedToolCall | Record<string, unknown>,
    context?: { agentId?: string; ticketKey?: string }
  ): Promise<{ approved: boolean; normalizedToolCall: NormalizedToolCall; reason?: string }> {
    const normalized = normalizeToolCall(toolCall as any);
    const toolUseId = this.normalizeToolUseId(normalized.id);

    if (!this.gateHandler) {
      return {
        approved: true,
        normalizedToolCall: { ...normalized, id: toolUseId },
        reason: 'Auto-approved (no gate handler)'
      };
    }

    const gateResult = await this.gateHandler.requestApproval({
      toolUseId,
      toolName: normalized.name,
      input: normalized.arguments,
      agentId: context?.agentId,
      ticketKey: context?.ticketKey
    });

    return {
      approved: gateResult.approved,
      normalizedToolCall: {
        id: toolUseId,
        name: normalized.name,
        arguments: gateResult.modifiedInput || normalized.arguments
      },
      reason: gateResult.reason
    };
  }
}
