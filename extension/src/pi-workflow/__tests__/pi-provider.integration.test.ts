/**
 * Integration tests for Pi Provider — SA4E-290
 * Tests real component interaction with mocked SDK
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PiProviderImpl, createPiProvider } from '../pi-provider';

describe('PiProvider Integration', () => {
  let provider: PiProviderImpl;

  beforeEach(() => {
    provider = createPiProvider();
  });

  it('should complete full lifecycle: init -> createAgent -> stream -> handleToolUse', async () => {
    await provider.initialize({ transportType: 'WebSocket', sessionId: 'sess-123' });
    const agent = await provider.createAgent('sdlc-agent');
    expect(agent.sessionId).toBeDefined();

    const chunks: any[] = [];
    for await (const chunk of provider.stream({ agentId: 'sdlc-agent', messages: [{ role: 'user', content: 'test' }] })) {
      chunks.push(chunk);
    }
    expect(chunks.some(c => c.type === 'text')).toBe(true);

    const toolResult = await provider.handleToolUse({ id: 't1', name: 'search', arguments: { q: 'test' } });
    expect(toolResult.toolCallId).toBe('t1');
  });

  it('should preserve backward compatible state fields mapping', async () => {
    await provider.initialize({ transportType: 'HTTP' });
    const agent = await provider.createAgent('agent-compat');
    // Verify agent has expected fields for PipelineState mapping
    expect(agent).toHaveProperty('id');
    expect(agent).toHaveProperty('sessionId');
  });
});
