<script lang="ts">
  import { onMount } from 'svelte';
  import { legendStore } from './stores/legendStore';
  import type { LegendItem } from './types/kbGraph.types';

  export let items: LegendItem[] = [];
  export let isMaximized = false;

  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let windowState = { x: 20, y: 20, w: 320, h: 400, maximized: false, minimized: false };

  legendStore.subscribe(v => windowState = v);

  function startDrag(e: PointerEvent) {
    dragging = true;
    dragStart = { x: e.clientX - windowState.x, y: e.clientY - windowState.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    legendStore.update(s => {
      const next = { ...s, x: newX, y: newY };
      legendStore.persist(next);
      return next;
    });
  }

  function stopDrag() {
    dragging = false;
  }

  function toggleMaximize() {
    legendStore.update(s => {
      const next = { ...s, maximized: !s.maximized };
      legendStore.persist(next);
      return next;
    });
  }

  onMount(() => {});
</script>

<div
  class="legend-window"
  style="left:{windowState.x}px; top:{windowState.y}px; width:{windowState.maximized ? '100%' : windowState.w + 'px'}; height:{windowState.maximized ? '100%' : windowState.h + 'px'}; display:{windowState.minimized ? 'none' : 'flex'}"
>
  <div class="titlebar" on:pointerdown={startDrag} on:pointermove={onPointerMove} on:pointerup={stopDrag}>
    <span>Legend</span>
    <button on:click={toggleMaximize}>{windowState.maximized ? 'Restore' : 'Max'}</button>
  </div>
  <div class="legend-list">
    {#each items as item}
      <div class="legend-item">
        <span class="color" style="background:{item.color}"></span>
        <span>{item.type}</span>
        <span class="count">{item.count}</span>
      </div>
    {/each}
    {#if items.length === 0}
      <div class="empty">No types</div>
    {/if}
  </div>
</div>

<style>
  .legend-window { position: fixed; z-index: 1000; background: #1e293b; color: #e2e8f0; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }
  .titlebar { padding: 6px 10px; background: #0f172a; cursor: move; display: flex; justify-content: space-between; }
  .legend-list { overflow-y: auto; padding: 8px; }
  .legend-item { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
  .color { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
  .count { margin-left: auto; opacity: 0.7; }
  .empty { opacity: 0.6; padding: 8px; }
</style>
