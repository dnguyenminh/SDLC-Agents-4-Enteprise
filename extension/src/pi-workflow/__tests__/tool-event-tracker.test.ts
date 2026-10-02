import { describe, it, expect } from 'vitest';
import { ToolEventTracker, extractToolResultText, mapAgentEvent, MAX_TOOL_RESULT_CHARS } from '../pi-event-mapper.js';
import type { EventCollector } from '../pi-event-mapper.js';
import type { AgentEvent } from '@earendil-works/pi-agent-core';

describe('ToolEventTracker', () => {
  it('maps start events with id, name and args', () => {
    const tracker = new ToolEventTracker();
    const out = tracker.observe({
      type: 'tool_execution_start',
      toolCallId: 't1',
      toolName: 'read',
      args: { path: 'a.ts' },
    } as unknown as AgentEvent);
    expect(out).toMatchObject({ phase: 'start', id: 't1', name: 'read', args: { path: 'a.ts' } });
  });

  it('maps matching end events with status and duration', () => {
    const tracker = new ToolEventTracker();
    tracker.observe({ type: 'tool_execution_start', toolCallId: 't1', toolName: 'bash', args: {} } as unknown as AgentEvent);
    const out = tracker.observe({
      type: 'tool_execution_end',
      toolCallId: 't1',
      toolName: 'bash',
      isError: false,
    } as unknown as AgentEvent);
    expect(out?.phase).toBe('end');
    expect(out?.id).toBe('t1');
    expect(out?.isError).toBe(false);
    expect(typeof out?.durationMs).toBe('number');
  });

  it('flags failed executions', () => {
    const tracker = new ToolEventTracker();
    tracker.observe({ type: 'tool_execution_start', toolCallId: 't9', toolName: 'edit', args: {} } as unknown as AgentEvent);
    const out = tracker.observe({
      type: 'tool_execution_end',
      toolCallId: 't9',
      toolName: 'edit',
      isError: true,
    } as unknown as AgentEvent);
    expect(out?.isError).toBe(true);
  });

  it('ignores end without start, missing ids and non-tool events', () => {
    const tracker = new ToolEventTracker();
    expect(
      tracker.observe({ type: 'tool_execution_end', toolCallId: 'ghost', toolName: 'x' } as unknown as AgentEvent)
    ).toBeUndefined();
    expect(
      tracker.observe({ type: 'tool_execution_start', toolName: 'x' } as unknown as AgentEvent)
    ).toBeUndefined();
    expect(tracker.observe({ type: 'message_update' } as unknown as AgentEvent)).toBeUndefined();
  });

  it('never throws on garbage input', () => {
    const tracker = new ToolEventTracker();
    expect(() => tracker.observe(undefined as never)).not.toThrow();
    expect(() => tracker.observe(null as never)).not.toThrow();
    expect(tracker.observe(undefined as never)).toBeUndefined();
  });
});

describe('FIX F — tool_execution_end result extraction', () => {
  it('extracts text content onto the end event', () => {
    const tracker = new ToolEventTracker();
    tracker.observe({ type: 'tool_execution_start', toolCallId: 't2', toolName: 'read', args: {} } as unknown as AgentEvent);
    const out = tracker.observe({
      type: 'tool_execution_end',
      toolCallId: 't2',
      toolName: 'read',
      isError: false,
      result: { content: [{ type: 'text', text: 'file contents here' }] },
    } as unknown as AgentEvent);
    expect(out?.phase).toBe('end');
    expect(out?.result).toBe('file contents here');
    expect(out?.isError).toBe(false);
  });

  it('carries the error text of a failed execution too', () => {
    const tracker = new ToolEventTracker();
    tracker.observe({ type: 'tool_execution_start', toolCallId: 't3', toolName: 'bash', args: {} } as unknown as AgentEvent);
    const out = tracker.observe({
      type: 'tool_execution_end',
      toolCallId: 't3',
      toolName: 'bash',
      isError: true,
      result: { content: [{ type: 'text', text: 'command not found: foo' }] },
    } as unknown as AgentEvent);
    expect(out?.isError).toBe(true);
    expect(out?.result).toBe('command not found: foo');
  });

  it('extractToolResultText joins multiple text parts, skips images', () => {
    expect(
      extractToolResultText({ content: [{ type: 'text', text: 'a' }, { type: 'image', data: 'xx' }, { type: 'text', text: 'b' }] })
    ).toBe('a\nb');
    expect(extractToolResultText({ content: 'plain string' })).toBe('plain string');
    expect(extractToolResultText('bare')).toBe('bare');
    expect(extractToolResultText(undefined)).toBeUndefined();
    expect(extractToolResultText(null)).toBeUndefined();
    expect(extractToolResultText({ content: [{ type: 'image', data: 'xx' }] })).toBeUndefined();
  });

  it('truncates oversized results at MAX_TOOL_RESULT_CHARS', () => {
    const big = 'x'.repeat(MAX_TOOL_RESULT_CHARS + 5000);
    const out = extractToolResultText({ content: [{ type: 'text', text: big }] });
    expect(out).toBeDefined();
    expect(out!.length).toBeLessThan(big.length);
    expect(out).toContain('[truncated');
  });
});

describe('BUG H — mapAgentEvent does not surface per-tool failures as message-level errors', () => {
  it('a failed tool_execution_end pushes NO error chunk and sets NO errorMessage', () => {
    const collector: EventCollector = { chunks: [], toolCalls: [], text: '' };
    mapAgentEvent(
      {
        type: 'tool_execution_end',
        toolCallId: 't1',
        toolName: 'bash',
        isError: true,
        result: { content: [{ type: 'text', text: "dir: cannot access '/b'" }] },
      } as unknown as AgentEvent,
      collector
    );
    expect(collector.chunks).toHaveLength(0);
    expect(collector.errorMessage).toBeUndefined();
  });

  it('a failed tool still counts nothing against the turn (no chunks at all)', () => {
    const collector: EventCollector = { chunks: [], toolCalls: [], text: '' };
    for (let i = 0; i < 5; i++) {
      mapAgentEvent(
        {
          type: 'tool_execution_end',
          toolCallId: `t${i}`,
          toolName: 'bash',
          isError: true,
          result: { content: [{ type: 'text', text: 'command not found' }] },
        } as unknown as AgentEvent,
        collector
      );
    }
    expect(collector.chunks).toHaveLength(0);
    expect(collector.errorMessage).toBeUndefined();
  });

  it('tool_execution_start still pushes the tool_call chunk (unchanged)', () => {
    const collector: EventCollector = { chunks: [], toolCalls: [], text: '' };
    mapAgentEvent(
      { type: 'tool_execution_start', toolCallId: 't1', toolName: 'read', args: { path: 'a.ts' } } as unknown as AgentEvent,
      collector
    );
    expect(collector.chunks).toHaveLength(1);
    expect(collector.chunks[0].type).toBe('tool_call');
    expect(collector.toolCalls).toHaveLength(1);
  });
});
