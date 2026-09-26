import { logger } from '../logger';
import { ModelRegistry } from './model-registry';
import { RoutingPolicy } from './routing-policy';
import { ThinkingLevelMapper } from './thinking-level-mapper';

export interface RoutingDiagnostic {
  at: string;
  event: string;
  from?: string;
  to?: string;
  reason: string;
}

export interface RoutableSession {
  modelId: string;
  thinkingLevel?: string;
  config?: Record<string, unknown>;
  escalationCount: number;
  diagnostics: RoutingDiagnostic[];
}

export type EscalationTrigger = 'low-confidence' | 'model-failure';

export class FallbackHandler {
  constructor(
    private readonly registry: ModelRegistry,
    private readonly policy: RoutingPolicy,
    private readonly mapper: ThinkingLevelMapper
  ) {}

  escalate(session: RoutableSession, trigger: EscalationTrigger, reason: string): RoutableSession {
    try {
      const blocked = this.checkEscalationBudget(session, trigger);
      if (blocked) {
        return blocked;
      }
      return this.applyEscalation(session, trigger, reason);
    } catch (err) {
      logger.error('ESCALATE_FAIL - keeping original session', {
        modelId: session.modelId,
        error: (err as Error).message,
      });
      return {
        ...session,
        diagnostics: [
          ...session.diagnostics,
          FallbackHandler.diagnostic(session.modelId, session.modelId, `ESCALATE_FAIL: ${(err as Error).message}`),
        ],
      };
    }
  }

  private checkEscalationBudget(session: RoutableSession, trigger: EscalationTrigger): RoutableSession | undefined {
    const from = session.modelId;
    let blockedReason: string | undefined;
    if (session.escalationCount >= this.policy.maxEscalationsPerSession) {
      blockedReason = 'max escalations reached for session';
    } else if (!this.withinCostCeiling(from, this.policy.escalationModel)) {
      blockedReason = `cost increase exceeds ${this.policy.maxCostIncreaseRatio * 100}% ceiling`;
    }
    if (!blockedReason) {
      return undefined;
    }
    logger.warn('Escalation blocked', { modelId: from, reason: blockedReason });
    return {
      ...session,
      diagnostics: [...session.diagnostics, FallbackHandler.diagnostic(from, from, `${trigger}: ${blockedReason}`)],
    };
  }

  private applyEscalation(session: RoutableSession, trigger: EscalationTrigger, reason: string): RoutableSession {
    const target = this.policy.escalationModel;
    const maxTokens = this.mapper.map(target, session.thinkingLevel);
    const config: Record<string, unknown> = {
      ...session.config,
      model: target,
      maxTokens,
      retry: { maxRetries: this.policy.maxRetries },
    };
    logger.info('Escalated session to large model', {
      from: session.modelId,
      to: target,
      trigger,
      reason,
    });
    return {
      ...session,
      modelId: target,
      config,
      escalationCount: session.escalationCount + 1,
      diagnostics: [
        ...session.diagnostics,
        FallbackHandler.diagnostic(session.modelId, target, `${trigger}: ${reason}`),
      ],
    };
  }

  private withinCostCeiling(from: string, to: string): boolean {
    const fromCost = this.registry.get(from)?.costPer1k ?? 0;
    const toCost = this.registry.get(to)?.costPer1k ?? 0;
    if (fromCost <= 0) {
      return true;
    }
    return toCost <= fromCost * (1 + this.policy.maxCostIncreaseRatio);
  }

  private static diagnostic(from: string, to: string, reason: string): RoutingDiagnostic {
    return { at: new Date().toISOString(), event: 'escalation', from, to, reason };
  }
}
