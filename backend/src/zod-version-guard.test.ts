/**
 * SA4E-394 SEC-04: dependency guard for the zod HIGH advisory.
 *
 * GHSA-mrhx-c7xc-m3w5 (CVE-2023-54404, CWE-770): zod can exhaust memory
 * while validating oversized constrained collections. Affected < 4.6.6,
 * patched in 4.6.6. zod validates every MCP tool argument via ToolValidator,
 * so a vulnerable version is agent-triggerable DoS.
 *
 * This guard makes the upgrade intentional: any regression below the floor
 * (e.g. a transitive reintroducing zod@3.x as the hoisted copy) fails CI
 * instead of silently shipping the vulnerable resolution.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createRequire } from 'node:module';

const ZOD_SECURITY_FLOOR = '4.6.6'; // patched version of GHSA-mrhx-c7xc-m3w5

/** Compare dotted numeric versions (x.y[.z]) semantically, no extra deps. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// STC: SEC-04 — installed zod runtime version (the copy backend code resolves)
// must be >= 4.6.6, the patched release of GHSA-mrhx-c7xc-m3w5.
describe('zod security floor (GHSA-mrhx-c7xc-m3w5, SEC-04)', () => {
  it('resolves an installed zod >= 4.6.6 (not a vulnerable < 4.6.6 copy)', () => {
    const require = createRequire(import.meta.url);
    const installed: string = require('zod/package.json').version;
    expect(compareVersions(installed, ZOD_SECURITY_FLOOR)).toBeGreaterThanOrEqual(0);
  });

  it('schemas expose the zod-v4 `_zod` marker the MCP SDK compat layer keys on', () => {
    // backend registerTool() passes these schemas into @modelcontextprotocol/sdk:
    // its isZ4Schema() routes ONLY when `_zod` exists (otherwise it falls back
    // to the vendored zod-v3 converter and registerTool would misbehave).
    const probe = z.object({ a: z.string().optional(), m: z.record(z.string(), z.unknown()) });
    expect(probe).toHaveProperty('_zod');
  });

  // STC: SEC-04 — patch behavior: validating an oversized constrained
  // collection must finish with a BOUNDED issue list (CWE-770 / memory DoS).
  it('caps issues count when validating an oversized constrained collection', () => {
    const oversized = Array.from({ length: 200_000 }, (_, i) => (i % 2 === 0 ? 12345 : 'x'));
    const parsed = z.array(z.string()).max(10).safeParse(oversized);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.length).toBeLessThan(100);
    }
  });

  it('returns a v4 ZodError surface (issues array, not the removed v3 errors)', () => {
    const parsed = z.array(z.string()).max(2).safeParse(['a', 'b', 'c']);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(Array.isArray(parsed.error.issues)).toBe(true);
      expect((parsed.error as unknown as { errors?: unknown }).errors).toBeUndefined();
    }
  });
});
