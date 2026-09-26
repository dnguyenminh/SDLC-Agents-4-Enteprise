import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SettingsManager } from '../settings-manager';

describe('SettingsManager', () => {
  it('loads settings from JSON file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'));
    const file = path.join(tmp, 'settings.json');
    fs.writeFileSync(file, JSON.stringify({ model: 'gpt-4o-mini', thinkingLevel: 'medium' }));
    const mgr = new SettingsManager({ source: 'file', filePath: file });
    expect(mgr.get('model')).toBe('gpt-4o-mini');
    expect(mgr.get('thinkingLevel')).toBe('medium');
  });

  it('falls back to defaults on parse error', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'));
    const file = path.join(tmp, 'bad.json');
    fs.writeFileSync(file, '{ invalid json');
    const mgr = new SettingsManager({ source: 'file', filePath: file });
    expect(mgr.getSettings()).toEqual({});
  });

  it('loads from memory', () => {
    const mgr = new SettingsManager({ source: 'memory', initial: { model: 'claude-3' } });
    expect(mgr.get('model')).toBe('claude-3');
  });
});
