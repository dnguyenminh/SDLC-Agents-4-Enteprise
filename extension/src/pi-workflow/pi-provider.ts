/**
 * PiProvider facade — real pi-agent-core/pi-ai provider (SEC-289-01).
 * Implementation: ./pi-provider/ (base state, initialize, turn-runner,
 * run-lifecycle, compat-api, system-prompt).
 */
export * from './pi-provider-types.js';
import { PiProviderCompat } from './pi-provider/compat-api.js';

/**
 * Real adapter provider on top of pi-agent-core: budget-gated intra-turn
 * streamFn, tool-approval gate, model fallback chain, and turn guards.
 */
export class PiProvider extends PiProviderCompat {}
