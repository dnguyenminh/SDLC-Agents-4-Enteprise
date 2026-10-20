/**
 * RustParser unit tests — Relationship Extraction + Rust-Specific Features.
 * Split from rust-parser.test.ts to keep each file under the CI line-count
 * gate (<=200 lines). No logic changed — tests only relocated; registered by
 * rust-parser.test.ts via registerRustBehaviorCases().
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import type RustParser from '../rust-parser.js';
import {
  FIXTURES_DIR,
  USE_SIMPLE_SRC,
  USE_GROUPED_SRC,
  USE_GLOB_SRC,
  PUB_USE_SRC,
  CALLS_SRC,
  MACRO_CALLS_SRC,
  DERIVE_SRC,
  VISIBILITY_SRC,
} from './rust-parser.fixtures.js';

export function registerRustBehaviorCases(getParser: () => RustParser | null): void {
  describe('Relationship Extraction', () => {
    it('should extract use declarations (simple)', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(USE_SIMPLE_SRC, 'test.rs');
      const imports = result.relationships.filter(r => r.kind === 'imports');
      assert.ok(imports.some(i => i.targetSymbol === 'std::collections::HashMap'));
      assert.ok(imports.some(i => i.targetSymbol === 'std::io::Read'));
    });

    it('should expand grouped use paths', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(USE_GROUPED_SRC, 'test.rs');
      const imports = result.relationships.filter(r => r.kind === 'imports');
      assert.ok(imports.length >= 3, `Expected >= 3 imports, got ${imports.length}`);
    });

    it('should handle glob imports', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(USE_GLOB_SRC, 'test.rs');
      const imports = result.relationships.filter(r => r.kind === 'imports');
      const globImport = imports.find(i => i.metadata?.glob === true);
      assert.ok(globImport);
    });

    it('should handle pub use (re-exports)', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(PUB_USE_SRC, 'test.rs');
      const imports = result.relationships.filter(r => r.kind === 'imports');
      const pubUse = imports.find(i => i.metadata?.pub_use === true);
      assert.ok(pubUse);
    });

    it('should extract function calls', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(CALLS_SRC, 'test.rs');
      const calls = result.relationships.filter(r => r.kind === 'calls');
      assert.ok(calls.some(c => c.targetSymbol === 'compute'));
      assert.ok(calls.some(c => c.targetSymbol === 'process'));
    });

    it('should extract macro invocations as calls', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(MACRO_CALLS_SRC, 'test.rs');
      const calls = result.relationships.filter(r => r.kind === 'calls' && r.metadata?.macro);
      assert.ok(calls.length >= 1);
    });

    it('should extract derive macro implementations', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(DERIVE_SRC, 'test.rs');
      const implRels = result.relationships.filter(r =>
        r.kind === 'implements' && r.metadata?.derived === true
      );
      assert.ok(implRels.some(r => r.sourceSymbol === 'Config' && r.targetSymbol === 'Debug'));
      assert.ok(implRels.some(r => r.sourceSymbol === 'Config' && r.targetSymbol === 'Clone'));
      assert.ok(implRels.some(r => r.sourceSymbol === 'Config' && r.targetSymbol === 'Serialize'));
    });
  });

  describe('Rust-Specific Features', () => {
    it('should handle visibility modifiers', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(VISIBILITY_SRC, 'test.rs');
      const funcs = result.symbols.filter(s => s.kind === 'function');

      const pubFn = funcs.find(f => f.name === 'public_fn')!;
      assert.equal(pubFn.isExported, true);

      const crateFn = funcs.find(f => f.name === 'crate_fn')!;
      assert.equal(crateFn.isExported, true);

      const privFn = funcs.find(f => f.name === 'private_fn')!;
      assert.equal(privFn.isExported, false);
    });

    it('should parse fixture file without errors', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const fixturePath = path.join(FIXTURES_DIR, 'simple.rs');
      if (!fs.existsSync(fixturePath)) return;
      const source = fs.readFileSync(fixturePath, 'utf-8');
      const result = rustParser.parse(source, 'simple.rs');

      // Should have symbols
      assert.ok(result.symbols.length > 0, 'Should extract symbols');

      // Should have various kinds
      assert.ok(result.symbols.some(s => s.kind === 'function'));
      assert.ok(result.symbols.some(s => s.kind === 'struct'));
      assert.ok(result.symbols.some(s => s.kind === 'enum'));
      assert.ok(result.symbols.some(s => s.kind === 'trait'));

      // Should have relationships
      assert.ok(result.relationships.length > 0, 'Should extract relationships');

      // Should have imports
      assert.ok(result.relationships.some(r => r.kind === 'imports'));
    });
  });
}
