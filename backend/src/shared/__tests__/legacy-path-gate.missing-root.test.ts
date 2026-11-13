/** SA4E-393 SEC-WT-25 — legacy gate fails closed when the root cannot be realpath-ed; error text unchanged. */
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveLegacyRead } from '../legacy-path-gate.js';
import { makeTmp, cleanupTmp } from '../worktree-trust/__tests__/worktree-fixture.js';

afterAll(cleanupTmp);

describe('legacy gate with a non-existent root (SEC-WT-25)', () => {
  it('absolute path under a missing pinned root is rejected with the unchanged containment message', () => {
    const missing = path.join(makeTmp(), 'does-not-exist');
    const target = path.join(missing, 'a.md');
    const r = resolveLegacyRead({ pinnedRoot: missing, allowlistRoots: [], filePath: target });
    expect(r).toMatchObject({ ok: false, code: 'PATH_REJECTED_OUTSIDE_ALLOWLIST' });
    if (r.ok) return;
    expect(r.message).toBe(
      `PATH_REJECTED_OUTSIDE_ALLOWLIST: Resolved path '${target}' is outside workspace root '${path.resolve(missing)}'`,
    );
    expect(r.resolvedPath).toBe('');
  });
  it('a path outside every root keeps the same message template', () => {
    const root = makeTmp(); const other = path.join(makeTmp(), 'x.md');
    const r = resolveLegacyRead({ pinnedRoot: root, allowlistRoots: [], filePath: other });
    expect(r).toMatchObject({ ok: false, message: `PATH_REJECTED_OUTSIDE_ALLOWLIST: Resolved path '${other}' is outside workspace root '${root}'` });
  });
});
