<!--
  SA4E-85 — Root Svelte App component.
  Mount point for the Agentic Chat UI.
  Delegates to Layout which composes the 3-pane chat interface (SA4E-305).
-->
<script lang="ts">
  import Layout from './components/Layout.svelte';
</script>

<main class="app-root">
  <Layout />
</main>

<style>
  .app-root {
    height: 100vh;
    overflow: hidden;
  }
</style>
