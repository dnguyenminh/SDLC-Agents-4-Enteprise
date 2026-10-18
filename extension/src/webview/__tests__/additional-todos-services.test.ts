// @vitest-environment jsdom
/**
 * Former test.todo placeholders — now real automated tests (services/security/perf concerns).
 * Each test targets the actual module behind the original todo title.
 * Split from additional-todos.test.ts.
 */

import { describe, test, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
