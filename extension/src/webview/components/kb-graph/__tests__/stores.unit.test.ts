import { describe, it, expect } from 'vitest';
import { legendStore } from '../stores/legendStore';
import { minimapStore } from '../stores/minimapStore';
import { filterStore } from '../stores/filterStore';

describe('legendStore', () => {
  it('initial state', () => {
    let state;
    legendStore.subscribe(s => state = s)();
    expect(state.w).toBeGreaterThan(0);
  });
});

describe('minimapStore', () => {
  it('rotate toggles', () => {
    let state;
    minimapStore.subscribe(s => state = s)();
    const before = state.isRotated;
    minimapStore.rotate();
    minimapStore.subscribe(s => state = s)();
    expect(state.isRotated).toBe(!before);
  });
  it('toggle span', () => {
    minimapStore.toggleSpan();
    let state;
    minimapStore.subscribe(s => state = s)();
    expect(state.spanMode).toBe(true);
  });
});

describe('filterStore', () => {
  it('setQuery', () => {
    filterStore.setQuery('ACT*');
    let state;
    filterStore.subscribe(s => state = s)();
    expect(state.query).toBe('ACT*');
  });
  it('toggleType', () => {
    filterStore.toggleType('ACTIVITY');
    let state;
    filterStore.subscribe(s => state = s)();
    expect(state.selectedTypes).toContain('ACTIVITY');
    filterStore.toggleType('ACTIVITY');
    filterStore.subscribe(s => state = s)();
    expect(state.selectedTypes).not.toContain('ACTIVITY');
  });
});
