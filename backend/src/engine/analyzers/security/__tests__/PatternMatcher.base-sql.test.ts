/**
 * KSA-165 — Unit tests for injection pattern matchers (base logic + SQL).
 * Covers PatternMatcher base logic plus the SQL injection matcher.
 * Split from PatternMatcher.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — tests only relocated.
 */

import { describe, it, expect } from 'vitest';
import { PatternMatcher } from '../injection/PatternMatcher.js';
import { SQLInjectionMatcher } from '../injection/patterns/SQLInjectionMatcher.js';
import { ctx, makePath } from './PatternMatcher.helpers.js';

describe('PatternMatcher base', () => {
  it('returns null when sink does not match any pattern', () => {
    const matcher = new SQLInjectionMatcher();
    const path = makePath({ sink: { function: 'foo(', type: 'sql_query', line: 10, expression: 'foo()', paramIndex: 0 } });
    expect(matcher.match(path, ctx)).toBeNull();
  });

  it('returns null when no dangerous operation is present', () => {
    const matcher = new SQLInjectionMatcher();
    const path = makePath(); // chain empty => no dangerous op
    expect(matcher.match(path, ctx)).toBeNull();
  });

  it('returns null when a safe pattern is present in the sink expression', () => {
    const matcher = new SQLInjectionMatcher();
    const path = makePath({
      sink: { function: 'db.query(', type: 'sql_query', line: 10, expression: 'db.query("SELECT " + allowedColumns + " WHERE id = ?", [id])', paramIndex: 0 },
      chain: [{ variable: 'id', line: 3, action: 'concat', expression: 'id' }],
    });
    // pattern 1 safe (`?`), pattern 3 safe (`allowedColumns`) → no SQL pattern matches
    expect(matcher.match(path, ctx)).toBeNull();
  });

  it('returns a finding with correct shape on match', () => {
    const matcher = new SQLInjectionMatcher();
    const path = makePath({
      chain: [{ variable: 'q', line: 3, action: 'concat', expression: 'q' }],
    });
    const finding = matcher.match(path, ctx);
    expect(finding).not.toBeNull();
    expect(finding!.category).toBe('sql_injection');
    expect(finding!.severity).toBe('Critical');
    expect(finding!.cwe).toBe('CWE-89');
    expect(finding!.ruleId).toContain('INJ-SQL_INJECTION');
    expect(finding!.location).toEqual({ file: 'src/foo.ts', startLine: 2, endLine: 10 });
    expect(finding!.id).toContain('src/foo.ts:10');
    expect(finding!.suppressed).toBe(false);
  });

  it('computes confidence from path length', () => {
    const matcher = new SQLInjectionMatcher();
    const short = makePath({ chain: [{ variable: 'q', line: 3, action: 'concat', expression: 'q' }], length: 2 });
    expect(matcher.match(short, ctx)!.confidence).toBe('High');
    const medium = makePath({ chain: Array.from({ length: 4 }, () => ({ variable: 'q', line: 3, action: 'concat', expression: 'q' })), length: 5 });
    expect(matcher.match(medium, ctx)!.confidence).toBe('Medium');
    const long = makePath({ chain: Array.from({ length: 8 }, () => ({ variable: 'q', line: 3, action: 'concat', expression: 'q' })), length: 9 });
    expect(matcher.match(long, ctx)!.confidence).toBe('Low');
  });

  it('treats empty dangerousOps as matching any path', () => {
    class PermissiveMatcher extends PatternMatcher {
      readonly category = 'test';
      readonly patterns = [{
        id: 99, name: 'no op', category: 'test', cwe: 'CWE-0', severity: 'Low',
        sinkPatterns: ['foo('], dangerousOps: [], safePatterns: [], description: 'd',
      }];
    }
    const matcher = new PermissiveMatcher();
    const path = makePath({ sink: { function: 'foo(', type: 'sql_query', line: 10, expression: 'foo()', paramIndex: 0 } });
    expect(matcher.match(path, ctx)).not.toBeNull();
  });
});

describe('SQLInjectionMatcher', () => {
  it('matches template literal into query', () => {
    const matcher = new SQLInjectionMatcher();
    const path = makePath({
      sink: { function: 'query(', type: 'sql_query', line: 10, expression: 'query(`SELECT * FROM users WHERE id=${id}`)', paramIndex: 0 },
      chain: [{ variable: 'q', line: 3, action: 'template_literal', expression: 'q' }],
    });
    expect(matcher.match(path, ctx)).not.toBeNull();
  });

  it('matches ORM raw query with concat', () => {
    const matcher = new SQLInjectionMatcher();
    const path = makePath({
      sink: { function: 'prisma.$queryRaw', type: 'sql_query', line: 10, expression: 'prisma.$queryRaw("SELECT ..." + userInput)', paramIndex: 0 },
      chain: [{ variable: 'q', line: 3, action: 'concat', expression: 'q' }],
    });
    const finding = matcher.match(path, ctx);
    expect(finding).not.toBeNull();
    expect(finding!.pattern.id).toBe(4);
  });
});
