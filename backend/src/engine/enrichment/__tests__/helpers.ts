/**
 * Shared mocks for enrichment end-to-end flow tests (SA4E-106/209).
 * See enrichment-e2e.*.test.ts files in this folder.
 */
import { vi } from 'vitest';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { MemoryEngine } from '../../../modules/memory/engine/index.js';
import pino from 'pino';

export const logger = pino({ level: 'silent' });

export function createMockDb(): DatabaseAdapter {
  return {
    getAsync: vi.fn(),
    allAsync: vi.fn(() => Promise.resolve([])),
    runAsync: vi.fn(() => Promise.resolve({ changes: 0, lastInsertRowid: 0 })),
    getEngine: vi.fn(() => 'sqlite'),
  } as unknown as DatabaseAdapter;
}

export function createMockEngine(): MemoryEngine {
  const mockAdapter = {
    getAsync: vi.fn(),
    allAsync: vi.fn(() => Promise.resolve([])),
    runAsync: vi.fn(() => Promise.resolve({ changes: 0 })),
    getEngine: vi.fn(() => 'sqlite'),
  };
  return {
    findById: vi.fn(),
    updateTags: vi.fn(),
    updateStructuredMap: vi.fn(),
    getAdapter: vi.fn(() => mockAdapter),
  } as unknown as MemoryEngine;
}

export function createMockLlmService() {
  return {
    complete: vi.fn().mockResolvedValue({
      content: JSON.stringify({ summary: 'Test summary', pseudo_code: 'Step 1' }),
      model: 'test-model',
      provider: 'ollama',
    }),
    getConfig: vi.fn(() => ({ model: 'test-model' })),
  };
}
