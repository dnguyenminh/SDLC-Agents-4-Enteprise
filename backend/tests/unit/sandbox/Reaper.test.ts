import { describe, it, expect } from 'vitest';
import { Reaper } from '../../../src/modules/sandbox/Reaper.js';
import { createMockLogger } from './mockLogger.js';

describe('Reaper', () => {
  it('invokes manager.reapExpired on its interval and stops cleanly', async () => {
    let calls = 0;
    const manager = { reapExpired: async () => {
      calls++;
      return 0;
    } } as any;
    const reaper = new Reaper(createMockLogger(), manager, 30);
    reaper.start();
    expect(reaper.running).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    reaper.stop();
    expect(reaper.running).toBe(false);
    expect(calls).toBeGreaterThanOrEqual(1);
  });
});
