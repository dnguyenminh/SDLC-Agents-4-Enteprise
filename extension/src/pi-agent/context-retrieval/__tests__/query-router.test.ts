import { describe, it, expect } from 'vitest';
import { QueryRouter } from '../../query-router';

describe('QueryRouter', () => {
  const router = new QueryRouter();

  describe('TC-704: Intent Classification Integration', () => {
    it('classifies LOCAL intent for fix/review queries', () => {
      expect(router.classify('fix the bug in auth flow').intent).toBe('LOCAL');
      expect(router.classify('review function createSession').intent).toBe('LOCAL');
    });

    it('classifies GLOBAL intent for whole-repo queries', () => {
      expect(router.classify('explain the architecture of this project').intent).toBe('GLOBAL');
      expect(router.classify('give me an overview').intent).toBe('GLOBAL');
      expect(router.classify('how does the system work').intent).toBe('GLOBAL');
    });

    it('classifies STRUCTURAL intent for structure queries', () => {
      expect(router.classify('show the project structure').intent).toBe('STRUCTURAL');
      expect(router.classify('where is createSession defined').intent).toBe('STRUCTURAL');
      expect(router.classify('list all files').intent).toBe('STRUCTURAL');
    });
  });

  it('UNKNOWN_INTENT falls back to LOCAL', () => {
    const result = router.classify('zzz qqq xyzzy');
    expect(result.intent).toBe('LOCAL');
    expect(result.confidence).toBeLessThan(1);
  });

  it('empty query falls back to LOCAL', () => {
    expect(router.classify('').intent).toBe('LOCAL');
    expect(router.classify('   ').intent).toBe('LOCAL');
  });

  it('returns confidence 1 for pattern matches', () => {
    expect(router.classify('explain the architecture').confidence).toBe(1);
  });
});
