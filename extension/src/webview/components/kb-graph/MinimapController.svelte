<script lang="ts">
  import { minimapStore } from './stores/minimapStore';
  import { onMount } from 'svelte';

  let state = { isRotated: false, scale: 1, viewport: { x:0,y:0,w:100,h:100 }, spanMode: false };
  minimapStore.subscribe(v => state = v);

  function rotate() { minimapStore.rotate(); }
  function toggleSpan() { minimapStore.toggleSpan(); }

  // placeholder canvas handling
  onMount(() => {
    // minimap rendering would be delegated to graph renderer via store
  });
</script>

<div class="minimap-controller">
  <canvas id="minimap-canvas" width="200" height="160"></canvas>
  <div class="controls">
    <button on:click={rotate}>Rotate</button>
    <button on:click={toggleSpan}>{state.spanMode ? 'Span Off' : 'Span On'}</button>
  </div>
  {#if state.spanMode}
    <div class="viewport-rect" style="left:{state.viewport.x}px; top:{state.viewport.y}px; width:{state.viewport.w}px; height:{state.viewport.h}px;"></div>
  {/if}
</div>

<style>
  .minimap-controller { position: relative; width: 200px; height: 160px; background: #0f172a; border-radius: 4px; overflow: hidden; }
  canvas { width: 100%; height: 100%; }
  .controls { position: absolute; bottom: 4px; left: 4px; display: flex; gap: 4px; }
  .viewport-rect { position: absolute; border: 1px solid #38bdf8; pointer-events: none; }
</style>
