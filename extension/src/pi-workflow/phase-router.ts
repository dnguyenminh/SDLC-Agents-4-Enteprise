import type { PiWorkflowState } from './types/pi-workflow-state';
import { logger } from '../logger';
import { IntentClassifier, IntentSchema as IntentSchemaBase, type Intent } from './phase-intent-classifier';
import type { PiProvider } from './pi-provider';
import { PHASE_ORDER, type SDLCPhase } from './sdlc-phases';

export { IntentSchemaBase as IntentSchema };

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

export class PhaseRouter implements IPhaseRouter {
  private readonly classifier: IntentClassifier;

  constructor(piProvider?: PiProvider) {
    this.classifier = new IntentClassifier(piProvider);
  }

  nextPhase(current: string): string | null {
    const normalized = current.toLowerCase();
    const idx = PHASE_ORDER.indexOf(normalized as SDLCPhase);
    if (idx === -1 || idx === PHASE_ORDER.length - 1) return null;
    return PHASE_ORDER[idx + 1];
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
    const validation = IntentSchemaBase.safeParse(intent);
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

    let nextPhase: SDLCPhase | 'finish' | null = null;
    const currentPhase = ((state.currentPhase as string) || 'requirements').toLowerCase() as SDLCPhase;
    const currentIdx = PHASE_ORDER.indexOf(currentPhase);
    if (currentIdx === -1) {
      errors.push('Unknown phase');
    }

    if (errors.length === 0) {
      switch (intent.type) {
        case 'phase_change': {
          if (intent.target && PHASE_ORDER.includes(intent.target as SDLCPhase)) {
            const targetIdx = PHASE_ORDER.indexOf(intent.target as SDLCPhase);
            if (targetIdx > currentIdx) {
              nextPhase = intent.target as SDLCPhase;
            } else {
              const msg = `Target phase '${intent.target}' is not ahead of current '${currentPhase}'`;
              errors.push('Target phase is not ahead in SDLC flow');
              logger.warn('PhaseRouter: target not ahead, manual review required', {
                ticketKey: state.ticketKey,
                currentPhase,
                target: intent.target,
                msg,
              });
            }
          } else {
            errors.push('Invalid target phase');
          }
          break;
        }
        case 'continue': {
          if (currentIdx !== -1 && currentIdx < PHASE_ORDER.length - 1) {
            nextPhase = PHASE_ORDER[currentIdx + 1];
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
          errors.push('Manual review required');
          break;
        }
        default: {
          logger.warn('PhaseRouter: unrecognized intent type, defaulting to next phase transition', {
            ticketKey: state.ticketKey,
            intentType: intent.type,
            currentPhase,
          });
          const np = this.nextPhase(currentPhase);
          if (np) nextPhase = np as SDLCPhase;
          else nextPhase = 'finish';
          break;
        }
      }
    }

    const updatedState = { ...state };
    if (nextPhase && nextPhase !== 'finish') {
      updatedState.currentPhase = nextPhase;
    }
    if (errors.length) {
      updatedState.errors = [...(updatedState.errors ?? []), ...errors];
      updatedState.pipelineStatus = 'paused';
    } else if (nextPhase === 'finish') {
      updatedState.pipelineStatus = 'finished';
    } else {
      updatedState.pipelineStatus = 'running';
    }

    return { nextPhase, updatedState, errors };
  }
}
