import { describe, it, expect, vi } from 'vitest';
import { getExtensionVersion } from '../pi-provider-config-bridge.js';

vi.mock('vscode', () => ({}));

describe('getExtensionVersion', () => {
  it('falls back to dev without host APIs', () => {
    expect(getExtensionVersion()).toBe('dev');
  });
});
