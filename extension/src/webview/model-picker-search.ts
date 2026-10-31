/**
 * ModelPickerSearch — search/filter logic for model picker.
 * Extracted from ModelPickerPopup for SRP and line limits.
 */

import { ModelItem } from "./model-picker-popup.js";

export interface SearchState {
  query: string;
  filteredModels: ModelItem[];
}

/**
 * Filter models based on search query.
 * Matches against name, id, and provider fields (case-insensitive).
 */
export function filterModels(models: ModelItem[], query: string): ModelItem[] {
  if (!query) { return [...models]; }

  const lowerQuery = query.trim().toLowerCase();
  return models.filter((m) =>
    m.name.toLowerCase().includes(lowerQuery) ||
    m.id.toLowerCase().includes(lowerQuery) ||
    m.provider.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Create initial search state.
 */
export function createSearchState(models: ModelItem[]): SearchState {
  return { query: "", filteredModels: [...models] };
}

/**
 * Update search state with new query.
 */
export function updateSearchState(state: SearchState, models: ModelItem[], query: string): SearchState {
  return { query, filteredModels: filterModels(models, query) };
}