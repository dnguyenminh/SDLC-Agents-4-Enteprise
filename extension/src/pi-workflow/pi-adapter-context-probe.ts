import type { LlmProvider } from '../langgraph/core/llm-provider.js';
import { debugError } from '../debug-logger.js';

export interface ContextProbeState {
  probeDone: boolean;
  detectedWindow?: number;
}

/**
 * FIX E: context-window detection helper extracted from PiWorkflowAdapter
 * to keep the adapter within the 200-line standard.
 */
export async function detectContextWindowEarlyHelper(
  provider: LlmProvider | undefined,
  state: ContextProbeState
): Promise<void> {
  if (state.probeDone) return;
  state.probeDone = true;
  try {
    if (!provider) return;
    if (typeof provider.detectContextWindow === 'function') {
      const detected = await provider.detectContextWindow();
      const windowSize = typeof detected === 'number' && detected > 0 ? detected : provider.getContextWindow();
      if (windowSize > 0) state.detectedWindow = windowSize;
    } else if (typeof provider.getContextWindow === 'function') {
      const windowSize = provider.getContextWindow();
      if (windowSize > 0) state.detectedWindow = windowSize;
    }
  } catch (err) {
    debugError('[ContextProbe] detectContextWindowEarly failed', err as Error);
  }
}

export function getDetectedContextWindowHelper(
  provider: LlmProvider | undefined,
  state: ContextProbeState
): number | undefined {
  if (state.detectedWindow !== undefined) return state.detectedWindow;
  if (provider && typeof provider.getContextWindow === 'function') {
    const w = provider.getContextWindow();
    if (w > 0) { state.detectedWindow = w; }
  }
  return state.detectedWindow;
}
