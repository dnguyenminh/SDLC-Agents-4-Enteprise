/**
 * ToolValidator unit tests — JSON Schema to Zod conversion and argument validation.
 */

import { describe, it, expect } from 'vitest';
import { ToolValidator } from '../ToolValidator.js';
import type { ToolDefinition } from '../../types/tool.js';

const validator = new ToolValidator();

function tool(schema: Record<string, unknown>): ToolDefinition {
  return { name: 't', description: 't', inputSchema: schema, category: 'code' };
}

describe('ToolValidator.validate', () => {
  it('returns null when args satisfy a required field', () => {
    const t = tool({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] });
    expect(validator.validate(t, { name: 'foo' })).toBeNull();
  });

  it('describes a missing required field', () => {
    const t = tool({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] });
    const err = validator.validate(t, {});
    expect(typeof err).toBe('string');
    expect(err).toContain('name');
    // zod v4 (SEC-04): missing-field message is "expected string, received undefined"
    // (v3 said "Required" — same intent, different wording).
    expect(err).toContain('received undefined');
  });

  it('describes a type mismatch', () => {
    const t = tool({ type: 'object', properties: { count: { type: 'number' } }, required: ['count'] });
    const err = validator.validate(t, { count: 'not-a-number' });
    expect(typeof err).toBe('string');
    expect(err).toContain('count');
  });

  it('accepts missing optional fields', () => {
    const t = tool({ type: 'object', properties: { name: { type: 'string' } }, required: [] });
    expect(validator.validate(t, {})).toBeNull();
  });

  it('rejects null for a present optional field (optional allows only undefined)', () => {
    const t = tool({ type: 'object', properties: { tag: { type: 'string' } }, required: [] });
    const err = validator.validate(t, { tag: null });
    expect(typeof err).toBe('string');
    expect(err).toContain('tag');
  });

  it('validates array-typed fields', () => {
    const t = tool({ type: 'object', properties: { items: { type: 'array', items: { type: 'number' } } }, required: ['items'] });
    expect(validator.validate(t, { items: [1, 2, 3] })).toBeNull();
    const err = validator.validate(t, { items: ['x'] });
    expect(typeof err).toBe('string');
    expect(err).toContain('items');
  });

  it('validates nested objects', () => {
    const t = tool({
      type: 'object',
      properties: { config: { type: 'object', properties: { deep: { type: 'boolean' } }, required: ['deep'] } },
      required: ['config'],
    });
    expect(validator.validate(t, { config: { deep: true } })).toBeNull();
    const err = validator.validate(t, { config: {} });
    expect(typeof err).toBe('string');
    expect(err).toContain('config.deep');
  });

  it('returns null when the schema is absent or not an object with properties', () => {
    const tNoSchema: ToolDefinition = { name: 't', description: 't', inputSchema: undefined as any, category: 'code' };
    expect(validator.validate(tNoSchema, { whatever: 1 })).toBeNull();
    expect(validator.validate(tool({ type: 'object' }), { whatever: 1 })).toBeNull();
  });

  it('falls back to unknown schema type without error', () => {
    const t = tool({ type: 'object', properties: { weird: { type: 'geojson' } }, required: [] });
    expect(validator.validate(t, { weird: { any: ['shape', 42] } })).toBeNull();
  });

  it('returns generic Invalid arguments message for non-Zod parse failures', () => {
    const args: Record<string, unknown> = {};
    Object.defineProperty(args, 'name', { get() { throw new Error('poisoned getter'); }, enumerable: true });
    const t = tool({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] });
    expect(validator.validate(t, args)).toBe('Invalid arguments');
  });
});