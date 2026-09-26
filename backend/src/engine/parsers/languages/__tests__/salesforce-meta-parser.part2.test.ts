/**
 * KSA-191: Salesforce Metadata Parser Unit Tests (part 2).
 * Covers LookupField, LWC metadata, malformed/empty input and the new
 * SA4E-223 metadata types. Split from salesforce-meta-parser.test.ts to keep
 * each file under the CI line-count gate (≤200 lines). No logic changed —
 * tests only relocated.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import SalesforceMetaParser from '../salesforce-meta-parser.js';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/salesforce-meta');

let parser: SalesforceMetaParser;

function setup(): void {
  // SalesforceMetaParser receives null as parser (no tree-sitter)
  parser = new SalesforceMetaParser(null, 'salesforce-meta');
}

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

setup();

describe('SalesforceMetaParser — part 2', () => {
  describe('parse — LookupField.field-meta.xml', () => {
    it('should extract standalone field', () => {
      const source = readFixture('LookupField.field-meta.xml');
      const result = parser.parse(source, 'force-app/main/default/objects/Case/fields/LookupField.field-meta.xml');

      const field = result.symbols.find(s => s.kind === 'sf_field');
      assert.ok(field, 'Should find field symbol');
      assert.equal(field.name, 'LookupField');
      assert.equal(field.returnType, 'Lookup');
    });

    it('should infer parent object from path', () => {
      const source = readFixture('LookupField.field-meta.xml');
      const result = parser.parse(source, 'force-app/main/default/objects/Case/fields/LookupField.field-meta.xml');

      const field = result.symbols.find(s => s.kind === 'sf_field');
      assert.equal(field?.parentName, 'Case');
    });

    it('should create uses relationship for Lookup field', () => {
      const source = readFixture('LookupField.field-meta.xml');
      const result = parser.parse(source, 'force-app/main/default/objects/Case/fields/LookupField.field-meta.xml');

      const usesRels = result.relationships.filter(r => r.kind === 'uses');
      assert.ok(usesRels.length >= 1, 'Should find uses relationship');
      assert.equal(usesRels[0].sourceSymbol, 'Case');
      assert.equal(usesRels[0].targetSymbol, 'Account');
    });
  });

  describe('parse — LWCMeta.js-meta.xml', () => {
    it('should extract LWC component', () => {
      const source = readFixture('LWCMeta.js-meta.xml');
      const result = parser.parse(source, 'force-app/main/default/lwc/LWCMeta/LWCMeta.js-meta.xml');

      const component = result.symbols.find(s => s.kind === 'lwc_component');
      assert.ok(component, 'Should find LWC component');
      assert.equal(component.name, 'LWCMeta');
      assert.ok(component.signature?.includes('LWC'));
      assert.ok(component.modifiers?.includes('exposed'));
      assert.equal(component.isExported, true);
    });
  });

  describe('parse — malformed XML', () => {
    it('should return error without crashing', () => {
      const malformed = '<broken><unclosed>';
      const result = parser.parse(malformed, 'test.flow-meta.xml');

      // Should not crash, may have empty results or errors
      assert.ok(result, 'Should return a result');
      assert.ok(Array.isArray(result.symbols));
      assert.ok(Array.isArray(result.relationships));
      assert.ok(Array.isArray(result.errors));
    });
  });

  describe('parse — empty file', () => {
    it('should handle empty source gracefully', () => {
      const result = parser.parse('', 'empty.flow-meta.xml');
      assert.ok(result, 'Should return a result');
      assert.equal(result.errors.length, 0);
    });
  });

  // ---- SA4E-223: 12 new metadata types (TC-08) ----
  describe('parse — new metadata types (SA4E-223)', () => {
    const newTypes = [
      { suffix: 'flexipage', prefix: 'Flexipage' },
      { suffix: 'permissionset', prefix: 'PermissionSet' },
      { suffix: 'profile', prefix: 'Profile' },
      { suffix: 'labels', prefix: 'Labels' },
      { suffix: 'tab', prefix: 'Tab' },
      { suffix: 'layout', prefix: 'Layout' },
      { suffix: 'report', prefix: 'Report' },
      { suffix: 'dashboard', prefix: 'Dashboard' },
      { suffix: 'site', prefix: 'Site' },
      { suffix: 'resource', prefix: 'StaticResource' },
      { suffix: 'email', prefix: 'EmailTemplate' },
      { suffix: 'testSuite', prefix: 'TestSuite' },
    ];

    for (const t of newTypes) {
      it(`should extract a top-level class symbol for ${t.suffix}-meta.xml`, () => {
        const result = parser.parse('', `force-app/x/${t.suffix}/Name.${t.suffix}-meta.xml`);
        const sym = result.symbols.find(s => s.kind === 'class');
        assert.ok(sym, `Should find class symbol for ${t.suffix}`);
        assert.equal(sym.name, 'Name');
        assert.ok(sym.signature?.startsWith(`${t.prefix}: `), `signature should start with ${t.prefix}`);
        assert.equal(sym.isExported, true);
      });
    }

    it('getSupportedExtensions returns all 17 suffixes (TC-07)', () => {
      const exts = parser.getSupportedExtensions();
      assert.equal(exts.length, 17);
      const all = ['flow', 'object', 'field', 'js', 'component', 'flexipage', 'permissionset',
        'profile', 'labels', 'tab', 'layout', 'report', 'dashboard', 'site', 'resource', 'email', 'testSuite'];
      for (const s of all) {
        assert.ok(exts.includes(`.${s}-meta.xml`), `Should support .${s}-meta.xml`);
      }
    });

    it('regression: legacy 5 meta types still parse (TC-10)', () => {
      let r = parser.parse(readFixture('SimpleFlow.flow-meta.xml'), 'flows/SimpleFlow.flow-meta.xml');
      assert.ok(r.symbols.find(s => s.kind === 'flow'), 'flow should parse');
      r = parser.parse(readFixture('CustomObject.object-meta.xml'), 'objects/O.object-meta.xml');
      assert.ok(r.symbols.find(s => s.kind === 'sf_object'), 'object should parse');
      r = parser.parse(readFixture('LookupField.field-meta.xml'), 'objects/Case/fields/L.field-meta.xml');
      assert.ok(r.symbols.find(s => s.kind === 'sf_field'), 'field should parse');
      r = parser.parse(readFixture('LWCMeta.js-meta.xml'), 'lwc/L/L.js-meta.xml');
      assert.ok(r.symbols.find(s => s.kind === 'lwc_component'), 'js-meta should parse');
    });

    it('degrades gracefully on malformed XML for new types', () => {
      const result = parser.parse('<broken><unclosed>', 'x.layout-meta.xml');
      assert.ok(result, 'Should return a result');
      assert.ok(Array.isArray(result.symbols));
      assert.ok(Array.isArray(result.errors));
    });

    it('F-03: never indexes secret element names', () => {
      const src = '<CustomLabels xmlns="x"><CustomLabel><fullName>password</fullName></CustomLabel><CustomLabel><fullName>OkLabel</fullName></CustomLabel></CustomLabels>';
      const result = parser.parse(src, 'labels/MyLabels.labels-meta.xml');
      const names = result.symbols.map(s => s.name);
      assert.ok(!names.includes('password'), 'password must not be indexed');
      assert.ok(names.includes('OkLabel'), 'normal label is indexed');
      assert.ok(result.symbols.find(s => s.kind === 'class'), 'top-level labels symbol present');
    });
  });
});
