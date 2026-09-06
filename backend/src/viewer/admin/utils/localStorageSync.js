/**
 * localStorage synchronization helpers for UI state persistence.
 * Falls back to memory store if localStorage unavailable.
 */

const MEMORY_STORE = {};

function isStorageAvailable() {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

export function saveState(key, state) {
  try {
    if (isStorageAvailable()) {
      localStorage.setItem(key, JSON.stringify(state));
    } else {
      MEMORY_STORE[key] = state;
    }
  } catch (e) {
    console.warn('[localStorageSync] Save failed', e);
    MEMORY_STORE[key] = state;
  }
}

export function loadState(key, defaultValue = null) {
  try {
    if (isStorageAvailable()) {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : defaultValue;
    } else {
      return MEMORY_STORE[key] ?? defaultValue;
    }
  } catch (e) {
    console.warn('[localStorageSync] Load failed', e);
    return defaultValue;
  }
}

export function removeState(key) {
  try {
    if (isStorageAvailable()) {
      localStorage.removeItem(key);
    } else {
      delete MEMORY_STORE[key];
    }
  } catch (e) {
    console.warn('[localStorageSync] Remove failed', e);
  }
}
