/**
 * SA4E-369 — AC7 regression gate: the peer module is IN-PROCESS ONLY
 * (TDD §4.2, BR-12). No peer source may import or reference any socket /
 * network surface — all peer state is in-memory and the only outbound seam
 * is the session-host gateway interface, never a wire. Scan-based: any
 * import/require of a network module (bare or node:-prefixed) or any
 * browser network API reference is a violation.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PEER_DIR = path.resolve(__dirname, '../../pi-workflow/peer');
// Peer runtime sources — *.test.ts excluded (test code is not runtime surface).
const PEER_SOURCES = fs
  .readdirSync(PEER_DIR, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith('.ts') && !d.name.endsWith('.test.ts'))
  .map((d) => path.join(PEER_DIR, d.name));

/**
 * Static / dynamic import / re-export / require of the AC7-forbidden
 * network modules (bare or node:-prefixed, incl. subpath imports). The
 * lazy `[^'"`]*?from` crosses lines so multi-line named-import statements
 * are caught too — as in schema-description-scan, comments count as hits
 * (code-agnostic guard).
 */
const NETWORK_IMPORT_RE =
  /(?:import\s+[^'"`]*?from\s*|import\s*\(\s*|import\s*['"`]|export\s+[^'"`]*?from\s*|require\s*\(\s*)['"`](?:node:)?(net|http|https|dgram|ws|socket\.io)(?:\/[\w.@-]+)*['"`]/;
/** Browser network APIs — peer/ must never touch them (node in-process only). */
const NETWORK_API_RES: Array<RegExp> = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/];

describe('AC7 — peer module has no network surface', () => {
  it('imports no socket/network module (node:|bare net/http/https/dgram/ws/socket.io)', () => {
    expect(PEER_SOURCES.length).toBeGreaterThan(0);
    const violations = PEER_SOURCES.flatMap((file) => {
      const text = fs.readFileSync(file, 'utf-8');
      return [...text.matchAll(new RegExp(NETWORK_IMPORT_RE.source, 'g'))].map((m) => {
        const line = text.slice(0, m.index ?? 0).split('\n').length;
        return `${path.basename(file)}:${line}: imports '${m[1]}'`;
      });
    });
    expect(violations).toEqual([]);
  });

  it('references no fetch()/XMLHttpRequest browser-network API', () => {
    const violations = PEER_SOURCES.flatMap((file) => {
      const text = fs.readFileSync(file, 'utf-8');
      return NETWORK_API_RES.filter((re) => re.test(text)).map(
        (re) => `${path.basename(file)}: references ${String(re)}`,
      );
    });
    expect(violations).toEqual([]);
  });
});
