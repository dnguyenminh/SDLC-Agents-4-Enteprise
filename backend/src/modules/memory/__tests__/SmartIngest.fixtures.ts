/**
 * Unit Tests — Smart Ingest Handler (SA4E-38) — shared fixtures.
 * (Split from SmartIngest.test.ts — BR-18 ≤200 lines/file.)
 */
import { vi } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { MEMORY_SCHEMA } from '../schema/index.js';
import type { ClassifyService } from '../llm/classify-service.js';

export async function createTestDb(): Promise<SqliteAdapter> {
  const adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  await adapter.exec(MEMORY_SCHEMA);
  return adapter;
}

export function createMockClassify(verdict: 'ingest' | 'skip', summary?: string, available = true) {
  return {
    classify: vi.fn().mockResolvedValue({ verdict, summary }),
    isAvailable: vi.fn().mockResolvedValue(available),
    buildPrompt: vi.fn(),
    parseResponse: vi.fn(),
  } as unknown as ClassifyService;
}

export function createUnavailableClassify() {
  return {
    classify: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(false),
    buildPrompt: vi.fn(),
    parseResponse: vi.fn(),
  } as unknown as ClassifyService;
}
