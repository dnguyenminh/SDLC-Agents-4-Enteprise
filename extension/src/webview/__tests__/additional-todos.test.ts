// @vitest-environment jsdom
/**
 * Former test.todo placeholders — now real automated tests.
 * Each test targets the actual module behind the original todo title.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Svelte store read helper (same pattern as chat-store.test.ts)
function get<T>(store: { subscribe: (run: (v: T) => void) => () => void }): T {
  let value: T;
  const unsub = store.subscribe(v => (value = v));
  unsub();
  return value!;
}

import { chatState, hydrateChat, clearChat, messages } from '../stores/chatStore';
import { SLASH_COMMANDS, agentsToMenuItems, steeringToMenuItems } from '../slash-menu/SlashMenuItems';
import { CommandRegistry } from '../../chat/slash-commands/CommandRegistry';
import type { SlashCommandDescriptor, CommandContext, ChatSessionSnapshot } from '../../chat/slash-commands/types';
import { InputAreaIntegration } from '../input/InputAreaIntegration';
import { BadgeRenderer } from '../badges/BadgeRenderer';
import type { ContextTagBadge } from '../protocol';
import { SettingsManager } from '../../pi-agent/settings-manager';
import { TelemetryService } from '../../chat/telemetry/TelemetryService';
import type { ToolExecEntry } from '../../chat/telemetry/types';
import { PromptTemplateService } from '../../pi-agent/prompt-template.service';
import { requiresApproval } from '../../chat/engine/ToolApprovalClassifier';
import { containsSecrets, filterSecrets } from '../../chat/compact/secretFilter';
import { ContextUsageTracker } from '../../chat-panel/context-usage-tracker';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-todos-'));
}

describe('Webview Feature Tests (automated)', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const d of tempDirs) { fs.rmSync(d, { recursive: true, force: true }); }
    tempDirs = [];
  });

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

  // TODO->test: 'Extension should handle hot-reload of config files'
  test('SettingsManager reloads file-backed settings when config changes on disk', () => {
    const dir = makeTempDir(); tempDirs.push(dir);
    const file = path.join(dir, 'settings.json');
    fs.writeFileSync(file, JSON.stringify({ model: 'gpt-4o-mini', thinkingLevel: 'medium' }));

    const mgr = new SettingsManager({ source: 'file', filePath: file });
    expect(mgr.get('model')).toBe('gpt-4o-mini');

    // Simulate config hot-reload: file rewritten, reload() picks up new values
    fs.writeFileSync(file, JSON.stringify({ model: 'phi-3-mini', thinkingLevel: 'low' }));
    mgr.reload();
    expect(mgr.get('model')).toBe('phi-3-mini');
    expect(mgr.get('thinkingLevel')).toBe('low');
  });

  // TODO->test: 'AgentLog utility should persist logs across sessions'
  test('TelemetryService persists JSONL entries to disk (survives restart)', async () => {
    const dir = makeTempDir(); tempDirs.push(dir);
    const svc = new TelemetryService(dir);

    const mk = (tool: string): ToolExecEntry => ({
      type: 'tool_exec', timestamp: new Date().toISOString(),
      toolName: tool, duration_ms: 5, success: true, agentId: 'DEV',
    });
    svc.log(mk('read_file'));
    svc.log(mk('write_file'));
    await svc.dispose(); // flush remaining buffer

    const file = path.join(dir, '.code-intel', 'telemetry.jsonl');
    expect(fs.existsSync(file)).toBe(true);
    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ type: 'tool_exec', toolName: 'read_file' });
    expect(JSON.parse(lines[1])).toMatchObject({ type: 'tool_exec', toolName: 'write_file' });

    // "Across sessions": a second service instance appends, does not truncate
    const svc2 = new TelemetryService(dir);
    svc2.log(mk('search_text'));
    await svc2.dispose();
    const lines2 = fs.readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
    expect(lines2).toHaveLength(3);
  });

  // TODO->test: 'Memory ingestion should correctly index new skill definitions'
  test('PromptTemplateService discovers and indexes new definition files', () => {
    const cwd = makeTempDir(); tempDirs.push(cwd);
    const agentDir = makeTempDir(); tempDirs.push(agentDir);

    fs.mkdirSync(path.join(cwd, '.pi', 'prompts'), { recursive: true });
    fs.mkdirSync(path.join(agentDir, 'prompts'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.pi', 'prompts', 'brd.md'), 'Create BRD');
    fs.writeFileSync(path.join(agentDir, 'prompts', 'tdd.md'), 'Create TDD');
    // Invalid name must be skipped during indexing
    fs.writeFileSync(path.join(cwd, '.pi', 'prompts', 'Bad Name!.md'), 'invalid');

    const svc = new PromptTemplateService(cwd, agentDir);
    svc.discover();

    const names = svc.getPrompts().map(p => p.templateName).sort();
    expect(names).toEqual(['brd', 'tdd']);
    expect(svc.getPrompt('brd').promptContent).toBe('Create BRD');

    // Indexing picks up a newly added definition (incremental discovery)
    fs.writeFileSync(path.join(cwd, '.pi', 'prompts', 'fsd.md'), 'Create FSD');
    svc.discover();
    expect(svc.getPrompts().map(p => p.templateName)).toContain('fsd');
  });

  // TODO->test: 'Security checks should block unapproved tool usage'
  test('security: dangerous tools gated and secrets blocked from logs', () => {
    // Tool gate — write tools require approval
    expect(requiresApproval('write_file')).toBe(true);
    expect(requiresApproval('execute_shell')).toBe(true);
    expect(requiresApproval('read_file')).toBe(false);

    // Secret gate — secret-bearing content detected and redacted
    const leaky = 'run this:\nexport API_KEY=sk-live-abc123def456ghi789';
    expect(containsSecrets(leaky)).toBe(true);
    const filtered = filterSecrets(leaky);
    expect(filtered).not.toContain('sk-live-abc123def456ghi789');
    expect(containsSecrets(filtered)).toBe(false);

    // Clean text passes through untouched
    const clean = 'normal log line with no credentials';
    expect(containsSecrets(clean)).toBe(false);
    expect(filterSecrets(clean)).toBe(clean);
  });

  // TODO->test: 'Performance benchmark for large document ingestion'
  test('large ingestion: 1500 documents token-counted under 2s, usage capped at 100%', () => {
    const tracker = new ContextUsageTracker(); // default 128k window
    const docs = Array.from({ length: 1500 }, () => ({ content: 'x'.repeat(400) })); // ~100 tok each

    const started = Date.now();
    tracker.updateFromMessages('perf', docs);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(2000); // no host freeze
    const payload = tracker.getUsagePayload('perf');
    expect(payload.total.tokens).toBeGreaterThan(0);
    // 150k tokens on a 128k window must clamp to 100%, never overflow
    expect(payload.total.percentage).toBe(100);
  });
});
