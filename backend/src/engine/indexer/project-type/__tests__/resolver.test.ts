/**
 * SA4E-108 — Unit tests for IndexingStrategyResolver.
 * Covers: UT-03, UT-04, UT-08
 */
import { describe, it, expect } from 'vitest';
import { IndexingStrategyResolver } from '../resolver.js';
import type { DetectionResult } from '../models.js';

const resolver = new IndexingStrategyResolver();
const DETECTION: DetectionResult = {
  project_type: 'java-maven', build_tool: 'maven', confidence: 0.9,
  detected_files: ['pom.xml'], source_roots: ['src/main/java/'],
  test_roots: ['src/test/java/'], exclude_patterns: ['target/', '.mvn/'],
  extensions: ['.java', '.xml'], is_mono_repo: false,
};

describe('IndexingStrategyResolver', () => {
  it('UT-03: merges base excludes with type excludes', () => {
    const config = resolver.resolve(DETECTION);
    expect(config.excludePatterns).toContain('.git');
    expect(config.excludePatterns).toContain('target/');
  });

  it('UT-04: sets scanOrder to source_first', () => {
    expect(resolver.resolve(DETECTION).scanOrder).toBe('source_first');
  });

  it('UT-08: getFallback returns defaults', () => {
    const config = resolver.getFallback();
    expect(config.scanOrder).toBe('default');
    expect(config.sourceRoots).toEqual([]);
    expect(config.excludePatterns.length).toBeGreaterThan(0);
  });

  it('passes sourceRoots and testRoots', () => {
    const config = resolver.resolve(DETECTION);
    expect(config.sourceRoots).toEqual(['src/main/java/']);
    expect(config.testRoots).toEqual(['src/test/java/']);
  });

  it('SA4E-223: getFallback includes new Salesforce extensions', () => {
    const exts = resolver.getFallback().includeExtensions;
    for (const e of ['.apex', '.soql', '.page', '.component', '.cmp', '.app', '.evt', '.intf', '.tokens', '.cls', '.trigger']) {
      expect(exts).toContain(e);
    }
    expect(exts).not.toContain('.pega');
  });
});
