/**
 * Shared fixtures for injection pattern matcher tests.
 * Split from PatternMatcher.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — helpers relocated.
 */
import type { MatchContext } from '../injection/PatternMatcher.js';
import type { TaintPath } from '../types/index.js';

export const ctx: MatchContext = { filePath: 'src/foo.ts', functionName: 'handler', language: 'ts' };

export function makePath(overrides: Partial<TaintPath>): TaintPath {
  return {
    source: { variable: 'req', type: 'http_param', line: 2, expression: 'req' },
    sink: { function: 'db.query(', type: 'sql_query', line: 10, expression: 'db.query("SELECT * FROM users WHERE id = " + id)', paramIndex: 0 },
    chain: [],
    sanitized: false,
    length: 1,
    ...overrides,
  };
}
