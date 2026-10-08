/**
 * Unit tests for SA4E-305 3-pane layout components
 * STC UT cases for layout
 *
 * Components are verified by real compilation through the shared helper
 * (TS-stripped script → svelte/compiler, same pipeline as the webview build)
 * plus structural assertions on their actual source.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { compileSvelteFile, COMPONENTS_DIR } from './svelte-compile-helper';

function readComponent(name: string): string {
  return fs.readFileSync(path.join(COMPONENTS_DIR, name), 'utf-8');
}

describe('Layout Components', () => {
  it('Layout component renders with data-testid', async () => {
    const source = readComponent('Layout.svelte');

    // Real compile — throws if the template/script is invalid (mount integrity).
    await expect(compileSvelteFile(path.join(COMPONENTS_DIR, 'Layout.svelte'))).resolves.toBeUndefined();

    // Structural contract: root element carries the automation test id.
    expect(source).toContain('data-testid="pi-chat-layout"');
    // 3-pane structure: all panes rendered inside Layout.
    expect(source).toContain('<LeftPane />');
    expect(source).toContain('<CenterPane />');
    expect(source).toContain('<RightPane />');
  });

  it('Toolbar contains title', async () => {
    const source = readComponent('Toolbar.svelte');
    await expect(compileSvelteFile(path.join(COMPONENTS_DIR, 'Toolbar.svelte'))).resolves.toBeUndefined();
    expect(source).toMatch(/<span class="title">Pi Chat<\/span>/);
  });

  it('WorklistTab renders', async () => {
    const source = readComponent('WorklistTab.svelte');
    await expect(compileSvelteFile(path.join(COMPONENTS_DIR, 'WorklistTab.svelte'))).resolves.toBeUndefined();
    expect(source).toContain('data-testid="worklist-tab"');
    expect(source).toContain('<h4>Worklist</h4>');
  });
});
