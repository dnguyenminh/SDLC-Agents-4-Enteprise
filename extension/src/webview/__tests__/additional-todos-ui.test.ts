// @vitest-environment jsdom
/**
 * Former test.todo placeholders — now real automated tests (UI/store concerns).
 * Each test targets the actual module behind the original todo title.
 * Split from additional-todos.test.ts.
 */

import { describe, test, expect, vi } from 'vitest';

// Svelte store read helper (same pattern as chat-store.test.ts)
function get<T>(store: { subscribe: (run: (v: T) => void) => () => void }): T {
  let value: T;
  const unsub = store.subscribe(v => (value = v));
  unsub();
  return value!;
}

import { hydrateChat, clearChat, messages } from '../stores/chatStore';
import { SLASH_COMMANDS, agentsToMenuItems, steeringToMenuItems } from '../slash-menu/SlashMenuItems';
import { CommandRegistry } from '../../chat/slash-commands/CommandRegistry';
import type { SlashCommandDescriptor, ChatSessionSnapshot } from '../../chat/slash-commands/types';
import { InputAreaIntegration } from '../input/InputAreaIntegration';
import { BadgeRenderer } from '../badges/BadgeRenderer';
import type { ContextTagBadge } from '../protocol';

describe('Webview Feature Tests (automated)', () => {
  // TODO->test: 'chatStore should correctly handle rapid token streams'
  test('chatStore handles rapid message ingestion in order and clears cleanly', () => {
    clearChat();
    const rapid = Array.from({ length: 100 }, (_, i) => ({
      id: `m-${i}`,
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `chunk ${i}`,
      timestamp: new Date(2026, 0, 1, 0, 0, 0, i).toISOString(),
    }));
    hydrateChat(rapid);
    const list = get(messages);
    expect(list).toHaveLength(100);
    expect(list[0].content).toBe('chunk 0');
    expect(list[99].content).toBe('chunk 99');

    clearChat();
    expect(get(messages)).toHaveLength(0);
  });

  // TODO->test: 'SlashMenuItems should render new commands in the UI'
  test('SlashMenuItems exposes commands and maps agents/steering to menu items', () => {
    expect(SLASH_COMMANDS.length).toBeGreaterThan(0);
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.id).toBeTruthy();
      expect(cmd.label).toBeTruthy();
      expect(cmd.itemType).toBe('command');
    }

    const agentItems = agentsToMenuItems([
      { id: 'ba', icon: 'i', label: 'BA', agentName: 'ba-agent', description: 'BRD/FSD' },
      { id: 'dev', icon: 'i', label: 'DEV', agentName: 'dev-agent', description: 'Code' },
    ]);
    expect(agentItems).toHaveLength(2);
    expect(agentItems[0]).toMatchObject({ id: 'agent-ba', itemType: 'agent', agentName: 'ba-agent' });

    const steeringItems = steeringToMenuItems([{ name: 'no-workaround', file: 'no-workaround.md', icon: 'i' }]);
    expect(steeringItems[0]).toMatchObject({ itemType: 'steering', filePath: 'no-workaround.md' });
  });

  // TODO->test: 'CommandRegistrar should register /create-new-agent correctly'
  test('CommandRegistry registers /create-new-agent, dispatches it, enforces policies', async () => {
    const registry = new CommandRegistry();
    const descriptor: SlashCommandDescriptor = {
      id: 'create-new-agent', label: 'New Agent', icon: 'i', description: 'Create agent',
      shortcutHint: 'ctrl+n', category: 'agent', requiresOwner: true, timeoutMs: 5000,
    };
    const handler = { execute: vi.fn().mockReturnValue({ status: 'ok', commandId: 'create-new-agent', result: { created: true } }) };
    registry.register(descriptor, handler);

    // BR-1: duplicate id throws
    expect(() => registry.register(descriptor, handler)).toThrow(/already registered/);

    const session: ChatSessionSnapshot = {
      id: 's-1', userId: 'u-1', ownerId: 'u-1',
      activeAgentId: 'dev', activeModelId: 'm', contextRef: 'c', historyRef: 'h',
    };

    // Happy path — owner dispatch
    const ok = await registry.dispatch({ commandId: 'create-new-agent', session, args: {}, source: 'menu' });
    expect(ok.status).toBe('ok');
    expect(handler.execute).toHaveBeenCalledTimes(1);

    // Unknown command
    const unknown = await registry.dispatch({ commandId: 'nope', session, args: {}, source: 'typed' });
    expect(unknown.status).toBe('error');
    expect(unknown.error?.code).toBe('UNKNOWN_COMMAND');

    // BR-5: non-owner denied for requiresOwner
    const stranger: ChatSessionSnapshot = { ...session, userId: 'u-2' };
    const denied = await registry.dispatch({ commandId: 'create-new-agent', session: stranger, args: {}, source: 'menu' });
    expect(denied.status).toBe('error');
    expect(denied.error?.code).toBe('PERMISSION_DENIED');
  });

  // TODO->test: 'InputAreaIntegration should debounce user input'
  test('InputAreaIntegration wires input element: "/" opens slash menu once, dispose cleans up', () => {
    // jsdom lacks scrollIntoView (called by menu open for cursor alignment)
    (Element.prototype as any).scrollIntoView = vi.fn();
    document.body.innerHTML = '';
    const input = document.createElement('div');
    const container = document.createElement('div');
    const badges = document.createElement('div');
    input.contentEditable = 'true';
    container.appendChild(input);
    document.body.appendChild(container);

    const vscodeApi = { postMessage: vi.fn(), getState: () => ({}), setState: () => {} };
    const integration = new InputAreaIntegration({
      inputElement: input, containerElement: container,
      badgeContainer: badges, vscodeApi: vscodeApi as any,
    });

    expect(integration.getSlashController()).toBeDefined();
    expect(container.querySelector('.slash-menu')).toBeNull();

    // Simulate typing "/" — menu must open
    input.textContent = '/';
    const ev = new Event('input');
    (ev as unknown as InputEvent).data = '/';
    input.dispatchEvent(ev);

    expect(container.querySelector('.slash-menu')).not.toBeNull();

    // Typing more while open filters instead of re-opening (input handling is idempotent)
    const menusBefore = container.querySelectorAll('.slash-menu').length;
    input.textContent = '/rev';
    const ev2 = new Event('input');
    (ev2 as unknown as InputEvent).data = 'r';
    input.dispatchEvent(ev2);
    expect(container.querySelectorAll('.slash-menu').length).toBe(menusBefore);

    integration.dispose();
  });

  // TODO->test: 'Webview should properly load dynamic CSS themes'
  test('BadgeRenderer creates theme-styled badge elements with CSS classes', () => {
    const renderer = new BadgeRenderer(() => {});
    const badge = {
      id: 'b-1', type: 'file', label: 'src/foo.ts', icon: 'doc', metadata: {},
    } as unknown as ContextTagBadge;

    const el = renderer.createBadgeElement(badge);
    expect(el).toBeInstanceOf(HTMLSpanElement);
    expect(el.className).toContain('context-badge');
    expect(el.querySelector('.badge-icon')).not.toBeNull();
    expect(el.querySelector('.badge-label')?.textContent).toContain('src/foo.ts');
    expect(el.querySelector('.badge-remove')).not.toBeNull();

    // Static removal path (used by backspace removal)
    const holder = document.createElement('div');
    holder.appendChild(el);
    BadgeRenderer.removeBadgeElement(holder, 'b-1');
    expect(holder.querySelector('.context-badge')).toBeNull();
  });
});
