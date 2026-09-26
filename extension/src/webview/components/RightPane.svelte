<!-- Right Pane component -->
<script lang="ts">
  import ApprovalPanel from './ApprovalPanel.svelte';
</script>

<div data-testid="right-pane" class="pane right-pane">
  <ApprovalPanel />
</div>

<style>
.right-pane {
  width: 320px;
  min-width: 240px;
  border-left: 1px solid var(--vscode-panel-border);
  overflow: auto;
}
</style>
