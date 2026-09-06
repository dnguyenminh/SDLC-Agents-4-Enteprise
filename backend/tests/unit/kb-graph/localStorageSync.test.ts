import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveState, loadState, removeState } from '../../src/viewer/admin/utils/localStorageSync.js';

describe('localStorageSync', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads state', () => {
    const state = { x: 10, y: 20 };
    saveState('testKey', state);
    const loaded = loadState('testKey');
    expect(loaded).toEqual(state);
  });

  it('returns default when key missing', () => {
    const loaded = loadState('missing', {default:true});
    expect(loaded).toEqual({default:true});
  });

  it('removes state', () => {
    saveState('k', {a:1});
    removeState('k');
    expect(loadState('k')).toBeNull();
  });
});
