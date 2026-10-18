import type { LlmProvider } from '../mcp/llm-provider';
import { debugError } from '../debug-logger.js';

export interface ContextProbeState {
  probeDone: boolean;
  detectedWindow?: number;
  /** SA4E-370: number of async probe attempts made (for retry bookkeeping). */
  attempts?: number;
}

/** SA4E-370: a failed probe may be retried up to this many total attempts. */
const MAX_PROBE_ATTEMPTS = 3;

/**
 * FIX E: context-window detection helper extracted from PiWorkflowAdapter
 * to keep the adapter within the 200-line standard.
 * SA4E-370: a failed probe no longer locks the state permanently — it is
 * retried on the next call until a window is detected or attempts run out.
 */
export async function detectContextWindowEarlyHelper(
  provider: LlmProvider | undefined,
  state: ContextProbeState
): Promise<void> {
  if (state.probeDone) return;
  if (!provider) {
    // One-shot lock: nothing to probe against.
    state.probeDone = true;
    return;
  }
  if (typeof provider.detectContextWindow !== 'function') {
    // One-shot lock: no async probe to retry; the synchronous window is final.
    state.probeDone = true;
    if (typeof provider.getContextWindow === 'function') {
      const windowSize = provider.getContextWindow();
      if (windowSize > 0) state.detectedWindow = windowSize;
    }
    return;
  }
  state.attempts = (state.attempts ?? 0) + 1;
  try {
    const detected = await provider.detectContextWindow();
    const windowSize = typeof detected === 'number' && detected > 0 ? detected : provider.getContextWindow();
    if (windowSize > 0) state.detectedWindow = windowSize;
  } catch (err) {
    debugError('[ContextProbe] detectContextWindowEarly failed', err as Error);
  }
  // SA4E-370: retry on the next call until detected or attempts exhausted.
  state.probeDone = state.detectedWindow !== undefined || state.attempts >= MAX_PROBE_ATTEMPTS;
}

export function getDetectedContextWindowHelper(
  provider: LlmProvider | undefined,
  state: ContextProbeState
): number | undefined {
  if (state.detectedWindow !== undefined) return state.detectedWindow;
  // SA4E-370: only trust the provider's synchronous window after a real probe
  // attempt happened — before that it may still hold a placeholder (8192).
  if (state.probeDone && provider && typeof provider.getContextWindow === 'function') {
    const w = provider.getContextWindow();
    if (w > 0) { state.detectedWindow = w; }
  }
  return state.detectedWindow;
}
