/**
 * SA4E-88 — Unit tests for PegaHashCache (hash detection + pruning).
 */

import { describe, it, expect } from 'vitest';
import { computeHash, compareFileHash, pruneStaleEntries, type HashCacheData } from '../PegaHashCache.js';

describe('PegaHashCache', () => {
  it('computeHash returns consistent SHA-256 hex', () => {
    const hash1 = computeHash('hello world');
    const hash2 = computeHash('hello world');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('computeHash detects content changes', () => {
    const hash1 = computeHash('version-1');
    const hash2 = computeHash('version-2');
    expect(hash1).not.toBe(hash2);
  });

  it('compareFileHash marks new file as changed', () => {
    const cache: HashCacheData = { version: 1, entries: {} };
    const result = compareFileHash('rule.pega.json', '{}', cache);
    expect(result.changed).toBe(true);
  });

  it('compareFileHash marks unchanged file correctly', () => {
    const content = '{"pxObjClass":"Rule-Obj-Activity"}';
    const hash = computeHash(content);
    const cache: HashCacheData = { version: 1, entries: { 'rule.pega.json': hash } };
    const result = compareFileHash('rule.pega.json', content, cache);
    expect(result.changed).toBe(false);
  });

  it('compareFileHash marks modified file as changed', () => {
    const cache: HashCacheData = { version: 1, entries: { 'rule.pega.json': 'oldhash' } };
    const result = compareFileHash('rule.pega.json', '{"modified":true}', cache);
    expect(result.changed).toBe(true);
  });

  it('pruneStaleEntries removes entries not seen in the current run', () => {
    const cache: HashCacheData = {
      version: 1,
      entries: { 'a.json': 'h1', 'b.json': 'h2', 'gone.json': 'h3' },
    };
    const removed = pruneStaleEntries(cache, new Set(['a.json', 'b.json']));
    expect(removed).toBe(1);
    expect(Object.keys(cache.entries).sort()).toEqual(['a.json', 'b.json']);
    expect(cache.entries['gone.json']).toBeUndefined();
  });
});
