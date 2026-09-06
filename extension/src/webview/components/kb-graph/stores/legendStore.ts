import { writable } from 'svelte/store';
import type { LegendWindowState } from '../types/kbGraph.types';
import { loadFromLocalStorage, saveToLocalStorage, sanitizeWindowState } from '../utils/localStorageSync';

const LEGEND_KEY = 'kb-graph.legend.window';

function createLegendStore() {
  const initial: LegendWindowState = {
    x: 20,
    y: 20,
    w: 320,
    h: 400,
    maximized: false,
    minimized: false
  };

  const stored = loadFromLocalStorage(LEGEND_KEY, initial);
  const sanitized = (typeof window !== 'undefined')
    ? sanitizeWindowState(stored, { innerWidth: window.innerWidth, innerHeight: window.innerHeight })
    : stored as unknown as LegendWindowState;

  const { subscribe, set, update } = writable<LegendWindowState>(sanitized);

  return {
    subscribe,
    set,
    update,
    reset: () => set(initial),
    persist: (state: LegendWindowState) => {
      saveToLocalStorage(LEGEND_KEY, state);
    }
  };
}

export const legendStore = createLegendStore();
