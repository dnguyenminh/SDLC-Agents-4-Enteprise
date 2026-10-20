/**
 * SA4E-122: Continuous Learning v2 — unit tests.
 * This file: handleLearn dispatcher.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryEngine } from '../engine/core.js';
import { handleLearn } from '../dispatchers/learning.js';
import { createLearningTestEngine } from './fixtures.js';

describe('handleLearn dispatcher', () => {
  let engine: MemoryEngine;

  beforeEach(async () => {
    engine = await createLearningTestEngine();
  });

  it('should return error for empty transcript on analyze', async () => {
    const result = await handleLearn(engine, undefined, { action: 'analyze', transcript: '' });
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain('transcript is required');
  });

  it('should analyze transcript and return results', async () => {
    const transcript = `[user]
Build crashed with error exception
---
[assistant]
Found the fix. The solution resolved the issue.`;

    const result = await handleLearn(engine, undefined, { action: 'analyze', transcript });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('ok');
    expect(parsed.action).toBe('analyze');
    expect(parsed.ingestedCount).toBeGreaterThan(0);
  });

  it('should handle cluster action', async () => {
    const result = await handleLearn(engine, undefined, { action: 'cluster' });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('ok');
    expect(parsed.action).toBe('cluster');
    expect(parsed.clustersFound).toBe(0);
  });

  it('should return error for unknown action', async () => {
    const result = await handleLearn(engine, undefined, { action: 'invalid' });
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain('Unknown action');
  });

  it('should default to analyze action', async () => {
    const transcript = `[user]
Got a crash exception error in build
---
[assistant]
The fix resolved the bug issue.`;
    const result = await handleLearn(engine, undefined, { transcript });
    const parsed = JSON.parse(result);
    expect(parsed.action).toBe('analyze');
  });
});
