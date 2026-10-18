/**
 * Shared helpers for the OriginGate unit suite (SA4E-358, mức 1 — pure
 * function, no server). Extracted when the suite was split by concern.
 */
import { expect } from 'vitest';
import { evaluateOriginGate, type OriginGateDeny } from '../OriginGate';

/** Build a flat rawHeaders array from [name, value] pairs. */
export const H = (...pairs: Array<[string, string]>): string[] => pairs.flat();

export const HOST_OK = ['Host', '127.0.0.1:9181'] as [string, string];

export function expectDeny(r: ReturnType<typeof evaluateOriginGate>, reason: string): OriginGateDeny {
  expect(r.ok).toBe(false);
  expect((r as OriginGateDeny).reason).toBe(reason);
  return r as OriginGateDeny;
}
