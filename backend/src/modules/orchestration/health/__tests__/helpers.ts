/** Shared logger mock for ConnectionStateTracker tests (SA4E-37). */
import { vi } from 'vitest';

export function createMockLogger() {
  return {
    child: () => createMockLogger(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any;
}
