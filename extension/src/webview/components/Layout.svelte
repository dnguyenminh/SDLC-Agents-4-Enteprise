<!-- 3-pane Layout for Pi Chat -->
<script lang="ts">
  import Toolbar from './Toolbar.svelte';
  import LeftPane from './LeftPane.svelte';
  import CenterPane from './CenterPane.svelte';
  import RightPane from './RightPane.svelte';
  import StatusBar from './StatusBar.svelte';
</script>

<div class="layout" data-testid="pi-chat-layout">
  <Toolbar />
  <div class="panes">
    <LeftPane />
    <CenterPane />
    <RightPane />
  </div>
  <StatusBar />
</div>

<style>
.layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.panes {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
