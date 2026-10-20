/**
 * KSA-148: Python Parser Unit Tests.
 * Tests symbol extraction, relationship extraction, and edge cases.
 * setup/readFixture/parseFixture extracted to python-parser.fixtures.ts
 * (line-count gate <=200).
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup, parser, grammarAvailable, parseFixture } from './python-parser.fixtures.js';

describe('PythonParser', () => {
  before(async () => {
    await setup();
  });

  describe('getSupportedExtensions', () => {
    it('should return .py and .pyi', () => {
      if (!grammarAvailable) return;
      assert.deepEqual(parser.getSupportedExtensions(), ['.py', '.pyi']);
    });
  });

  describe('parse — simple-function.py', () => {
    it('should extract module-level imports', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('simple-function.py');

      const imports = result.relationships.filter(r => r.kind === 'imports');
      assert.ok(imports.length >= 4, `Expected >=4 imports, got ${imports.length}`);

      // Check 'import os'
      const osImport = imports.find(r => r.targetSymbol === 'os');
      assert.ok(osImport, 'Should find import os');

      // Check 'from typing import List, Optional'
      const listImport = imports.find(r => r.targetSymbol === 'typing.List');
      assert.ok(listImport, 'Should find from typing import List');

      // Check relative import
      const relImport = imports.find(r => r.metadata?.relative === true);
      assert.ok(relImport, 'Should find relative import');
    });

    it('should extract module-level functions', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('simple-function.py');

      const simpleFunc = result.symbols.find(s => s.name === 'simple_function');
      assert.ok(simpleFunc, 'Should find simple_function');
      assert.equal(simpleFunc.kind, 'function');
      assert.equal(simpleFunc.returnType, 'int');
      assert.equal(simpleFunc.isExported, true);
      assert.ok(simpleFunc.signature?.includes('def simple_function'));
    });

    it('should extract async functions', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('simple-function.py');

      const asyncFunc = result.symbols.find(s => s.name === 'fetch_data');
      assert.ok(asyncFunc, 'Should find fetch_data');
      assert.equal(asyncFunc.isAsync, true);
      assert.ok(asyncFunc.modifiers?.includes('async'));
    });

    it('should extract classes with inheritance', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('simple-function.py');

      const cls = result.symbols.find(s => s.name === 'DataProcessor' && s.kind === 'class');
      assert.ok(cls, 'Should find DataProcessor class');
      assert.ok(cls.signature?.includes('BaseProcessor'));

      const inherits = result.relationships.find(
        r => r.sourceSymbol === 'DataProcessor' && r.kind === 'inherits'
      );
      assert.ok(inherits, 'Should find inheritance relationship');
      assert.equal(inherits.targetSymbol, 'BaseProcessor');
    });

    it('should extract methods with decorators', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('simple-function.py');

      const staticMethod = result.symbols.find(s => s.name === 'validate' && s.parentName === 'DataProcessor');
      assert.ok(staticMethod, 'Should find validate method');
      assert.ok(staticMethod.modifiers?.includes('static'));

      const classMethod = result.symbols.find(s => s.name === 'from_file');
      assert.ok(classMethod, 'Should find from_file classmethod');
      assert.ok(classMethod.modifiers?.includes('classmethod'));

      const prop = result.symbols.find(s => s.name === 'cache_size');
      assert.ok(prop, 'Should find cache_size property');
      assert.equal(prop.kind, 'property');
    });

    it('should extract constructors', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('simple-function.py');

      const init = result.symbols.find(s => s.name === '__init__' && s.parentName === 'DataProcessor');
      assert.ok(init, 'Should find __init__');
      assert.equal(init.kind, 'constructor');
    });

    it('should extract module-level constants', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('simple-function.py');

      const constant = result.symbols.find(s => s.name === 'MAX_RETRIES');
      assert.ok(constant, 'Should find MAX_RETRIES constant');
      assert.equal(constant.kind, 'constant');
    });

    it('should mark private methods as not exported', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('simple-function.py');

      const privateMethod = result.symbols.find(s => s.name === '_internal_method');
      assert.ok(privateMethod, 'Should find _internal_method');
      assert.equal(privateMethod.isExported, false);
    });

    it('should extract function calls', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('simple-function.py');

      const calls = result.relationships.filter(r => r.kind === 'calls');
      assert.ok(calls.length > 0, 'Should find some calls');
    });
  });

  describe('parse — protocol-class.py', () => {
    it('should detect Protocol as interface', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('protocol-class.py');

      const protocol = result.symbols.find(s => s.name === 'Serializable');
      assert.ok(protocol, 'Should find Serializable');
      assert.equal(protocol.kind, 'interface');

      const impl = result.relationships.find(
        r => r.sourceSymbol === 'Serializable' && r.kind === 'implements'
      );
      assert.ok(impl, 'Should find implements Protocol relationship');
    });

    it('should detect ABC as abstract class', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('protocol-class.py');

      const abc = result.symbols.find(s => s.name === 'AbstractHandler');
      assert.ok(abc, 'Should find AbstractHandler');
      assert.equal(abc.kind, 'class');
      assert.ok(abc.modifiers?.includes('abstract'));
    });

    it('should detect dataclass decorator', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('protocol-class.py');

      const config = result.symbols.find(s => s.name === 'Config');
      assert.ok(config, 'Should find Config dataclass');
      assert.ok(config.modifiers?.includes('dataclass'));
      assert.ok(config.decorators?.includes('dataclass'));
    });

    it('should extract abstract methods', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('protocol-class.py');

      const abstractMethod = result.symbols.find(s => s.name === 'handle' && s.parentName === 'AbstractHandler');
      assert.ok(abstractMethod, 'Should find abstract handle method');
      assert.ok(abstractMethod.modifiers?.includes('abstract'));
    });

    it('should extract docstrings', () => {
      if (!grammarAvailable) return;
      const result = parseFixture('protocol-class.py');

      const config = result.symbols.find(s => s.name === 'Config');
      assert.ok(config?.docComment, 'Config should have docstring');
      assert.ok(config.docComment.includes('Application configuration'));
    });
  });

  describe('error handling', () => {
    it('should handle empty source', () => {
      if (!grammarAvailable) return;
      const result = parser.parse('', 'empty.py');
      assert.equal(result.symbols.length, 0);
      assert.equal(result.relationships.length, 0);
      assert.equal(result.errors.length, 0);
    });

    it('should handle source with syntax errors gracefully', () => {
      if (!grammarAvailable) return;
      const source = `
def valid_function():
    pass

def broken_function(
    # missing closing paren and body

class ValidClass:
    pass
`;
      const result = parser.parse(source, 'broken.py');
      // Should still extract what it can
      const validFunc = result.symbols.find(s => s.name === 'valid_function');
      assert.ok(validFunc, 'Should still extract valid_function');
    });
  });
});
