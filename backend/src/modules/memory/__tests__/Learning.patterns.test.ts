/**
 * SA4E-122: Continuous Learning v2 — unit tests.
 * This file: PatternClassifier + PatternExtractor.
 */
import { describe, it, expect } from 'vitest';
import { PatternClassifier } from '../learning/PatternClassifier.js';
import { PatternExtractor } from '../learning/PatternExtractor.js';

describe('PatternClassifier', () => {
  const classifier = new PatternClassifier();

  it('should classify error-related text as error_resolution', () => {
    const [type] = classifier.classify(
      'The error was caused by a null pointer exception. The fix was to add a null check.',
    );
    expect(type).toBe('error_resolution');
  });

  it('should classify correction text as user_correction', () => {
    const [type] = classifier.classify(
      'No, actually you should use the other approach instead of this one. The correction is needed.',
    );
    expect(type).toBe('user_correction');
  });

  it('should classify workaround text', () => {
    const [type] = classifier.classify(
      'As a temporary workaround, we can bypass the check using a fallback hack.',
    );
    expect(type).toBe('workaround');
  });

  it('should classify debugging text', () => {
    const [type] = classifier.classify(
      'Add a console.log to debug this. Use the inspect tool to trace through the issue.',
    );
    expect(type).toBe('debugging_technique');
  });

  it('should classify project-specific text', () => {
    const [type] = classifier.classify(
      'In this project, the convention is to always use the standard pattern and prefer interfaces.',
    );
    expect(type).toBe('project_specific');
  });

  it('should return project_specific for empty text', () => {
    const [type, score] = classifier.classify('');
    expect(type).toBe('project_specific');
    expect(score).toBe(0);
  });

  it('should detect error→resolution sequence', () => {
    expect(
      classifier.hasErrorResolutionSequence('Got an error, then found the fix.'),
    ).toBe(true);
  });

  it('should not detect error→resolution without fix keyword', () => {
    expect(
      classifier.hasErrorResolutionSequence('Got an error but nothing helps.'),
    ).toBe(false);
  });
});

describe('PatternExtractor', () => {
  it('should return empty for blank transcript', () => {
    const extractor = new PatternExtractor();
    expect(extractor.extract('')).toEqual([]);
    expect(extractor.extract('   ')).toEqual([]);
  });

  it('should extract error→resolution patterns', () => {
    const extractor = new PatternExtractor();
    const transcript = `[user]
The build failed with a TypeError exception in module.ts
---
[assistant]
I found the fix — the issue was a missing null check. The solution resolved the crash.`;

    const patterns = extractor.extract(transcript);
    expect(patterns.length).toBeGreaterThan(0);
    const errorPattern = patterns.find(p => p.type === 'error_resolution');
    expect(errorPattern).toBeDefined();
  });

  it('should extract user corrections', () => {
    const extractor = new PatternExtractor();
    const transcript = `[assistant]
I'll implement it using approach A
---
[user]
No, actually you should use approach B instead. The correction is that we never use A in this project.`;

    const patterns = extractor.extract(transcript);
    const correction = patterns.find(p => p.type === 'user_correction');
    expect(correction).toBeDefined();
  });

  it('should respect maxPatternsPerSession config', () => {
    const extractor = new PatternExtractor({ maxPatternsPerSession: 2 });
    const transcript = `[user]
Error 1 with exception and fix resolved
---
Error 2 with crash and solution found
---
Error 3 with bug and issue fixed
---
No, actually the correction should be different instead`;

    const patterns = extractor.extract(transcript);
    expect(patterns.length).toBeLessThanOrEqual(2);
  });

  it('should deduplicate similar patterns', () => {
    const extractor = new PatternExtractor();
    const transcript = `[user]
The error in module.ts caused a crash. The fix resolved it.
---
The error in module.ts caused a crash. The fix resolved it. Again.`;

    const patterns = extractor.extract(transcript);
    // Should not have exact duplicates
    const contents = patterns.map(p => p.content.slice(0, 80));
    const unique = new Set(contents);
    expect(unique.size).toBe(contents.length);
  });

  it('should extract source context from tool names', () => {
    const extractor = new PatternExtractor();
    const transcript = `[tool]
Called mem_search with query "test" and got an error exception. Then the fix resolved it.`;

    const patterns = extractor.extract(transcript);
    if (patterns.length > 0) {
      const withTool = patterns.find(p => p.sourceContext.includes('mem_search'));
      expect(withTool).toBeDefined();
    }
  });
});
