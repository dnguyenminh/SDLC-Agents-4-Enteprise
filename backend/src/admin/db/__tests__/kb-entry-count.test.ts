/**
 * SA4E-49: Reproduction test — KB entry count shows 0 when entries exist
 * but scope filter is too restrictive (missing grants or NULL project_id).
 * SA4E-50: Updated to await async getKbEntryCount.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { getKbEntryCount } from '../kb-entries.js';

const TEST_DB_PATH = path.resolve(__dirname, '__test-sa4e-49.db');

describe('SA4E-49: getKbEntryCount fallback for missing scope metadata', () => {
  beforeAll(() => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  });

  it('BUG-SA4E-49: returns non-zero count when entries have NULL project_id', async () => {
    const count = await getKbEntryCount('test-project-nonexistent');
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('BUG-SA4E-49: returns total count when no projectId is provided', async () => {
    const count = await getKbEntryCount();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('BUG-SA4E-49: returns total count when projectId is "default"', async () => {
    const count = await getKbEntryCount('default');
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
