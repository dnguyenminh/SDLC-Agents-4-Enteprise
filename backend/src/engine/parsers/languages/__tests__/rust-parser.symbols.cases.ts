/**
 * RustParser unit tests — Symbol Extraction describe block.
 * Split from rust-parser.test.ts to keep each file under the CI line-count
 * gate (<=200 lines). No logic changed — tests only relocated; registered by
 * rust-parser.test.ts via registerRustSymbolExtractionCases().
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type RustParser from '../rust-parser.js';
import {
  FUNCTIONS_SRC,
  ASYNC_UNSAFE_SRC,
  STRUCTS_SRC,
  ENUMS_SRC,
  TRAITS_SRC,
  IMPL_BLOCKS_SRC,
  TRAIT_IMPLS_SRC,
  MODULES_SRC,
  MACRO_DEF_SRC,
  CONSTS_SRC,
} from './rust-parser.fixtures.js';

export function registerRustSymbolExtractionCases(getParser: () => RustParser | null): void {
  describe('Symbol Extraction', () => {
    it('should extract functions', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(FUNCTIONS_SRC, 'test.rs');
      const funcs = result.symbols.filter(s => s.kind === 'function');
      assert.equal(funcs.length, 2);

      const hello = funcs.find(f => f.name === 'hello')!;
      assert.equal(hello.isExported, true);
      assert.equal(hello.returnType, 'String');
      assert.ok(hello.signature.includes('fn hello'));

      const helper = funcs.find(f => f.name === 'private_helper')!;
      assert.equal(helper.isExported, false);
    });

    it('should extract async/unsafe functions', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(ASYNC_UNSAFE_SRC, 'test.rs');
      const funcs = result.symbols.filter(s => s.kind === 'function');

      const fetch = funcs.find(f => f.name === 'fetch')!;
      assert.equal(fetch.isAsync, true);
      assert.ok(fetch.modifiers?.includes('async'));

      const raw = funcs.find(f => f.name === 'raw_ptr')!;
      assert.ok(raw.modifiers?.includes('unsafe'));
    });

    it('should extract structs', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(STRUCTS_SRC, 'test.rs');
      const structs = result.symbols.filter(s => s.kind === 'struct');
      assert.equal(structs.length, 2);

      const config = structs.find(s => s.name === 'Config')!;
      assert.equal(config.isExported, true);

      const internal = structs.find(s => s.name === 'Internal')!;
      assert.equal(internal.isExported, false);
    });

    it('should extract enums', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(ENUMS_SRC, 'test.rs');
      const enums = result.symbols.filter(s => s.kind === 'enum');
      assert.equal(enums.length, 1);
      assert.equal(enums[0].name, 'Status');
    });

    it('should extract traits', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(TRAITS_SRC, 'test.rs');
      const traits = result.symbols.filter(s => s.kind === 'trait');
      assert.equal(traits.length, 1);
      assert.equal(traits[0].name, 'Serializable');

      // Trait methods should be extracted
      const methods = result.symbols.filter(s => s.kind === 'method' || (s.kind === 'function' && s.parentName === 'Serializable'));
      assert.ok(methods.length >= 2);
    });

    it('should extract impl blocks and methods', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(IMPL_BLOCKS_SRC, 'test.rs');

      // Should have impl namespace
      const impls = result.symbols.filter(s => s.name.startsWith('impl '));
      assert.ok(impls.length >= 1);

      // Should have methods with parentName = Server
      const methods = result.symbols.filter(s => s.parentName === 'Server');
      assert.equal(methods.length, 3);
      assert.ok(methods.some(m => m.name === 'new'));
      assert.ok(methods.some(m => m.name === 'start'));
      assert.ok(methods.some(m => m.name === 'internal_setup'));
    });

    it('should extract trait implementations', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(TRAIT_IMPLS_SRC, 'test.rs');
      const implRels = result.relationships.filter(r => r.kind === 'implements');
      assert.ok(implRels.some(r => r.sourceSymbol === 'MyStruct' && r.targetSymbol === 'Display'));
    });

    it('should extract modules', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(MODULES_SRC, 'test.rs');
      const modules = result.symbols.filter(s => s.kind === 'module');
      assert.equal(modules.length, 2);
      assert.ok(modules.some(m => m.name === 'utils'));
      assert.ok(modules.some(m => m.name === 'internal'));

      // Inline module should have children
      const helperFn = result.symbols.find(s => s.name === 'helper');
      assert.ok(helperFn);
      assert.equal(helperFn!.parentName, 'utils');
    });

    it('should extract macro definitions', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(MACRO_DEF_SRC, 'test.rs');
      const macros = result.symbols.filter(s => s.modifiers?.includes('macro'));
      assert.equal(macros.length, 1);
      assert.equal(macros[0].name, 'my_macro');
    });

    it('should extract constants and statics', () => {
      const rustParser = getParser();
      if (!rustParser) return;
      const result = rustParser.parse(CONSTS_SRC, 'test.rs');
      assert.ok(result.symbols.some(s => s.name === 'MAX_SIZE'));
      assert.ok(result.symbols.some(s => s.name === 'COUNTER'));
    });
  });
}
