import { describe, it, expect } from 'vitest';
import { estimateToolSchemaTokens } from '../tool-schema-tokens.js';

// STC: OI-4 (TDD §3.5) — estimateToolSchemaTokens contract (STC-406 basis)

describe('estimateToolSchemaTokens (OI-4 — SA4E-355 Task 4)', () => {
  it('respects precomputed schemaTokens (0 stays 0 for exact accounting)', () => {
    expect(estimateToolSchemaTokens({ name: 'read', schemaTokens: 0 })).toBe(0);
    expect(estimateToolSchemaTokens({ name: 'read', schemaTokens: 600 })).toBe(600);
  });

  it('estimates name + description + serialized schema at chars/4 (STC-406 basis)', () => {
    const t = { name: 'jira_get_issue', description: 'Fetch a Jira issue by key', schema: { type: 'object' } };
    const expected = Math.ceil(`${t.name}\n${t.description}\n${JSON.stringify(t.schema)}`.length / 4);
    expect(estimateToolSchemaTokens(t)).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('never throws on malformed schemas — falls back to a name-only estimate', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => estimateToolSchemaTokens({ name: 'weird', schema: circular })).not.toThrow();
    expect(estimateToolSchemaTokens({ name: 'weird', schema: circular })).toBeGreaterThan(0);
  });
});
