/**
 * SA4E-261 Contract guard: extension glob and backend FALLBACK_EXTENSIONS must match.
 */
import { describe, it, expect } from 'vitest';
import { FALLBACK_EXTENSIONS } from '../../src/engine/indexer/project-type/resolver.js';
import { readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

describe('SA4E-261 unified extensions contract', () => {
  it('backend FALLBACK_EXTENSIONS contains all required unified extensions', () => {
    // SA4E-374: 'pega' removed from backend FALLBACK_EXTENSIONS (SRP — extension handles Pega routing)
    const required = [
      'ts','tsx','js','jsx','kt','java','py','go','rs','c','cpp','h','hpp','cs','php','rb','scala','swift',
      'cls','trigger','apex','soql','page','component','cmp','app','evt','intf','tokens',
      'html','jsp','xml','sql','properties','yml','yaml','css'
    ];
    const backendSet = new Set(FALLBACK_EXTENSIONS.map(e => e.replace(/^\./,'').toLowerCase()));
    required.forEach(ext => {
      expect(backendSet.has(ext)).toBe(true);
    });
  });

  it('extension glob pattern includes unified extensions', () => {
    // BR-18 split: the glob-building logic moved out of the IndexerHttpClient
    // facade. The contract now guards every file that assembles the glob:
    //   - services/unified-extensions.ts — defines UNIFIED_EXTENSIONS
    //   - src/indexer-http.ts and services/IndexerHttpClientChain/upload-api.ts
    //     — the two glob builders (must interpolate UNIFIED_EXTENSIONS)
    // Resolve from this test file's location (import.meta.url) — robust regardless of npm workspace cwd.
    const __filename = fileURLToPath(import.meta.url);
    const repoRoot = resolve(dirname(__filename), '../../..');
    const extRoot = join(repoRoot, 'extension', 'src');
    const unified = readFileSync(join(extRoot, 'services/unified-extensions.ts'), 'utf-8');
    expect(unified).toContain('export const UNIFIED_EXTENSIONS');

    for (const globOwner of ['indexer-http.ts', 'services/IndexerHttpClientChain/upload-api.ts']) {
      const content = readFileSync(join(extRoot, globOwner), 'utf-8');
      expect(content, globOwner).toContain('UNIFIED_EXTENSIONS');
      expect(content, globOwner).toContain('**/*.{${UNIFIED_EXTENSIONS.join');
    }
  });
});
