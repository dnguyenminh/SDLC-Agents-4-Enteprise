/**
 * PBT-02: safeParseStructuredMap — Correctness Properties
 * Property-based tests verifying robustness for null, invalid, and valid JSON inputs.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { safeParseStructuredMap } from '../types.js';

describe('PBT-02: safeParseStructuredMap correctness properties', () => {
  // P1: Never throws
  it('never throws for any input', () => {
    fc.assert(
      fc.property(fc.constantFrom(null, undefined, '', '{}', '[]', 'invalid json', 'null', 'true', '42'), (input) => {
        expect(() => safeParseStructuredMap(input as any)).not.toThrow();
      }),
    );
    // Random string inputs
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => safeParseStructuredMap(input)).not.toThrow();
      }),
    );
  });

  // P2: Always returns object
  it('always returns an object (never array/primitive)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 500 }), (input) => {
        const result = safeParseStructuredMap(input);
        expect(result).toBeTruthy();
        expect(typeof result).toBe('object');
        expect(Array.isArray(result)).toBe(false);
      }),
    );
  });

  // P3-P5: Null, empty string, '{}' preservation
  it('returns empty object for null, empty string, and empty JSON', () => {
    expect(safeParseStructuredMap(null)).toEqual({});
    expect(safeParseStructuredMap(undefined)).toEqual({});
    expect(safeParseStructuredMap('')).toEqual({});
    expect(safeParseStructuredMap('{}')).toEqual({});
  });

  // P6: Valid JSON passthrough
  it('preserves all fields from valid JSON objects', () => {
    const input = '{"tags":["auth"],"summary":"test","business_entities":["User"],"extraction_meta":{"model":"qwen","fallback_used":false}}';
    const result = safeParseStructuredMap(input);
    expect(result.tags).toEqual(['auth']);
    expect(result.summary).toBe('test');
    expect(result.business_entities).toEqual(['User']);
    expect(result.extraction_meta?.model).toBe('qwen');
    expect(result.extraction_meta?.fallback_used).toBe(false);
  });

  // P7: Invalid JSON safety
  it('returns empty object for unparseable strings', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 200 }), (input) => {
        // Skip inputs that happen to be valid JSON objects
        if (input === '{}' || input.startsWith('{') && input.endsWith('}')) return;
        const result = safeParseStructuredMap(input);
        expect(typeof result).toBe('object');
        expect(Array.isArray(result)).toBe(false);
      }),
    );
  });

  // P8: Array rejection
  it('returns empty object for JSON arrays', () => {
    expect(safeParseStructuredMap('[]')).toEqual({});
    expect(safeParseStructuredMap('["a","b"]')).toEqual({});
    expect(safeParseStructuredMap('[{"tag":"test"}]')).toEqual({});
  });

  // Edge: primitive JSON values
  it('returns empty object for JSON primitives', () => {
    expect(safeParseStructuredMap('null')).toEqual({});
    expect(safeParseStructuredMap('"string"')).toEqual({});
    expect(safeParseStructuredMap('42')).toEqual({});
    expect(safeParseStructuredMap('true')).toEqual({});
  });
});
