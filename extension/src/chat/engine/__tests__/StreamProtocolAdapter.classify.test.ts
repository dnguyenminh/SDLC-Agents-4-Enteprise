/**
 * SA4E-336 — TC-06: classifyTool maps 'powershell' (and 'bash') → 'shell'.
 * classifyTool is private; exercised via the chat:toolCall → TOOL_CALL_REQUEST
 * mapping, which carries the resolved toolType.
 */
import { describe, it, expect } from 'vitest';
import { StreamProtocolAdapter } from '../StreamProtocolAdapter';
import type { ToolCallEvent } from '../IStreamProtocolAdapter';

function toolCall(name: string): ToolCallEvent {
  return { type: 'chat:toolCall', toolCall: { id: 't1', name, args: {}, status: 'running' } };
}

function toolTypeOf(name: string): string | undefined {
  const msgs = new StreamProtocolAdapter().handleEngineEvent(toolCall(name));
  const req = msgs.find((m) => m.type === 'TOOL_CALL_REQUEST') as { toolType?: string } | undefined;
  return req?.toolType;
}

describe('StreamProtocolAdapter.classifyTool (SA4E-336 TC-06)', () => {
  it('powershell → shell', () => {
    expect(toolTypeOf('powershell')).toBe('shell');
  });

  it('bash → shell (regression)', () => {
    expect(toolTypeOf('bash')).toBe('shell');
  });

  it('shell_execute / terminal still → shell', () => {
    expect(toolTypeOf('shell_execute')).toBe('shell');
    expect(toolTypeOf('terminal_run')).toBe('shell');
  });

  it('non-shell tools keep their category', () => {
    expect(toolTypeOf('write_file')).toBe('file');
    expect(toolTypeOf('grep_search')).toBe('search');
    expect(toolTypeOf('some_mcp_tool')).toBe('mcp');
  });
});
