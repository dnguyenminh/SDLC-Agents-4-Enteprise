<!-- Toolbar component for Pi Chat 3-pane layout -->
<script lang="ts">
</script>

<div data-testid="toolbar" class="toolbar">
  <span class="title">Pi Chat</span>
  <div class="actions"></div>
</div>

<style>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--vscode-titleBar-activeBackground);
  border-bottom: 1px solid var(--vscode-panel-border);
}
.title {
  font-weight: 600;
}
</style>
