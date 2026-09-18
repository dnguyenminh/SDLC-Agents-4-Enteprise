<!--
  SA4E-85 — ChatHeader (Task 2.1 sub-component).
  Displays chat title, connection status indicator.
  Provides placeholder slots for AgentSelector (Phase 3) and ContextBadge (Phase 6).
-->
<script lang="ts">
  import { hasActiveConnection } from '../stores/connectionStore';
  import { selectedAgent } from '../stores/agentStore';
  import { isStreaming } from '../stores/chatStore';
  import { piWorkflowState } from '../stores/piWorkflowStore';
  import ContextBadge from './ContextBadge.svelte';
  import AgentSelector from './AgentSelector.svelte';
  import ChangeBadge from './ChangeBadge.svelte';
</script>

<header class="chat-header" aria-label="Chat header">
  <div class="header-left">
    <h1 class="header-title">Agentic Chat</h1>
    {#if $selectedAgent}
      <span class="agent-name" aria-label="Active agent: {$selectedAgent.name}">
        {$selectedAgent.name}
      </span>
    {/if}
    <span class="meta-badge">Session: {$piWorkflowState.sessionId || '—'}</span>
    <span class="meta-badge">Phase: {$piWorkflowState.phase || '—'}</span>
    <span class="meta-badge pi-status" class:connected={$piWorkflowState.providerStatus === 'connected'}>Pi: {$piWorkflowState.providerStatus}</span>
  </div>

  <div class="header-right">
    <!-- SA4E-186: Agent selector dropdown for per-agent runtime routing -->
    <AgentSelector />
    <div class="context-badge-wrapper" style="position: relative;">
      <ContextBadge />
    </div>
    <!-- SA4E-183: File change count badge -->
    <ChangeBadge />

    {#if $isStreaming}
      <span class="streaming-badge" aria-live="polite">
        <span class="pulse-dot"></span>
        Streaming
      </span>
    {/if}

    <span
      class="status-dot"
      class:connected={$hasActiveConnection}
      role="status"
      aria-label={$hasActiveConnection ? 'Connected' : 'Disconnected'}
      title={$hasActiveConnection ? 'Connected' : 'Disconnected'}
    ></span>
  </div>
</header>

<style>
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
    min-height: 36px;
    flex-shrink: 0;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .header-title {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
    color: var(--vscode-foreground);
  }
  .agent-name, .meta-badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
  }
  .meta-badge {
    margin-left: 4px;
    opacity: 0.8;
  }
  .pi-status {
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
  }
  .pi-status.connected {
    background: var(--vscode-terminal-ansiGreen, #4ec9b0);
    color: #000;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .streaming-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--vscode-terminal-ansiGreen, #4ec9b0);
  }
  .pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--vscode-terminal-ansiGreen, #4ec9b0);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--vscode-errorForeground, #f44);
    flex-shrink: 0;
  }
  .status-dot.connected {
    background: var(--vscode-terminal-ansiGreen, #4c4);
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
