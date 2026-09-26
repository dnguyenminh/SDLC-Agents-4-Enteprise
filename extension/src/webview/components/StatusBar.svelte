<!-- Status Bar component -->
<script lang="ts">
  import { connectionState } from '../stores/connectionStore';
</script>

<div data-testid="status-bar" class="status-bar">
  <span>Status: {$connectionState}</span>
</div>

<style>
.status-bar {
  height: 22px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  background: var(--vscode-statusBar-background);
  color: var(--vscode-statusBar-foreground);
  font-size: 12px;
  border-top: 1px solid var(--vscode-panel-border);
}
</style>
