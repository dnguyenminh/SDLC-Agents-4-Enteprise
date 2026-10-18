/**
 * PiProviderCompat — compatibility surface over the run lifecycle:
 * agent creation stub, stream-as-AsyncIterable, delegated tool handling,
 * abort, and dispose (SEC-289-01).
 */
import type { ToolCall, ToolResult, PiInput, PiStreamChunk, PiAgent } from '../pi-provider-types.js';
import { debugLog } from '../../debug-logger.js';
import { PiProviderRunLifecycle } from './run-lifecycle.js';

export class PiProviderCompat extends PiProviderRunLifecycle {
  async createAgent(agentId: string, tools?: unknown[]): Promise<PiAgent> {
    if (!this.initialized || !this.agent) {
      throw new Error('PI_NOT_INITIALIZED: Provider must be initialized first');
    }
    if (!agentId || agentId.trim() === '') {
      throw new Error('PI_AGENT_CREATE_FAILED: agentId is required');
    }
    return { agentId, tools, sdkInstance: this.agent };
  }

  /** Compat: stream as AsyncIterable over the Agent's run events. */
  async *stream(input: PiInput): AsyncIterable<PiStreamChunk> {
    const result = await this.run(input);
    for (const chunk of result.chunks) {
      yield chunk;
    }
  }

  async handleToolUse(toolCall: ToolCall): Promise<ToolResult> {
    if (!this.initialized || !this.agent) {
      throw new Error('PI_NOT_INITIALIZED: Provider must be initialized first');
    }
    // Tool execution is owned by the Agent loop (tool_execution_* events in run()).
    debugLog(`[PiProvider] handleToolUse delegated to Agent loop: ${toolCall.name}`);
    return { toolCallId: toolCall.id, result: { delegated: true, tool: toolCall.name } };
  }

  /** Abort the current run if active. */
  abort(): void {
    this.agent?.abort();
  }

  dispose(): void {
    this.agent?.abort();
    this.agent = undefined;
    this.models = undefined;
    this.initialized = false;
  }
}
