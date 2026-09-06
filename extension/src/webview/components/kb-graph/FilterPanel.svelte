<script lang="ts">
  import FilterSearchInput from './FilterSearchInput.svelte';
  import { filterStore } from './stores/filterStore';
  import { matchesWildcard } from './utils/wildcardMatcher';
  import { onMount } from 'svelte';

  export let allTypes: string[] = [];

  let state = { query: '', selectedTypes: [] as string[], wildcardEnabled: true };
  filterStore.subscribe(s => state = s);

  $: filtered = allTypes.filter(t => matchesWildcard(t, state.query));
</script>

<div class="filter-panel">
  <FilterSearchInput />
  <div class="checkbox-list">
    {#each filtered as type}
      <label>
        <input type="checkbox" checked={state.selectedTypes.includes(type)} on:change={() => filterStore.toggleType(type)} />
        {type}
      </label>
    {/each}
    {#if filtered.length === 0}
      <div class="empty">No matches</div>
    {/if}
  </div>
</div>

<style>
  .filter-panel { background: #1e293b; padding: 8px; border-radius: 6px; }
  .checkbox-list { max-height: 300px; overflow-y: auto; margin-top: 6px; }
  label { display: flex; gap: 6px; padding: 2px 0; }
  .empty { opacity: 0.6; padding: 8px; }
</style>
