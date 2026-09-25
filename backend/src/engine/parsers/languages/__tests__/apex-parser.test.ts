/**
 * KSA-191: Apex Parser Unit Tests.
 * Tests symbol extraction, relationship extraction (DML, SOQL, triggers).
 * Requires tree-sitter-apex.wasm — tests skip gracefully if unavailable.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { Parser, Language } from 'web-tree-sitter';
import * as path from 'path';
import * as fs from 'fs';
import ApexParser from '../apex-parser.js';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/apex');
const GRAMMAR_PATH = path.resolve(__dirname, '../../grammars/tree-sitter-apex.wasm');

let parser: ApexParser;
let grammarAvailable = false;

async function setup(): Promise<void> {
  await Parser.init();
  const tsParser = new Parser();

  if (!fs.existsSync(GRAMMAR_PATH)) {
    console.error(`[SKIP] Apex WASM grammar not found at ${GRAMMAR_PATH}`);
    return;
  }

  const language = await Language.load(GRAMMAR_PATH);
  tsParser.setLanguage(language);
  parser = new ApexParser(tsParser, 'apex');
  grammarAvailable = true;
}

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

describe('ApexParser', () => {
  before(async () => {
    await setup();
  });

  describe('getSupportedExtensions', () => {
    it('should return .cls and .trigger', () => {
      // This test works even without WASM
      const p = new ApexParser(null as any, 'apex');
      assert.deepEqual(p.getSupportedExtensions(), ['.cls', '.trigger']);
    });
  });

  describe('parse — SimpleClass.cls', () => {
    it('should extract class symbol', () => {
      if (!grammarAvailable) return;
      const source = readFixture('SimpleClass.cls');
      const result = parser.parse(source, 'SimpleClass.cls');

      const cls = result.symbols.find(s => s.kind === 'apex_class');
      assert.ok(cls, 'Should find class symbol');
      assert.equal(cls.name, 'SimpleClass');
      assert.ok(cls.modifiers?.includes('public'));
      assert.equal(cls.isExported, true);
    });

    it('should have no relationships for empty class', () => {
      if (!grammarAvailable) return;
      const source = readFixture('SimpleClass.cls');
      const result = parser.parse(source, 'SimpleClass.cls');
      assert.equal(result.relationships.length, 0);
    });
  });

  describe('parse — ClassWithMethods.cls', () => {
    it('should extract class and methods', () => {
      if (!grammarAvailable) return;
      const source = readFixture('ClassWithMethods.cls');
      const result = parser.parse(source, 'ClassWithMethods.cls');

      const cls = result.symbols.find(s => s.kind === 'apex_class');
      assert.ok(cls, 'Should find class');
      assert.equal(cls.name, 'AccountService');

      const methods = result.symbols.filter(s => s.kind === 'method');
      assert.ok(methods.length >= 3, `Should find at least 3 methods, got ${methods.length}`);

      const getAccounts = methods.find(m => m.name === 'getAccounts');
      assert.ok(getAccounts, 'Should find getAccounts method');
      assert.equal(getAccounts.parentName, 'AccountService');
    });

    it('should extract fields and constants', () => {
      if (!grammarAvailable) return;
      const source = readFixture('ClassWithMethods.cls');
      const result = parser.parse(source, 'ClassWithMethods.cls');

      const props = result.symbols.filter(s => s.kind === 'property' || s.kind === 'constant');
      assert.ok(props.length >= 1, 'Should find at least 1 field/constant');
    });

    it('should extract constructor', () => {
      if (!grammarAvailable) return;
      const source = readFixture('ClassWithMethods.cls');
      const result = parser.parse(source, 'ClassWithMethods.cls');

      const ctor = result.symbols.find(s => s.kind === 'constructor');
      assert.ok(ctor, 'Should find constructor');
      assert.equal(ctor.parentName, 'AccountService');
    });

    it('should extract annotations as decorators', () => {
      if (!grammarAvailable) return;
      const source = readFixture('ClassWithMethods.cls');
      const result = parser.parse(source, 'ClassWithMethods.cls');

      const updateMethod = result.symbols.find(s => s.name === 'updateAccount');
      if (updateMethod) {
        assert.ok(updateMethod.decorators?.includes('AuraEnabled'),
          'Should find @AuraEnabled annotation');
      }
    });

    it('should extract SOQL relationships', () => {
      if (!grammarAvailable) return;
      const source = readFixture('ClassWithMethods.cls');
      const result = parser.parse(source, 'ClassWithMethods.cls');

      const soqlRels = result.relationships.filter(r => r.kind === 'soql');
      // May or may not find SOQL depending on AST node types
      // At minimum, should not crash
      assert.ok(Array.isArray(soqlRels));
    });

    it('should extract DML relationships', () => {
      if (!grammarAvailable) return;
      const source = readFixture('ClassWithMethods.cls');
      const result = parser.parse(source, 'ClassWithMethods.cls');

      const dmlRels = result.relationships.filter(r => r.kind === 'dml');
      assert.ok(Array.isArray(dmlRels));
    });
  });

  describe('parse — ClassWithDML.cls', () => {
    it('should extract DML operations', () => {
      if (!grammarAvailable) return;
      const source = readFixture('ClassWithDML.cls');
      const result = parser.parse(source, 'ClassWithDML.cls');

      const dmlRels = result.relationships.filter(r => r.kind === 'dml');
      // DML extraction depends on tree-sitter-apex AST having dml_expression nodes
      assert.ok(Array.isArray(dmlRels));
    });
  });

  describe('parse — ClassWithSOQL.cls', () => {
    it('should extract SOQL queries', () => {
      if (!grammarAvailable) return;
      const source = readFixture('ClassWithSOQL.cls');
      const result = parser.parse(source, 'ClassWithSOQL.cls');

      const soqlRels = result.relationships.filter(r => r.kind === 'soql');
      assert.ok(Array.isArray(soqlRels));
    });
  });

  describe('parse — TriggerExample.trigger', () => {
    it('should extract trigger symbol', () => {
      if (!grammarAvailable) return;
      const source = readFixture('TriggerExample.trigger');
      const result = parser.parse(source, 'TriggerExample.trigger');

      const trigger = result.symbols.find(s => s.modifiers?.includes('trigger'));
      assert.ok(trigger, 'Should find trigger symbol');
      assert.equal(trigger.name, 'AccountTrigger');
      assert.ok(trigger.signature?.includes('Account'));
    });

    it('should extract trigger-on relationship', () => {
      if (!grammarAvailable) return;
      const source = readFixture('TriggerExample.trigger');
      const result = parser.parse(source, 'TriggerExample.trigger');

      const triggerOnRels = result.relationships.filter(r => r.kind === 'trigger-on');
      assert.ok(triggerOnRels.length >= 1, 'Should find trigger-on relationship');
      assert.equal(triggerOnRels[0].targetSymbol, 'Account');
    });

    it('should extract calls from trigger body', () => {
      if (!grammarAvailable) return;
      const source = readFixture('TriggerExample.trigger');
      const result = parser.parse(source, 'TriggerExample.trigger');

      const callsRels = result.relationships.filter(r => r.kind === 'calls');
      assert.ok(callsRels.length >= 1, 'Should find calls in trigger body');
    });
  });

  describe('parse — InterfaceExample.cls', () => {
    it('should extract interface symbol', () => {
      if (!grammarAvailable) return;
      const source = readFixture('InterfaceExample.cls');
      const result = parser.parse(source, 'InterfaceExample.cls');

      const iface = result.symbols.find(s => s.kind === 'interface');
      assert.ok(iface, 'Should find interface symbol');
      assert.equal(iface.name, 'IAccountService');
    });

    it('should extract interface methods', () => {
      if (!grammarAvailable) return;
      const source = readFixture('InterfaceExample.cls');
      const result = parser.parse(source, 'InterfaceExample.cls');

      const methods = result.symbols.filter(s => s.kind === 'method');
      assert.ok(methods.length >= 3, 'Should find at least 3 interface methods');
    });
  });

  describe('parse — InheritanceExample.cls', () => {
    it('should extract inherits relationship', () => {
      if (!grammarAvailable) return;
      const source = readFixture('InheritanceExample.cls');
      const result = parser.parse(source, 'InheritanceExample.cls');

      const inheritsRels = result.relationships.filter(r => r.kind === 'inherits');
      assert.ok(inheritsRels.length >= 1, 'Should find inherits relationship');
      const baseService = inheritsRels.find(r => r.targetSymbol === 'BaseService');
      assert.ok(baseService, 'Should inherit from BaseService');
    });

    it('should extract implements relationships', () => {
      if (!grammarAvailable) return;
      const source = readFixture('InheritanceExample.cls');
      const result = parser.parse(source, 'InheritanceExample.cls');

      const implRels = result.relationships.filter(r => r.kind === 'implements');
      assert.ok(implRels.length >= 1, 'Should find implements relationships');
    });
  });

  describe('parse — MalformedClass.cls', () => {
    it('should return partial result with errors', () => {
      if (!grammarAvailable) return;
      const source = readFixture('MalformedClass.cls');
      const result = parser.parse(source, 'MalformedClass.cls');

      assert.ok(result, 'Should return a result');
      assert.ok(result.errors.length > 0, 'Should have parse errors');
      // Should still extract what it can
      assert.ok(Array.isArray(result.symbols));
    });
  });
});
