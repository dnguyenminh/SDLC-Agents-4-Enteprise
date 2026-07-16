/**
 * SA4E-41 UT — CodeIntelIsolation fail-closed policy.
 */

import { describe, it, expect } from 'vitest';
import { buildCodeScopeFilter, requireProjectId } from '../code-intel-isolation.js';

describe('SA4E-41 buildCodeScopeFilter (fail-closed)', () => {
  it('returns 1=0 with no params when projectId is undefined', () => {
    const f = buildCodeScopeFilter(undefined);
    expect(f.clause).toBe('1=0');
    expect(f.params).toEqual([]);
  });

  it('returns 1=0 when projectId is empty string', () => {
    const f = buildCodeScopeFilter('');
    expect(f.clause).toBe('1=0');
    expect(f.params).toEqual([]);
  });

  it('scopes to the tenant using the default alias', () => {
    const f = buildCodeScopeFilter('proj_abc');
    expect(f.clause).toBe('s.project_id = ?');
    expect(f.params).toEqual(['proj_abc']);
  });

  it('honors a custom table alias', () => {
    const f = buildCodeScopeFilter('proj_abc', 'files');
    expect(f.clause).toBe('files.project_id = ?');
    expect(f.params).toEqual(['proj_abc']);
  });
});

describe('SA4E-41 requireProjectId (writes fail loudly)', () => {
  it('throws PROJECT_REQUIRED when missing', () => {
    expect(() => requireProjectId(undefined)).toThrow(/PROJECT_REQUIRED/);
    expect(() => requireProjectId('')).toThrow(/PROJECT_REQUIRED/);
  });

  it('returns the id when present', () => {
    expect(requireProjectId('proj_abc')).toBe('proj_abc');
  });
});
