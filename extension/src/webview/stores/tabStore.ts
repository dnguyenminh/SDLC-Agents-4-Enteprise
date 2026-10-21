/**
 * SA4E-370 S3/S4 — Tab Store.
 * Tracks chat tabs, active tab, and per-tab agent assignments.
 * Synced from Extension Host via tab:updated / TAB_UPDATED messages.
 */

import { writable, derived } from 'svelte/store';

export interface ChatTab {
  id: string;
  name: string;
  messages: unknown[];
  tokenCount: number;
  maxTokens: number;
}

/** Internal state shape for tab management */
interface TabState {
  tabs: ChatTab[];
  activeTabId: string | null;
  isLoading: boolean;
}

const initialState: TabState = {
  tabs: [],
  activeTabId: null,
  isLoading: true,
};

/** Core writable store for tab state */
export const tabState = writable<TabState>(initialState);

/** Derived: list of tabs */
export const tabs = derived(tabState, ($s) => $s.tabs);

/** Derived: active tab ID */
export const activeTabId = derived(tabState, ($s) => $s.activeTabId);

/** Derived: active tab object */
export const activeTab = derived(tabState, ($s) =>
  $s.tabs.find((t) => t.id === $s.activeTabId) ?? null
);

/** Derived: loading indicator */
export const isTabLoading = derived(tabState, ($s) => $s.isLoading);

/** Sync tabs from Extension Host broadcast (tab:updated / TAB_UPDATED) */
export function updateTabs(tabs: ChatTab[], activeTabId: string): void {
  tabState.update((s) => ({
    ...s,
    tabs,
    activeTabId,
    isLoading: false,
  }));
}

/** Set active tab (from tab:switch or user click) */
export function setActiveTab(tabId: string): void {
  tabState.update((s) => ({ ...s, activeTabId: tabId }));
}

/** Add a new tab */
export function addTab(tab: ChatTab): void {
  tabState.update((s) => ({
    ...s,
    tabs: [...s.tabs, tab],
    activeTabId: tab.id,
  }));
}

/** Close a tab */
export function closeTab(tabId: string): void {
  tabState.update((s) => {
    const newTabs = s.tabs.filter((t) => t.id !== tabId);
    let newActive = s.activeTabId;
    if (s.activeTabId === tabId) {
      newActive = newTabs[newTabs.length - 1]?.id ?? null;
    }
    return { ...s, tabs: newTabs, activeTabId: newActive };
  });
}

/** Rename a tab */
export function renameTab(tabId: string, newName: string): void {
  tabState.update((s) => ({
    ...s,
    tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, name: newName } : t)),
  }));
}

/** Reset to initial loading state */
export function resetTabs(): void {
  tabState.set(initialState);
}