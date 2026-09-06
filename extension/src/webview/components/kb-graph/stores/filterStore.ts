import { writable } from 'svelte/store';
import type { FilterState } from '../types/kbGraph.types';

const initial: FilterState = {
  query: '',
  selectedTypes: [],
  wildcardEnabled: true
};

function createFilterStore() {
  const { subscribe, set, update } = writable<FilterState>(initial);
  return {
    subscribe,
    set,
    update,
    setQuery: (q: string) => update(s => ({ ...s, query: q })),
    toggleType: (type: string) => update(s => {
      const set = new Set(s.selectedTypes);
      set.has(type) ? set.delete(type) : set.add(type);
      return { ...s, selectedTypes: Array.from(set) };
    }),
    reset: () => set(initial)
  };
}

export const filterStore = createFilterStore();
