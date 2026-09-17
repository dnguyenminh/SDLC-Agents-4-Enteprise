/**
 * Phase Router — SA4E-292
 * Phase transition logic replacing LangGraph edges with intent classification via Zod + LLM.
 */

import { z } from 'zod';
import type { PiWorkflowState } from './types/pi-workflow-state';
import { logger } from '../logger';
import type { PiProvider } from './pi-provider';
import { createPiProvider } from './pi-provider';

export type SDLCPhase =
  | 'requirements'
  | 'specification'
  | 'design'
  | 'test_planning'
  | 'implementation'
  | 'user_guide'
  | 'testing'
  | 'deployment';

const PHASE_ORDER: SDLCPhase[] = [
  'requirements',
  'specification',
  'design',
  'test_planning',
  'implementation',
  'user_guide',
  'testing',
  'deployment',
];

export const IntentSchema = z.object({
  type: z.enum(['phase_change', 'continue', 'finish', 'manual_review', 'unknown']),
  target: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
});

export type Intent = z.infer<typeof IntentSchema>;

export interface RouteResult {
  nextPhase: SDLCPhase | 'finish' | null;
  updatedState: PiWorkflowState;
  errors: string[];
}

export interface IPhaseRouter {
  nextPhase(current: string): string | null;
  isTerminal(phase: string): boolean;
  routePhase(state: PiWorkflowState, intent: Intent): RouteResult;
  classifyIntent(inputText: string): Intent;
}

/**
 * Simple heuristic intent classifier.
 * In production, this would call Pi SDK LLM with Zod-validated output.
 */
export class IntentClassifier {
  private readonly schema = IntentSchema;
  private piProvider?: PiProvider;
  private piAgentId = 'intent-classifier';

  constructor(piProvider?: PiProvider) {
    this.piProvider = piProvider;
  }

  classify(inputText: string): Intent {
    const text = inputText.toLowerCase();

    let intent: Intent = { type: 'unknown' };

    if (text.includes('move to') || text.includes('transition to') || text.includes('next phase')) {
      const match = text.match(/to\s+([a-z_]+)/);
      if (match && PHASE_ORDER.includes(match[1] as SDLCPhase)) {
        intent = { type: 'phase_change', target: match[1], confidence: 0.8, reason: 'Heuristic match' };
      } else {
        intent = { type: 'continue', confidence: 0.6, reason: 'Implicit transition' };
      }
    } else if (text.includes('finish') || text.includes('complete')) {
      intent = { type: 'finish', confidence: 0.7, reason: 'Explicit finish' };
    } else if (text.includes('review') || text.includes('manual')) {
      intent = { type: 'manual_review', confidence: 0.6, reason: 'Manual review requested' };
    } else {
      intent = { type: 'continue', confidence: 0.5, reason: 'Default continue' };
    }

    const parsed = this.schema.safeParse(intent);
    if (!parsed.success) {
      logger.error('Intent schema validation failed', { issues: parsed.error.issues, intent });
      return { type: 'unknown' };
    }
    return parsed.data;
  }

  async classifyWithPi(inputText: string): Promise<Intent> {
    if (!this.piProvider) {
      try {
        const provider = createPiProvider();
        await provider.initialize({ transportType: 'HTTP' });
        this.piProvider = provider;
      } catch {
        return this.classify(inputText);
      }
    }
    try {
      const agent = await this.piProvider.createAgent(this.piAgentId);
      const prompt = `Classify the user input into SDLC intent. Respond with JSON matching schema: {type:'phase_change'|'continue'|'finish'|'manual_review'|'unknown', target?:string, confidence:number, reason:string}. Input: ${inputText}`;
      const chunks: string[] = [];
      for await (const chunk of agent.stream({ agentId: this.piAgentId, messages: [{ role: 'user', content: prompt }] })) {
        if (chunk.type === 'text' && chunk.content) chunks.push(chunk.content);
      }
      const raw = chunks.join('');
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsedJson = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      if (parsedJson) {
        const validated = IntentSchema.safeParse(parsedJson);
        if (validated.success) {
          logger.info('Intent classified via Pi SDK', { intent: validated.data });
          return validated.data;
        }
      }
      logger.warn('Pi SDK intent parse failed, fallback heuristic', { raw });
    } catch (e) {
      logger.error('Pi SDK intent classification error', { error: (e as Error).message });
    }
    return this.classify(inputText);
  }
}

export class PhaseRouter implements IPhaseRouter {
  private readonly classifier: IntentClassifier;

  constructor(piProvider?: PiProvider) {
    this.classifier = new IntentClassifier(piProvider);
  }

  nextPhase(current: string): string | null {
    const normalized = current.toLowerCase();
    const idx = PHASE_ORDER.indexOf(normalized as SDLCPhase);
    if (idx === -1 || idx === PHASE_ORDER.length - 1) return null;
    const next = PHASE_ORDER[idx + 1];
    return next;
  }

  isTerminal(phase: string): boolean {
    return phase.toLowerCase() === 'deployment';
  }

  classifyIntent(inputText: string): Intent {
    try {
      return this.classifier.classify(inputText);
    } catch (e) {
      logger.error('Intent classification error', { error: (e as Error).message });
      return { type: 'unknown' };
    }
  }

  async classifyIntentAsync(inputText: string): Promise<Intent> {
    try {
      return await this.classifier.classifyWithPi(inputText);
    } catch (e) {
      logger.error('Async intent classification error', { error: (e as Error).message });
      return this.classifier.classify(inputText);
    }
  }

  routePhase(state: PiWorkflowState, intent: Intent): RouteResult {
    const errors: string[] = [];

    // Validate intent schema
    const validation = IntentSchema.safeParse(intent);
    if (!validation.success) {
      const msg = 'Invalid intent schema';
      errors.push(msg);
      logger.warn('Routing paused for manual review', { ticketKey: state.ticketKey, errors });
      return {
        nextPhase: null,
        updatedState: { ...state, errors: [...(state.errors ?? []), msg] },
        errors,
      };
    }

    const currentPhase = state.currentPhase as SDLCPhase;
    if (!PHASE_ORDER.includes(currentPhase)) {
      const msg = `Unknown phase: ${state.currentPhase}`;
      errors.push(msg);
      logger.error('Unknown phase, manual review required', { ticketKey: state.ticketKey, currentPhase });
      const updatedState = { ...state, errors: [...(state.errors ?? []), msg] };
      return {
        nextPhase: null,
        updatedState,
        errors,
      };
    }

    let nextPhase: SDLCPhase | 'finish' | null = null;

    try {
      switch (validation.data.type) {
        case 'phase_change': {
          const target = validation.data.target;
          if (target && PHASE_ORDER.includes(target as SDLCPhase)) {
            nextPhase = target as SDLCPhase;
          } else {
            // fallback to rule-based next
            const np = this.nextPhase(currentPhase);
            if (np) {
              nextPhase = np as SDLCPhase;
            } else {
              errors.push('No valid successor phase');
            }
          }
          break;
        }
        case 'continue': {
          const np = this.nextPhase(currentPhase);
          if (np) {
            nextPhase = np as SDLCPhase;
          } else {
            nextPhase = 'finish';
          }
          break;
        }
        case 'finish': {
          nextPhase = 'finish';
          break;
        }
        case 'manual_review': {
          nextPhase = null;
          errors.push('Manual review required');
          break;
        }
        default: {
          // unknown intent -> fallback
          const confidence = validation.data.confidence ?? 0;
          if (confidence < 0.5) {
            logger.warn('Low confidence intent, fallback to rule-based', { ticketKey: state.ticketKey, intent });
          }
          const np = this.nextPhase(currentPhase);
          if (np) {
            nextPhase = np as SDLCPhase;
          } else {
            nextPhase = 'finish';
          }
          break;
        }
      }
    } catch (e) {
      const msg = `Routing error: ${(e as Error).message}`;
      errors.push(msg);
      logger.error('Phase routing exception', { ticketKey: state.ticketKey, error: msg });
      nextPhase = null;
    }

    const updatedState: PiWorkflowState = {
      ...state,
      currentPhase: nextPhase && nextPhase !== 'finish' ? nextPhase : state.currentPhase,
      errors: errors.length ? [...(state.errors ?? []), ...errors] : state.errors,
    };

    logger.info('Phase transition', {
      ticketKey: state.ticketKey,
      currentPhase,
      nextPhase,
      intent: validation.data,
      event: 'phase_transition',
    });

    return { nextPhase, updatedState, errors };
  }
}
