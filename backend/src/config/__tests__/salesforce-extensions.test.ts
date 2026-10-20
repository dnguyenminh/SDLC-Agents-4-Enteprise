/**
 * SA4E-223 — DEFAULT_EXTENSIONS (Gate 2) must include the new Salesforce simple extensions.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadConfig } from '../index.js';

describe('DEFAULT_EXTENSIONS (SA4E-223)', () => {
  it('loadConfig default includeExtensions contains new Salesforce extensions', () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-cfg-'));
    try {
      const cfg = loadConfig({ workspace: ws });
      for (const e of ['.apex', '.soql', '.page', '.component', '.cmp', '.app', '.evt', '.intf', '.tokens']) {
        expect(cfg.includeExtensions).toContain(e);
      }
      // regression: legacy extensions preserved
      expect(cfg.includeExtensions).toContain('.cls');
      expect(cfg.includeExtensions).toContain('.trigger');
      expect(cfg.includeExtensions).not.toContain('.pega');
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });
});
