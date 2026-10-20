/**
 * JavaParser unit tests — Annotations.java describe block.
 * Split from java-parser.test.ts to keep each file under the CI line-count
 * gate (<=200 lines). No logic changed — tests only relocated; registered by
 * java-parser.test.ts via registerAnnotationsCases().
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type JavaParser from '../java-parser.js';
import { parseFixture } from './java-parser.fixtures.js';

export function registerAnnotationsCases(deps: {
  parser: () => JavaParser;
  grammarAvailable: () => boolean;
}): void {
  const { grammarAvailable } = deps;

  describe('parse — Annotations.java', () => {
    it('should extract annotations on classes', () => {
      if (!grammarAvailable()) return;
      const result = parseFixture('Annotations.java');

      const controller = result.symbols.find(s => s.name === 'UserController');
      assert.ok(controller, 'Should find UserController');
      assert.ok(controller.decorators?.includes('RestController'));
    });

    it('should extract annotations on methods', () => {
      if (!grammarAvailable()) return;
      const result = parseFixture('Annotations.java');

      const getUser = result.symbols.find(s => s.name === 'getUser');
      assert.ok(getUser, 'Should find getUser method');
      assert.ok(getUser.decorators?.includes('GetMapping'));
    });

    it('should extract record declarations', () => {
      if (!grammarAvailable()) return;
      const result = parseFixture('Annotations.java');

      const record = result.symbols.find(s => s.name === 'UserRecord');
      assert.ok(record, 'Should find UserRecord');
      assert.equal(record.kind, 'class');
      assert.ok(record.modifiers?.includes('record'));
    });

    it('should extract interfaces', () => {
      if (!grammarAvailable()) return;
      const result = parseFixture('Annotations.java');

      const iface = result.symbols.find(s => s.name === 'UserRepository');
      assert.ok(iface, 'Should find UserRepository interface');
      assert.equal(iface.kind, 'interface');

      // Should have extends relationship
      const inherits = result.relationships.find(
        r => r.sourceSymbol === 'UserRepository' && r.kind === 'inherits'
      );
      assert.ok(inherits, 'Should find extends JpaRepository');
    });

    it('should extract enums', () => {
      if (!grammarAvailable()) return;
      const result = parseFixture('Annotations.java');

      const enumType = result.symbols.find(s => s.name === 'UserRole');
      assert.ok(enumType, 'Should find UserRole enum');
      assert.equal(enumType.kind, 'enum');
    });

    it('should create decorator relationships for annotations', () => {
      if (!grammarAvailable()) return;
      const result = parseFixture('Annotations.java');

      const decorates = result.relationships.filter(r => r.kind === 'decorates');
      assert.ok(decorates.length > 0, 'Should find decorator relationships');

      const restController = decorates.find(r => r.targetSymbol === 'RestController');
      assert.ok(restController, 'Should find @RestController decorator relationship');
    });
  });
}
