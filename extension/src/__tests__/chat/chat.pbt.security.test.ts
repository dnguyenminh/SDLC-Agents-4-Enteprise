/**
 * SA4E-85 — Property-Based Tests for Chat Module (security & integrity).
 * (BR-18 split from chat.pbt.test.ts; assertions verbatim.)
 * Covers: hash reflexivity, dirty-file blocking, IPC endpoint gate, artifacts.
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { hashBuffer } from '../../chat/tools/fileHasher';
import { isLocalhostEndpoint } from '../../chat/ipc/serviceDiscovery';
import { detectArtifacts } from '../../chat/tools/ArtifactDetector';

/** PBT-CM-01: Hash reflexivity — same content always produces same hash */
describe('PBT-CM-01: Hash Reflexivity', () => {
  test('sha256 is reflexive for any content', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 10_000 }), (content) => {
        const buf = Buffer.from(content, 'utf-8');
        const h1 = hashBuffer(buf);
        const h2 = hashBuffer(buf);
        expect(h1).toBe(h2);
      }),
      { numRuns: 1000 },
    );
  });
});

/** PBT-CM-02: Dirty file always blocked — mutated content yields different hash */
describe('PBT-CM-02: Dirty File Always Blocked', () => {
  test('mutated file produces different hash', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10_000 }),
        fc.string({ minLength: 1, maxLength: 10_000 }),
        (original, modified) => {
          fc.pre(original !== modified);
          const hashOrig = hashBuffer(Buffer.from(original, 'utf-8'));
          const hashMod = hashBuffer(Buffer.from(modified, 'utf-8'));
          expect(hashOrig).not.toBe(hashMod);
        },
      ),
      { numRuns: 500 },
    );
  });
});

/** PBT-IPC-02: Non-localhost always rejected */
describe('PBT-IPC-02: Non-Localhost Always Rejected', () => {
  test('random non-localhost URLs are rejected', () => {
    fc.assert(
      fc.property(fc.webUrl(), (url) => {
        fc.pre(!url.includes('localhost') && !url.includes('127.0.0.1') && !url.includes('[::1]'));
        const wsUrl = url.replace(/^https?/, 'ws');
        expect(isLocalhostEndpoint(wsUrl)).toBe(false);
      }),
      { numRuns: 500 },
    );
  });
});

/** PBT-ART-01: Artifact regex matches known patterns */
describe('PBT-ART-01: Artifact Regex Matches', () => {
  const knownPaths = [
    'target/site/serenity/index.html',
    'coverage/index.html',
    'dist/bundle.html',
    'build/reports/test.html',
  ];

  test('known artifact paths always detected', () => {
    for (const p of knownPaths) {
      const results = detectArtifacts(`Output: ${p}`);
      expect(results.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('random non-path strings produce no false positives', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (s) => {
        fc.pre(!s.includes('target/') && !s.includes('build/') && !s.includes('dist/') && !s.includes('out/'));
        fc.pre(!s.includes('target\\') && !s.includes('build\\') && !s.includes('dist\\') && !s.includes('out\\'));
        const results = detectArtifacts(s);
        expect(results.length).toBe(0);
      }),
      { numRuns: 300 },
    );
  });
});
