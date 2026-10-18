/**
 * Per-run system prompt application (SA4E-336) + test-mode detection for
 * PiProvider.
 */
import { Agent } from '@earendil-works/pi-agent-core';
import type { SystemMessage } from '@earendil-works/pi-ai';

export function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
}

/**
 * SA4E-336: apply a per-run system prompt under pi-agent-core 0.99.1.
 *
 * In 0.99.1 `agent.state.systemPrompt` is READ-ONLY ("to change the prompt,
 * append a system message with content or sections"). We therefore append a
 * `SystemMessage` to the transcript instead of assigning the field directly.
 * Idempotent: skip when the live prompt already equals the desired text so the
 * same prompt is not re-appended on every turn (the transcript persists across
 * runs). This preserves the pre-upgrade "set the prompt for this run" intent.
 * @param agent Active pi-agent-core Agent
 * @param prompt Desired workspace system prompt for this run
 */
export function applySystemPrompt(agent: Agent, prompt: string): void {
  if (agent.state.systemPrompt === prompt) return;
  const systemMessage: SystemMessage = {
    role: 'system',
    content: prompt,
    timestamp: Date.now(),
  };
  agent.state.messages = [...agent.state.messages, systemMessage];
}
