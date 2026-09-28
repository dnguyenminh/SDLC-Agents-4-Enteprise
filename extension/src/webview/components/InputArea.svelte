<!-- Input Area component -->
<script lang="ts">
  import ChatInput from './ChatInput.svelte';
</script>

<div data-testid="input-area" class="input-area">
  <ChatInput />
</div>

<style>
.input-area {
  border-top: 1px solid var(--vscode-panel-border);
  background: var(--vscode-editor-background);
}
</style>
