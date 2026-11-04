---
name: svelte-webview
description: "Svelte 4 webview patterns for VS Code extension. Use when building UI components, stores, or message passing in extension/src/webview/."
---

# svelte-webview

Svelte 4 patterns for VS Code webview panels. Built with Vite, communicates with extension host via postMessage.

## Component Structure

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { currentState } from '../stores/appStore';
  import type { ProviderInfo } from '../models/ProviderInfo';

  export let provider: ProviderInfo;

  let loading = false;

  onMount(() => {
    window.addEventListener('message', handleMessage);
  });

  onDestroy(() => {
    window.removeEventListener('message', handleMessage);
  });

  function handleMessage(event: MessageEvent): void {
    const msg = event.data;
    if (msg.type === 'update-provider') {
      currentState.update(s => ({ ...s, provider: msg.payload }));
    }
  }

  function requestAction(): void {
    vscode.postMessage({ type: 'execute-action', payload: { id: provider.id } });
  }
</script>

<div class="card">
  <h3>{provider.name}</h3>
  <button on:click={requestAction} disabled={loading}>Run</button>
</div>

<style>
  .card { padding: 8px; border: 1px solid var(--vscode-panel-border); }
</style>
```

## Stores (Svelte Writable)

```typescript
// stores/appStore.ts
import { writable } from 'svelte/store';
import type { AppState } from '../models/AppState';

const initialState: AppState = { providers: [], connected: false };

export const appState = writable<AppState>(initialState);

export function resetState(): void {
  appState.set(initialState);
}
```

## Event Dispatch to Extension (postMessage)

```typescript
// utils/vscode.ts — typed postMessage wrapper
declare const acquireVsCodeApi: () => { postMessage(msg: unknown): void };
export const vscode = acquireVsCodeApi();

export interface OutgoingMessage {
  type: string;
  payload?: unknown;
}

export function sendToExtension(msg: OutgoingMessage): void {
  vscode.postMessage(msg);
}
```

## Receiving Messages from Extension

```typescript
// App.svelte — top-level message router
import { appState } from './stores/appStore';

function handleExtensionMessage(event: MessageEvent): void {
  const { type, payload } = event.data;
  switch (type) {
    case 'state-update':
      appState.set(payload);
      break;
    case 'error':
      showError(payload.message);
      break;
  }
}

window.addEventListener('message', handleExtensionMessage);
```

## Vite Build Config for Webview

```typescript
// extension/webview/vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    outDir: '../dist/webview',
    rollupOptions: {
      output: { entryFileNames: 'webview.js', assetFileNames: 'webview.css' },
    },
    minify: 'esbuild',
    sourcemap: false,
  },
});
```

## VS Code Theme Integration

Use CSS variables from VS Code theme for consistent look:

```css
:root {
  --bg: var(--vscode-editor-background);
  --fg: var(--vscode-editor-foreground);
  --border: var(--vscode-panel-border);
  --button-bg: var(--vscode-button-background);
  --button-fg: var(--vscode-button-foreground);
  --input-bg: var(--vscode-input-background);
}
```

## File Organization

```
extension/src/webview/
├── App.svelte              # Root component + message router
├── main.ts                 # Svelte mount entry
├── components/             # Reusable UI components
├── pages/                  # Page-level components
├── stores/                 # Svelte writable stores
├── models/                 # TypeScript interfaces
└── utils/                  # Helpers (vscode api, formatters)
```

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|------|
| Import vscode module in webview | Use postMessage bridge |
| Store state in DOM | Use Svelte stores |
| Inline styles for theme colors | Use `var(--vscode-*)` tokens |
| Call acquireVsCodeApi multiple times | Call once, export singleton |
| Mutate store directly from events | Use store.update() or store.set() |
