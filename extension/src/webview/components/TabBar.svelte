<!--
  SA4E-370 S3/S4 — Tab Bar.
  Displays chat tabs with per-tab agent badge and switch indicator.
  Handles tab create/switch/close/rename via postMessage to Extension Host.
-->

<script lang="ts">
  import { onMount } from 'svelte';
  import { tabs, activeTabId, addTab, closeTab, setActiveTab, renameTab } from '../stores/tabStore';
  import { getActiveAgentForTab, switchIndicator, switchError, setSwitchSuccess, setSwitchError, resetSwitchIndicator, syncSelectedAgentWithTab } from '../stores/agentStore';
  import { agents, selectedAgentId } from '../stores/agentStore';
  import { switchTab as postSwitchTab, createTab as postCreateTab, closeTab as postCloseTab, renameTab as postRenameTab } from '../postMessage';

  let editingTabId: string | null = null;
  let editName = '';

  /** Send tab:switch to Extension Host and sync agent */
  function switchTab(tabId: string): void {
    setActiveTab(tabId);
    postSwitchTab(tabId);
    // Sync global selected agent with tab's agent
    const agentId = getActiveAgentForTab(tabId);
    if (agentId) {
      syncSelectedAgentWithTab(tabId);
    }
  }

  /** Handle tab click */
  function handleTabClick(tabId: string): void {
    if (editingTabId === tabId) return;
    switchTab(tabId);
  }

  /** Start renaming a tab */
  function startRename(tabId: string, currentName: string): void {
    editingTabId = tabId;
    editName = currentName;
  }

  /** Commit rename */
  function commitRename(tabId: string): void {
    if (editName.trim() && editingTabId === tabId) {
      renameTab(tabId, editName.trim());
      postRenameTab(tabId, editName.trim());
    }
    editingTabId = null;
    editName = '';
  }

  /** Cancel rename */
  function cancelRename(): void {
    editingTabId = null;
    editName = '';
  }

  /** Handle key events during rename */
  function handleKeyDown(event: KeyboardEvent, tabId: string): void {
    if (event.key === 'Enter') {
      commitRename(tabId);
    } else if (event.key === 'Escape') {
      cancelRename();
    }
  }

  /** Close tab */
  function handleClose(event: Event, tabId: string): void {
    event.stopPropagation();
    closeTab(tabId);
    postCloseTab(tabId);
  }

  /** Create new tab */
  function handleNewTab(): void {
    const newTabId = `tab-${Date.now()}`;
    const newTab = {
      id: newTabId,
      name: `Chat ${$tabs.length + 1}`,
      messages: [],
      tokenCount: 0,
      maxTokens: 0,
    };
    addTab(newTab);
    postCreateTab(newTab);
  }

  /** Get agent badge for a tab */
  function getTabAgentBadge(tabId: string): string | null {
    const agentId = getActiveAgentForTab(tabId);
    if (!agentId) return null;
    const agent = $agents.find((a) => a.id === agentId);
    return agent?.name ?? agentId;
  }

  /** Get switch indicator state for a tab */
  function getSwitchState(tabId: string): 'idle' | 'switching' | 'success' | 'error' {
    // Only show switching state for the active tab
    if ($activeTabId === tabId) {
      return $switchIndicator;
    }
    return 'idle';
  }

  /** Get switch error for active tab */
  function getSwitchError(): string | null {
    return $switchError;
  }
</script>

<div class="tab-bar" role="tablist" aria-label="Chat tabs">
  <button
    class="tab-new"
    on:click={handleNewTab}
    aria-label="New chat tab"
    title="New chat"
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 2V14M2 8H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>

  {#each $tabs as tab (tab.id)}
    <div class="tab" role="tab" aria-selected={$activeTabId === tab.id} aria-controls={`panel-${tab.id}`}>
      {#if editingTabId === tab.id}
        <input
          type="text"
          class="tab-edit-input"
          bind:value={editName}
          on:keydown={(e) => handleKeyDown(e, tab.id)}
          on:blur={commitRename}
          on:click={(e) => e.stopPropagation()}
        />
      {:else}
        <button
          class="tab-button {tab.id === $activeTabId ? 'active' : ''}"
          on:click={() => handleTabClick(tab.id)}
          on:dblclick={() => startRename(tab.id, tab.name)}
        >
          <span class="tab-name">{tab.name}</span>
          
          {#if getTabAgentBadge(tab.id)}
            <span class="tab-agent-badge" aria-label="Active agent: {getTabAgentBadge(tab.id)}">
              {getTabAgentBadge(tab.id)}
            </span>
          {/if}
          
          {#if getSwitchState(tab.id) === 'switching'}
            <span class="tab-switch-indicator switching" aria-label="Switching agent...">
              <svg class="spinner" width="12" height="12" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="31.4 31.4" stroke-linecap="round">
                  <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                </circle>
              </svg>
            </span>
          {:else if getSwitchState(tab.id) === 'success'}
            <span class="tab-switch-indicator success" aria-label="Agent switched">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 4L6 11L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
          {:else if getSwitchState(tab.id) === 'error'}
            <span class="tab-switch-indicator error" aria-label="Switch failed: {getSwitchError()}">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </span>
          {/if}
          
          <button
            class="tab-close"
            on:click={(e) => handleClose(e, tab.id)}
            aria-label={`Close ${tab.name}`}
            title="Close tab"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .tab-bar {
    display: flex;
    align-items: center;
    height: 32px;
    padding: 0 8px;
    gap: 2px;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-tab-activeBackground, var(--vscode-editor-background));
    overflow-x: auto;
    flex-shrink: 0;
  }

  .tab-new {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    border-radius: 3px;
    flex-shrink: 0;
    margin-right: 4px;
  }

  .tab-new:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
  }

  .tab-new:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }

  .tab {
    display: flex;
    position: relative;
    flex-shrink: 0;
  }

  .tab-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 24px;
    min-width: 120px;
    max-width: 200px;
    border: none;
    background: transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    border-radius: 3px 3px 0 0;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background-color 0.1s ease;
  }

  .tab-button:hover {
    background: var(--vscode-tab-hoverBackground, rgba(255, 255, 255, 0.08));
  }

  .tab-button:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -2px;
  }

  .tab-button.active {
    background: var(--vscode-tab-activeBackground, var(--vscode-editor-background));
    color: var(--vscode-tab-activeForeground, var(--vscode-foreground));
    font-weight: 500;
  }

  .tab-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-agent-badge {
    display: inline-flex;
    align-items: center;
    padding: 1px 5px;
    font-size: 9px;
    font-weight: 500;
    border-radius: 2px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
    white-space: nowrap;
  }

  .tab-switch-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    color: var(--vscode-terminal-ansiGreen, #4ec9b0);
  }

  .tab-switch-indicator.switching .spinner {
    animation: spin 1s linear infinite;
  }

  .tab-switch-indicator.success {
    color: var(--vscode-terminal-ansiGreen, #4ec9b0);
  }

  .tab-switch-indicator.error {
    color: var(--vscode-errorForeground, #f44);
  }

  .tab-edit-input {
    flex: 1;
    min-width: 80px;
    max-width: 180px;
    padding: 1px 6px;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border-radius: 2px;
    outline: none;
  }

  .tab-edit-input:focus {
    border-color: var(--vscode-focusBorder);
  }

  .tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-left: 4px;
    border: none;
    background: transparent;
    color: var(--vscode-tab-closeButtonForeground, var(--vscode-foreground));
    cursor: pointer;
    border-radius: 2px;
    opacity: 0;
    transition: opacity 0.1s ease, background-color 0.1s ease;
  }

  .tab:hover .tab-close,
  .tab-button:focus-within .tab-close {
    opacity: 1;
  }

  .tab-close:hover {
    background: var(--vscode-tab-closeButtonHoverBackground, rgba(255, 0, 0, 0.2));
    color: var(--vscode-errorForeground, #f44);
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Scrollbar styling for horizontal overflow */
  .tab-bar::-webkit-scrollbar {
    height: 4px;
  }

  .tab-bar::-webkit-scrollbar-track {
    background: transparent;
  }

  .tab-bar::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background, rgba(128, 128, 128, 0.4));
    border-radius: 2px;
  }
</style>