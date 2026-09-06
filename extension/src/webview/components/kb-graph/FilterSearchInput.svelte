<script lang="ts">
  import { filterStore } from './stores/filterStore';
  import { onDestroy } from 'svelte';

  export let placeholder = 'Search types * ?';
  let query = '';
  let timeout: number | undefined;

  filterStore.subscribe(s => { /* could sync */ });

  function onInput(e: Event) {
    const target = e.target as HTMLInputElement;
    query = target.value;
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      filterStore.setQuery(query);
    }, 150);
  }

  onDestroy(() => { if (timeout) window.clearTimeout(timeout); });
</script>

<input id="filter-search-input" type="text" {placeholder} value={query} on:input={onInput} />

<style>
  input { width: 100%; padding: 6px 8px; background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 4px; }
</style>
