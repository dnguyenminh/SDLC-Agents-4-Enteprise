import { logger } from '../logger';
import { ModelRegistry } from './model-registry';
import { ConfidenceScorer } from './confidence-scorer';
import { RoutingPolicy } from './routing-policy';

export type ModelTier = 'small' | 'large';

export const SMALL_CONTEXT_WINDOW_THRESHOLD = 16384;

export interface RoutingDecision {
  modelId: string;
  tier: ModelTier;
  reason: string;
  escalated: boolean;
}

export interface EscalationDecision {
  escalate: boolean;
  confidence: number;
  reason: string;
}

export interface RoutingSessionState {
  modelId: string;
  escalationCount: number;
  /**
   * SEC-329-01 — trusted structured confidence from the model API's metadata
   * side-channel. NEVER extract this from the answer text (self-certification
   * risk — SECURITY-ASSESSMENT.md SEC-329-01). Undefined → heuristic only.
   */
  declaredConfidence?: number;
}

export class ModelRouter {
  constructor(
    private readonly registry: ModelRegistry,
    private readonly policy: RoutingPolicy,
    private readonly scorer: ConfidenceScorer = new ConfidenceScorer()
  ) {}

  route(query: string, modelId?: string): RoutingDecision {
    const requested = modelId ?? this.policy.smallModel;
    try {
      const decision = this.buildRouteDecision(query, requested);
      this.logDecision(decision);
      return decision;
    } catch (err) {
      const decision = ModelRouter.routeErrorDecision(requested, err as Error);
      this.logDecision(decision);
      return decision;
    }
  }

  shouldEscalate(answer: string, state: RoutingSessionState): EscalationDecision {
    // SEC-329-01: confidence comes from the trusted metadata channel
    // (state.declaredConfidence) or the answer heuristic — answer-embedded
    // `confidence: N` text is never trusted.
    const confidence = this.scorer.score(answer, { declaredConfidence: state.declaredConfidence });
    const belowThreshold = confidence < this.policy.confidenceThreshold;
    const budgetLeft = state.escalationCount < this.policy.maxEscalationsPerSession;
    const escalate = belowThreshold && budgetLeft;
    const reason = !belowThreshold
      ? `confidence ${confidence} >= threshold ${this.policy.confidenceThreshold}`
      : budgetLeft
        ? `confidence ${confidence} < threshold ${this.policy.confidenceThreshold}`
        : 'max escalations reached for session';
    const decision = { escalate, confidence, reason };
    logger.info('Escalation decision', { ...decision, modelId: state.modelId });
    return decision;
  }

  private buildRouteDecision(query: string, requested: string): RoutingDecision {
    if (typeof query !== 'string') {
      throw new Error('query must be a string');
    }
    const entry = this.registry.get(requested);
    if (!entry) {
      throw new Error(`MODEL_NOT_FOUND: '${requested}'`);
    }
    const tier = ModelRouter.classifyTier(this.registry, requested);
    return {
      modelId: requested,
      tier,
      reason: `small-first routing: '${requested}' classified ${tier} (query ${query.length} chars)`,
      escalated: false,
    };
  }

  private static routeErrorDecision(requested: string, err: Error): RoutingDecision {
    return {
      modelId: requested,
      tier: 'small',
      reason: `ROUTE_ERROR: kept original '${requested}' (${err.message})`,
      escalated: false,
    };
  }

  private logDecision(decision: RoutingDecision): void {
    logger.info('Routing decision', { ...decision });
  }

  static classifyTier(registry: ModelRegistry, modelId: string): ModelTier {
    const entry = registry.get(modelId);
    if (!entry) {
      return 'small';
    }
    return entry.contextWindow <= SMALL_CONTEXT_WINDOW_THRESHOLD ? 'small' : 'large';
  }
}
