/**
 * Compact stream event emission (SA4E-182).
 * Maps lifecycle moments onto the webview CompactStreamEvent protocol.
 */

import type { CompactMethod, CompactTrigger } from '../types';
import type { StreamHandler } from './contracts';

export function emitCompactStart(streamHandler: StreamHandler, trigger: CompactTrigger, usagePercent: number): void {
  streamHandler.emitDirect({ type: 'COMPACT_START', trigger, currentUsagePercent: usagePercent });
}

export function emitCompactComplete(
  streamHandler: StreamHandler,
  method: CompactMethod, beforePercent: number, afterPercent: number, summary: string
): void {
  streamHandler.emitDirect({
    type: 'COMPACT_COMPLETE', method, beforeUsagePercent: beforePercent,
    afterUsagePercent: afterPercent, summary,
  });
}

export function emitCompactError(streamHandler: StreamHandler, err: unknown, fallbackApplied: boolean): void {
  streamHandler.emitDirect({
    type: 'COMPACT_ERROR', error: (err as Error).message ?? 'Unknown error', fallbackApplied,
  });
}
