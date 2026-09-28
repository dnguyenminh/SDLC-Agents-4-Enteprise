<!-- Center Pane component -->
<script lang="ts">
  import ChatPanel from './ChatPanel.svelte';
</script>

<div data-testid="center-pane" class="pane center-pane">
  <ChatPanel />
</div>

<style>
.center-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
