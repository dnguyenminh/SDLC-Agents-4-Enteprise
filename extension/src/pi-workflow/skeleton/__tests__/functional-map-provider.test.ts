/**
 * SA4E-360 — FunctionalMapProvider tests (TDD task T7; STC UT-26..UT-29).
 * Fixture data: functional-map-testdata.csv FM-01..FM-06.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { estimateTokenCount } from '../../../pi-agent/prompt-compressor.js';
import { FunctionalMapProvider, MAX_RESULT_CHARS, MAP_TOKEN_CAP } from '../functional-map-provider.js';

let root = '';
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-map-'));
  for (const dir of ['extension/src/pi-agent', 'extension/src/pi-workflow', 'backend/src/engine']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'index.ts'), 'export const marker = 1;\n');
  }
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const KEY_SYMBOLS: Record<string, string[]> = {
  'extension/src/pi-agent': ['QueryRouter', 'SymbolOutlineExtractor'],
  'extension/src/pi-workflow': ['TurnBudgetGuard', 'SessionHost'],
  'backend/src/engine': ['signature-extractor', 'QueryLayer'],
};

function make(overrides: Record<string, unknown> = {}) {
  return new FunctionalMapProvider({ keySymbolsFor: (m) => KEY_SYMBOLS[m] ?? [], ...overrides } as never);
}

// STC UT-26 — map shape + 1,500-token cap + 60s TTL fields (FM-01..03)
describe('FunctionalMapProvider shape (UT-26)', () => {
  it('serves real indexed modules with corpus keySymbols and TTL fields', () => {
    const section = make().buildSection(root, 'Workspace root: X');
    expect(section).toBeDefined();
    const modules = section!.entries.map((e) => e.module);
    expect(modules).toContain('extension/src/pi-agent');
    expect(modules).toContain('backend/src/engine');
    const agent = section!.entries.find((e) => e.module === 'extension/src/pi-agent');
    expect(agent!.summary).toContain('pi-agent/ (1 files)');
    expect(agent!.keySymbols).toEqual(['QueryRouter', 'SymbolOutlineExtractor']);
    expect(section!.mapTokens).toBeLessThanOrEqual(MAP_TOKEN_CAP);
    expect(section!.cacheTtlSeconds).toBe(60);
    expect(section!.text).toContain('Workspace root: X'); // layout composed
  });
});

// STC UT-27 — whole-result ≤ 16,000 chars; cap pressure trims by priority (FM-04)
describe('FunctionalMapProvider cap pressure (UT-27, AF-1)', () => {
  it('trims lowest-priority entries until the composed text fits the char cap', () => {
    const bigRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-map-big-'));
    try {
      for (let i = 0; i < 60; i++) {
        const dir = path.join(bigRoot, `mod${i}`, 'sub');
        fs.mkdirSync(dir, { recursive: true });
        for (let f = 0; f < 12; f++) {
          fs.writeFileSync(path.join(dir, `module-file-with-a-deliberately-long-name-${i}-${f}.ts`), `// module ${i}\n`);
        }
      }
      const provider = new FunctionalMapProvider({
        modulePriorityOrder: ['mod0', 'mod1', 'mod2'],
        keySymbolsFor: () => ['k1', 'k2', 'k3', 'k4', 'k5'],
      });
      const section = provider.buildSection(bigRoot, 'Workspace root: big');
      expect(section).toBeDefined();
      expect(section!.text.length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
      expect(section!.entries.length).toBeLessThan(40); // trimmed
      // Highest-priority modules survive trimming.
      expect(section!.entries.map((e) => e.module)).toContain('mod0');
    } finally {
      fs.rmSync(bigRoot, { recursive: true, force: true });
    }
  });
});

// STC UT-28 — EF-1: one module fails → entry omitted, rest served (FM-05)
describe('FunctionalMapProvider EF-1 (UT-28)', () => {
  it('omits the failing module entry and serves the rest (debug, no event)', () => {
    const emit = vi.fn();
    const provider = new FunctionalMapProvider({
      keySymbolsFor: (m) => {
        if (m === 'extension/src/pi-agent') throw new Error('corpus offline');
        return KEY_SYMBOLS[m] ?? [];
      },
      emit,
    });
    const section = provider.buildSection(root, 'Layout');
    expect(section).toBeDefined();
    expect(section!.entries.map((e) => e.module)).not.toContain('extension/src/pi-agent');
    expect(section!.entries.length).toBeGreaterThan(1);
    expect(emit).not.toHaveBeenCalled(); // EF-1 logs at debug — NOT an event
  });
});

// STC UT-29 — EF-2: total failure → layout only + warn event (FM-06)
describe('FunctionalMapProvider EF-2 (UT-29)', () => {
  it('returns undefined (layout-only) and emits PI_FUNCTIONAL_MAP_UNAVAILABLE once', () => {
    const emit = vi.fn();
    const provider = new FunctionalMapProvider({
      builder: {
        build: () => {
          throw new Error('walk exploded');
        },
      } as never,
      emit,
    });
    expect(provider.buildSection(root, 'Layout')).toBeUndefined();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('PI_FUNCTIONAL_MAP_UNAVAILABLE', expect.objectContaining({ workspaceRoot: root }));
  });

  it('measures mapTokens with the shipped estimator (INV-2)', () => {
    const section = make().buildSection(root, 'Layout');
    expect(section!.mapTokens).toBe(estimateTokenCount(section!.text.split('\n\n').slice(1).join('\n\n')));
  });
});
