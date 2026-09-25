/**
 * SA4E-261 Contract guard: extension glob and backend FALLBACK_EXTENSIONS must match.
 */
import { describe, it, expect } from 'vitest';
import { FALLBACK_EXTENSIONS } from '../../src/engine/indexer/project-type/resolver.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('SA4E-261 unified extensions contract', () => {
  it('backend FALLBACK_EXTENSIONS contains all required unified extensions', () => {
    const required = [
      'ts','tsx','js','jsx','kt','java','py','go','rs','c','cpp','h','hpp','cs','php','rb','scala','swift',
      'cls','trigger','apex','soql','page','component','cmp','app','evt','intf','tokens','pega',
      'html','jsp','xml','sql','properties','yml','yaml','css'
    ];
    const backendSet = new Set(FALLBACK_EXTENSIONS.map(e => e.replace(/^\./,'').toLowerCase()));
    required.forEach(ext => {
      expect(backendSet.has(ext)).toBe(true);
    });
  });

  it('extension glob pattern includes unified extensions', () => {
    const filePath = join(process.cwd(), '../extension/src/services/IndexerHttpClient.ts');
    // relative to backend tests
    const content = readFileSync(filePath, 'utf-8');
    // Check that UNIFIED_EXTENSIONS import exists and pattern uses it
    expect(content).toContain('UNIFIED_EXTENSIONS');
    expect(content).toContain('**/*.{${UNIFIED_EXTENSIONS.join');
  });
});
