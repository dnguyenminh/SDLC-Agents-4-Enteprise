<!--
  LeftPane for SA4E-289 Pi SDK migration
  Shows Conversation History, Tool Calls Log, State Snapshot
-->
<script lang="ts">
  import { messages } from '../stores/chatStore';
  import { activeToolsList } from '../stores/toolStore';
  import { piWorkflowState } from '../stores/piWorkflowStore';
</script>

<div class="left-pane">
  <section class="pane-section">
    <h3>Conversation History</h3>
    <div class="history-list">
      {#each $messages as msg (msg.id)}
        <div class="history-item">
          <span class="role">{msg.role}</span>
          <span class="time">{new Date(msg.timestamp).toLocaleTimeString()}</span>
        </div>
      {/each}
    </div>
  </section>

  <section class="pane-section">
    <h3>Tool Calls Log</h3>
    <div class="tool-log">
      {#each $activeToolsList as tool}
        <div class="tool-item status-{tool.status}">
          {tool.name} – {tool.status}
        </div>
      {/each}
    </div>
  </section>

  <section class="pane-section">
    <h3>State Snapshot</h3>
    <pre class="state-snapshot">Session: {$piWorkflowState.sessionId || '—'}
Phase: {$piWorkflowState.phase || '—'}
Provider: {$piWorkflowState.providerStatus}</pre>
  </section>
</div>

<style>
  .left-pane {
    width: 280px;
    border-right: 1px solid var(--vscode-panel-border);
    display: flex;
    flex-direction: column;
    background: var(--vscode-sideBar-background);
    overflow-y: auto;
  }
  .pane-section {
    padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .pane-section h3 {
    font-size: 11px;
    margin: 0 0 6px 0;
    text-transform: uppercase;
    opacity: 0.7;
  }
  .history-item, .tool-item {
    font-size: 12px;
    padding: 2px 0;
  }
  .role {
    font-weight: 600;
    margin-right: 6px;
  }
  .state-snapshot {
    font-size: 11px;
    background: var(--vscode-textCodeBlock-background);
    padding: 6px;
    border-radius: 4px;
    overflow: auto;
  }
</style>
