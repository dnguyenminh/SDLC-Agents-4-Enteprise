import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import {
  sanitizePathSegment,
  resolveSafeTargetPath,
  resolveIndexTempBase,
} from '../api-index';

vi.mock('../../../admin/db/sessions.js', () => ({
  validateSession: vi.fn(),
}));

vi.mock('../../../admin/admin-db.js', () => ({
  getUserPermissions: vi.fn(),
}));

vi.mock('../../middleware/jwt-auth.js', () => ({
  verifyJwtToken: vi.fn(),
  allowedProjectsFromClaims: vi.fn(),
}));

describe('SA4E-300 GAP 1 helpers', () => {
  it('sanitizePathSegment strips unsafe chars and falls back', () => {
    expect(sanitizePathSegment('../../etc', 'local-dev')).toBe('....etc');
    expect(sanitizePathSegment('', 'local-dev')).toBe('local-dev');
    expect(sanitizePathSegment('..', 'default')).toBe('default');
    expect(sanitizePathSegment('user@example.com', 'local-dev')).toBe('userexample.com');
    expect(sanitizePathSegment('proj-123_abc.def', 'default')).toBe('proj-123_abc.def');
  });

  it('resolveIndexTempBase uses cross-platform base (not hardcoded Windows)', () => {
    const base = resolveIndexTempBase('u1', 'p1', 'batch-docs');
    expect(base).not.toContain('C:\\projects\\kiro\\Temp');
    expect(base.endsWith(path.join('u1', 'p1', 'batch-docs'))).toBe(true);
  });

  it('resolveSafeTargetPath blocks traversal, absolute, backslash, encoded, drive', () => {
    const tempBase = path.join(os.tmpdir(), 'CodeIntel', 'u', 'p', 'batch-docs');
    expect(resolveSafeTargetPath(tempBase, '../evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, '/abs/evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, '..\\evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, 'a/../../evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, '%2e%2e/evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, 'C:\\evil.ts')).toBeNull();
    expect(resolveSafeTargetPath(tempBase, 'C:/evil.ts')).toBeNull();
    const ok = resolveSafeTargetPath(tempBase, 'docs/ok.md');
    expect(ok).not.toBeNull();
    expect(path.relative(tempBase, ok as string).startsWith('..')).toBe(false);
  });
});
