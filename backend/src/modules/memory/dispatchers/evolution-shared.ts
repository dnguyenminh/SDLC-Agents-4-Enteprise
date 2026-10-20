/**
 * Evolution dispatcher — shared helpers (SA4E-53).
 * Extracted from evolution.ts: logger, arg type, error JSON mapping.
 */

import pino from 'pino';

export const logger = pino({ name: 'evolution-dispatcher' });

export type Args = Record<string, unknown>;

export function errorJson(code: string, message: string): string {
  return JSON.stringify({ error: code, message });
}

export function mapOutcomeCode(msg: string): string {
  if (msg === 'ENTRY_NOT_FOUND') return 'ENTRY_NOT_FOUND';
  if (msg === 'INVALID_OUTCOME') return 'INVALID_OUTCOME';
  return 'OUTCOME_WRITE_FAILED';
}

export function mapVerifyCode(msg: string): string {
  if (msg === 'ENTRY_NOT_FOUND') return 'ENTRY_NOT_FOUND';
  if (msg === 'NOT_FLAGGED') return 'NOT_FLAGGED';
  return 'VERIFY_FAILED';
}

export function mapDecayCode(msg: string): string {
  if (msg === 'JOB_IN_PROGRESS') return 'JOB_IN_PROGRESS';
  if (msg.includes('INVALID')) return 'INVALID_CONFIG';
  return 'DECAY_ERROR';
}

export function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
