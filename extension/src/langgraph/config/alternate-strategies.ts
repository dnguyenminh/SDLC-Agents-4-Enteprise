export interface AlternateStrategy {
  nodeId: string;
  description: string;
  promptModifier: string;
  temperatureOverride?: number;
}

const ALTERNATE_STRATEGIES: Record<string, AlternateStrategy> = {
  "ba-agent": {
    nodeId: "ba-agent",
    description: "Simplified document with fewer sections, focus on core requirements",
    promptModifier: "Use a simplified template. Focus only on the most critical items. Skip optional sections. Prioritize completeness over breadth.",
    temperatureOverride: 0.3,
  },
  "ta-agent": {
    nodeId: "ta-agent",
    description: "Technical enrichment with simplified flows",
    promptModifier: "Simplify technical specifications. Include only core API contracts. Focus on essential integration points.",
    temperatureOverride: 0.3,
  },
  "sa-agent": {
    nodeId: "sa-agent",
    description: "TDD with higher-level design, less implementation detail",
    promptModifier: "Provide architecture overview and key interfaces only. Skip detailed method signatures. Focus on component interactions.",
    temperatureOverride: 0.4,
  },
  "dev-agent": {
    nodeId: "dev-agent",
    description: "Implementation with simpler patterns, fewer abstractions",
    promptModifier: "Use straightforward implementation. Prefer inline logic over abstraction layers. Focus on correctness over elegance.",
    temperatureOverride: 0.2,
  },
  "qa-agent": {
    nodeId: "qa-agent",
    description: "Test plan with fewer test levels, focus on critical paths",
    promptModifier: "Focus on Unit Tests and E2E-API tests only. Skip PBT and SIT. Cover only critical business paths.",
    temperatureOverride: 0.3,
  },
};

export function getAlternateStrategy(nodeId: string): AlternateStrategy | null {
  return ALTERNATE_STRATEGIES[nodeId] ?? null;
}
