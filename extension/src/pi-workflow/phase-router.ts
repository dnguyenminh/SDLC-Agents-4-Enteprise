import { z } from 'zod';

export const VALID_PHASES = [
  'requirements',
  'specification',
  'design',
  'test_planning',
  'implementation',
  'testing',
  'deployment',
  'completed'
] as const;

export type SDLCPhase = typeof VALID_PHASES[number];

export const IntentSchema = z.object({
  action: z.enum(['proceed', 'reject', 'clarify', 'retry', 'abort']),
  targetPhase: z.enum(VALID_PHASES).optional(),
  reason: z.string().optional()
});

export type Intent = z.infer<typeof IntentSchema>;

export interface RoutingResult {
  nextPhase: string;
  updatedState: Record<string, unknown>;
  errors: Array<{ code: string; message: string }>;
}

const NEXT_PHASE_MAP: Record<string, SDLCPhase> = {
  requirements: 'specification',
  specification: 'design',
  design: 'test_planning',
  test_planning: 'implementation',
  implementation: 'testing',
  testing: 'deployment',
  deployment: 'completed'
};

export class PhaseRouter {
  async routePhase(
    currentState: { currentPhase: string; [key: string]: unknown },
    intent: Intent
  ): Promise<RoutingResult> {
    const parseResult = IntentSchema.safeParse(intent);
    if (!parseResult.success) {
      return {
        nextPhase: currentState?.currentPhase || 'requirements',
        updatedState: { ...currentState },
        errors: [{ code: 'INVALID_INTENT', message: 'Intent schema validation failed' }]
      };
    }

    const validIntent = parseResult.data;
    const current = currentState?.currentPhase;

    if (!current || !VALID_PHASES.includes(current as any)) {
      return {
        nextPhase: current || 'requirements',
        updatedState: { ...currentState },
        errors: [{ code: 'UNKNOWN_PHASE', message: `Current phase '${current}' is invalid` }]
      };
    }

    if (validIntent.action === 'abort' || validIntent.action === 'reject') {
      return {
        nextPhase: current,
        updatedState: { ...currentState, pipelineStatus: 'HALTED', haltReason: validIntent.reason || 'User halted' },
        errors: []
      };
    }

    if (validIntent.targetPhase && VALID_PHASES.includes(validIntent.targetPhase)) {
      return {
        nextPhase: validIntent.targetPhase,
        updatedState: { ...currentState, currentPhase: validIntent.targetPhase },
        errors: []
      };
    }

    const next = NEXT_PHASE_MAP[current] || current;
    return {
      nextPhase: next,
      updatedState: { ...currentState, currentPhase: next },
      errors: []
    };
  }
}
