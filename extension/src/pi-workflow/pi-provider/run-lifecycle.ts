/**
 * PiProviderRunLifecycle — initialize/run/turn orchestration over
 * PiProviderBase (SA4E-334, PI-MODEL-FALLBACK, Fix J).
 */
import type { Agent } from '@earendil-works/pi-agent-core';
import type { BeforeToolCallContext, BeforeToolCallResult } from '@earendil-works/pi-agent-core';
import { isRetryableLlmError } from '../utils/classify-llm-error.js';
import type { PiProviderConfig } from '../pi-provider-config.js';
import type { PiRunInput, PiRunResult } from '../pi-provider-types.js';
import { debugLog, debugError } from '../../debug-logger.js';
import { applySystemPrompt, isTestMode } from './system-prompt.js';
import { initializeSdk } from './initialize.js';
import { promptOnCurrentModel, collectResult } from './turn-runner.js';
import type { EventCollector } from '../pi-event-mapper.js';
import type { TurnBudgetGuard } from '../turn-budget-guard.js';
import { PiProviderBase } from './pi-provider-base.js';

export class PiProviderRunLifecycle extends PiProviderBase {
  /**
   * SDK `beforeToolCall` hook: runs AFTER tool_execution_start but BEFORE the
   * tool body executes, so a rejection truly prevents execution (the old
   * post-hoc ApprovalAdapter loop ran after the whole agent turn — bash had
   * already executed, then the turn hung on an approval nobody could give).
   * Fails CLOSED: an approval-system error blocks instead of running unguarded.
   */
  private async gateBeforeToolCall(context: BeforeToolCallContext): Promise<BeforeToolCallResult | undefined> {
    if (!this.toolApproval) return undefined;
    try {
      const res = await this.toolApproval.requestApproval({
        toolUseId: context.toolCall.id,
        toolName: context.toolCall.name,
        input: (context.args ?? {}) as Record<string, unknown>,
      });
      return res.approved ? undefined : { block: true, reason: res.reason || 'Tool approval required' };
    } catch (err) {
      debugError('[PiProvider] tool approval check failed — blocking tool call', err as Error);
      return { block: true, reason: `Approval check failed: ${(err as Error).message}` };
    }
  }

  async initialize(config: PiProviderConfig): Promise<void> {
    if (!config || !config.transportType || !['WebSocket', 'HTTP'].includes(config.transportType)) {
      throw new Error('PI_CONFIG_INVALID: Invalid transport type');
    }
    if (this.initialized && this.agent) return;

    // SEC-289-01/06: allowStub is only respected in test environments, never in production
    const safeConfig: PiProviderConfig = { ...config };
    if (safeConfig.allowStub && !isTestMode()) {
      delete safeConfig.allowStub;
    }
    this.config = safeConfig;

    try {
      const sdk = await initializeSdk(safeConfig, {
        streamFn: (model, context, options) => this.streamWithBudgetGate(model, context, options),
        getApiKey: this.credentialResolver,
        beforeToolCall: (context) => this.gateBeforeToolCall(context),
      });
      this.credentialStore = sdk.credentialStore;
      this.models = sdk.models;
      this.agent = sdk.agent;
    } catch (err) {
      debugError('[PiProvider] Failed to initialize pi-agent-core Agent', err as Error);
      this.agent = undefined;
      throw err instanceof Error && err.message.startsWith('PI_')
        ? err
        : new Error(`PI_SDK_UNAVAILABLE: pi-agent-core Agent could not be created (${(err as Error).message})`);
    }

    this.initialized = true;
  }

  /**
   * Run a prompt through the real Agent and collect streamed output.
   * Streaming arrives via Agent.subscribe events (message_update / tool_execution_*), not a generator.
   *
   * CONCURRENCY-FIX: the Agent has a single activeRun; calling prompt() while one is active throws
   * "Agent is already processing a prompt". We serialize here: a new run() chains after the previous
   * in-flight one instead of overlapping the SDK Agent.
   */
  async run(input: PiRunInput): Promise<PiRunResult> {
    if (!this.initialized || !this.agent) {
      throw new Error('PI_NOT_INITIALIZED: Provider must be initialized first');
    }
    // Serialize: never call agent.prompt() while a previous run is active.
    const prev = this.running ?? Promise.resolve();
    const exec = prev.catch(() => {}).then(() => this.runOnce(input));
    this.running = exec.finally(() => {
      if (this.running === exec) this.running = undefined;
    });
    return this.running;
  }

  /**
   * The turn on the Agent. Only ever invoked sequentially via run().
   *
   * PI-MODEL-FALLBACK: try each model in the resolved chain in order. When a model
   * fails with a TRANSIENT gateway/upstream error (5xx, timeout, bridge sandbox…),
   * move on to the next model with the SAME prompt. Stop on first success, on a
   * non-retryable error (4xx/auth/bad-request), or when the chain is exhausted.
   */
  private async runOnce(input: PiRunInput): Promise<PiRunResult> {
    const agent = this.agent!;
    if (input.tools) { agent.state.tools = input.tools; }
    if (input.systemPrompt) { applySystemPrompt(agent, input.systemPrompt); }
    const providerId = input.provider ?? this.providerId;
    const chain = this.buildRunChain(input.provider, input.model);
    // No chain (no configured model at all) → single attempt on the agent's current model.
    const attempts = chain.length > 0 ? chain : [this.modelId ?? ''];

    let lastResult: PiRunResult | undefined;
    for (let i = 0; i < attempts.length; i++) {
      const modelId = attempts[i];
      this.selectModelForAttempt(agent, providerId, modelId);

      const result = await promptOnCurrentModel(agent, input.prompt, input.turnBudget, input.onToolEvent);
      if (!result.errorMessage) {
        if (i > 0) { debugLog(`[PiProvider] Recovered on fallback model '${modelId}' (attempt ${i + 1}/${attempts.length}).`); }
        return result;
      }

      lastResult = result;
      const isLast = i === attempts.length - 1;
      if (isLast || !isRetryableLlmError(result.errorMessage)) {
        if (!isLast) { debugLog(`[PiProvider] Non-retryable error on '${modelId}' — not falling back: ${result.errorMessage}`); }
        break;
      }
      debugLog(`[PiProvider] Model '${modelId}' failed transiently (${result.errorMessage}) — trying next fallback.`);
    }
    return lastResult ?? { text: '', toolCalls: [], chunks: [{ type: 'done' }], messages: agent.state.messages.slice() };
  }

  /**
   * PI-MODEL-FALLBACK: build the ordered candidate chain for a run.
   * Primary model (the one currently on the agent, or the run's requested model)
   * goes first, followed by the configured fallbacks (deduped, primary removed).
   */
  private buildRunChain(primaryProviderId?: string, primaryModelId?: string): string[] {
    const chain: string[] = [];
    const push = (id?: string) => {
      const t = id?.trim();
      if (t && !chain.includes(t)) chain.push(t);
    };
    push(primaryModelId ?? this.modelId);
    // Only append fallbacks that belong to the same provider registry as the primary.
    const providerId = primaryProviderId ?? this.providerId;
    if (providerId && this.models) {
      for (const id of this.fallbackModelIds) {
        if (this.models.getModel(providerId, id)) push(id);
      }
    }
    return chain;
  }

  /** PI-MODEL-FALLBACK: point the agent at a specific model id before an attempt. */
  private selectModelForAttempt(agent: Agent, providerId: string | undefined, modelId: string): void {
    if (!modelId || !providerId || !this.models) return;
    const model = this.models.getModel(providerId, modelId);
    if (model) {
      agent.state.model = model;
      this.activeModelId = modelId; // SA4E-355: the intra-turn gate labels the budget with the ACTIVE model
    } else {
      debugLog(`[PiProvider] Model '${modelId}' not found for '${providerId}' — using current default.`);
    }
  }

  /**
   * FIX E (K2, SA4E-368): snapshot the agent transcript + finalize chunks and
   * error status. Kept as a private method — the unit suite binds it off the
   * instance (established pattern); the implementation lives in ./turn-runner.ts.
   */
  private collectResult(agent: Agent, collector: EventCollector, guard?: TurnBudgetGuard): PiRunResult {
    return collectResult(agent, collector, guard);
  }
}
