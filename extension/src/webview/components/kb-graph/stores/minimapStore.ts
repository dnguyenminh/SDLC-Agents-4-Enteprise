import { writable } from 'svelte/store';
import type { MinimapState } from '../types/kbGraph.types';

const initial: MinimapState = {
  isRotated: false,
  scale: 1,
  viewport: { x: 0, y: 0, w: 100, h: 100 },
  spanMode: false
};

function createMinimapStore() {
  const { subscribe, set, update } = writable<MinimapState>(initial);
  return {
    subscribe,
    set,
    update,
    rotate: () => update(s => ({ ...s, isRotated: !s.isRotated })),
    toggleSpan: () => update(s => ({ ...s, spanMode: !s.spanMode })),
    setViewport: (viewport: MinimapState['viewport']) => update(s => ({ ...s, viewport }))
  };
}

export const minimapStore = createMinimapStore();
