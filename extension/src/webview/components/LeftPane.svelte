<!-- Left Pane component -->
<script lang="ts">
  import WorklistTab from './WorklistTab.svelte';
</script>

<div data-testid="left-pane" class="pane left-pane">
  <WorklistTab />
  <div class="nav">Navigation</div>
</div>

<style>
.left-pane {
  width: 240px;
  min-width: 200px;
  border-right: 1px solid var(--vscode-panel-border);
  overflow: auto;
}
.nav {
  padding: 8px;
}
</style>
