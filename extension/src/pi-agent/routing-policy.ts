export interface RoutingPolicy {
  smallModel: string;
  escalationModel: string;
  confidenceThreshold: number;
  maxEscalationsPerSession: number;
  maxCostIncreaseRatio: number;
  routingTimeoutMs: number;
  maxRetries: number;
}

export const DEFAULT_ROUTING_POLICY: RoutingPolicy = {
  smallModel: 'phi-3-mini',
  escalationModel: 'gpt-4o-mini',
  confidenceThreshold: 0.75,
  maxEscalationsPerSession: 1,
  maxCostIncreaseRatio: 0.3,
  routingTimeoutMs: 100,
  maxRetries: 1,
};
