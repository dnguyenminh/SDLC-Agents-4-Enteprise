/**
 * ModelPickerRecent — recent models management for model picker.
 * Extracted from ModelPickerPopup for SRP and line limits.
 */

import { ModelItem } from "./model-picker-popup.js";

const MAX_RECENT_MODELS = 5;
const RECENT_STORAGE_KEY = "sdlcAgents.modelPicker.recent";

export interface RecentModelsManager {
  recentModels: ModelItem[];
  load: () => void;
  save: () => void;
  add: (model: ModelItem) => void;
}

/** Create a recent models manager. */
export function createRecentModelsManager(): RecentModelsManager {
  const manager: RecentModelsManager = {
    recentModels: [],
    load() {
      try {
        const stored = localStorage.getItem(RECENT_STORAGE_KEY);
        if (stored) { this.recentModels = JSON.parse(stored); }
      } catch { this.recentModels = []; }
    },
    save() {
      try { localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(this.recentModels)); } catch { /* ignore */ }
    },
    add(model: ModelItem) {
      this.recentModels = this.recentModels.filter((m) => m.id !== model.id);
      this.recentModels.unshift(model);
      if (this.recentModels.length > MAX_RECENT_MODELS) {
        this.recentModels = this.recentModels.slice(0, MAX_RECENT_MODELS);
      }
      this.save();
    },
  };
  manager.load();
  return manager;
}