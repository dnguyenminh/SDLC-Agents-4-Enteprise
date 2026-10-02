/**
 * FIX F — webview toolStore semantics for MCP_TOOL_RESULT
 * (messageListener: error → failToolCall, else → completeToolCall).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { toolState, addToolCall, completeToolCall, failToolCall } from '../stores/toolStore';

describe('FIX F — toolStore completes tool blocks with output', () => {
  beforeEach(() => {
    toolState.set({
      activeTools: new Map(),
      sessionApprovals: new Set(),
      sessionTypeApprovals: new Set(),
      sessionCommandPatterns: new Set(),
    });
  });

  it('completeToolCall sets status=completed and the output text', () => {
    addToolCall({ toolId: 't1', name: 'read', args: { path: 'a.ts' }, toolType: 'file', requiresApproval: false });
    expect(get(toolState).activeTools.get('t1')?.status).toBe('pending');

    completeToolCall('t1', 'file contents here');

    const tool = get(toolState).activeTools.get('t1');
    expect(tool?.status).toBe('completed');
    expect(tool?.output).toBe('file contents here');
  });

  it('failToolCall sets status=failed with the error as output', () => {
    addToolCall({ toolId: 't2', name: 'bash', args: { command: 'foo' }, toolType: 'shell', requiresApproval: false });
    failToolCall('t2', 'command not found: foo');

    const tool = get(toolState).activeTools.get('t2');
    expect(tool?.status).toBe('failed');
    expect(tool?.output).toBe('command not found: foo');
  });

  it('updates for unknown tool ids are ignored (never throw)', () => {
    expect(() => completeToolCall('ghost', 'x')).not.toThrow();
    expect(() => failToolCall('ghost', 'x')).not.toThrow();
  });
});
