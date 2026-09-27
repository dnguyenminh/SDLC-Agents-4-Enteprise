import { SettingsManager } from './settings-manager';
import { CredentialRef } from './credentials-manager';
import { PromptTemplate } from './prompt-template.service';
import { logger } from '../logger';
import {
  DEFAULT_MODEL_ID,
  DEFAULT_MODEL_REGISTRY,
  ModelRegistry,
  ModelRegistryEntry,
  ThinkingLevel,
} from './model-registry';
import {
  BudgetCalculator,
  BudgetResult,
  ContextBudgetError,
  ContextBudgetInputs,
  ThresholdGate,
  ThresholdResult,
} from '../mcp/context-budget';
import { ThinkingLevelMapper } from './thinking-level-mapper';

export interface SessionConfigParams {
  model: string;
  thinkingLevel?: ThinkingLevel;
  scopedModels?: string[];
  modelRuntime?: string;
  settingsManager?: SettingsManager;
  credentials?: CredentialRef;
  promptsOverride?: PromptTemplate[];
  contextBudget?: ContextBudgetInputs;
}

export interface SessionDiagnostics {
  model: string;
  fallbackFrom?: string;
  contextWindow: number;
  maxTokens: number;
  estimatedTokens: number;
  usagePercent: number;
  decision: ThresholdResult['decision'];
}

interface ResolvedModel {
  model: string;
  fallbackFrom?: string;
  entry: ModelRegistryEntry;
}

export class SessionConfigurator {
  private static readonly registry: ModelRegistry = DEFAULT_MODEL_REGISTRY;
  private static readonly mapper = new ThinkingLevelMapper(DEFAULT_MODEL_REGISTRY);
  private static readonly SUPPORTED_MODELS = new Set<string>(DEFAULT_MODEL_REGISTRY.listModels());

  static validateModel(model: string): void {
    if (!SessionConfigurator.SUPPORTED_MODELS.has(model)) {
      throw new Error(`Invalid model '${model}'. Supported: ${Array.from(SessionConfigurator.SUPPORTED_MODELS).join(', ')}`);
    }
  }

  static validateThinkingLevel(level?: string): void {
    if (level && !['low', 'medium', 'high'].includes(level)) {
      throw new Error(`Invalid thinkingLevel '${level}'. Must be low/medium/high`);
    }
  }

  static getModelMetadata(modelId: string): ModelRegistryEntry | undefined {
    return SessionConfigurator.registry.get(modelId);
  }

  static calculateBudget(modelId: string, inputs?: ContextBudgetInputs): BudgetResult {
    const resolved = SessionConfigurator.resolveModel(modelId);
    const result = BudgetCalculator.calculateBudget(resolved.entry.contextWindow, inputs);
    if (result.conservative) {
      logger.warn('Context budget estimation error - conservative estimate used', { modelId });
    }
    return result;
  }

  static evaluateThreshold(usagePercent: number): ThresholdResult {
    return ThresholdGate.evaluate(usagePercent);
  }

  static mapThinkingLevel(modelId: string, level?: string): number {
    return SessionConfigurator.mapper.map(modelId, level);
  }

  static buildSessionConfig(params: SessionConfigParams): Record<string, unknown> {
    SessionConfigurator.validateThinkingLevel(params.thinkingLevel);
    const resolved = SessionConfigurator.resolveModel(params.model);
    if (resolved.fallbackFrom) {
      logger.warn('Model not found, using default', { requested: resolved.fallbackFrom, model: resolved.model });
    }
    const config: Record<string, unknown> = {
      model: resolved.model,
      thinkingLevel: params.thinkingLevel ?? 'medium',
      maxTokens: SessionConfigurator.mapThinkingLevel(resolved.model, params.thinkingLevel),
      scopedModels: params.scopedModels ?? [],
      modelRuntime: params.modelRuntime,
    };
    SessionConfigurator.attachExternalConfig(config, params);
    return config;
  }

  private static attachExternalConfig(config: Record<string, unknown>, params: SessionConfigParams): void {
    if (params.settingsManager) {
      config.settingsManager = params.settingsManager.getSettings();
    }
    if (params.credentials) {
      config.credentials = {
        credentialKey: params.credentials.credentialKey,
        credentialValueRef: params.credentials.credentialValueRef,
      };
    }
  }

  static createAgentSession(
    sdk: {
      SessionManager: { inMemory(cwd: string): unknown };
      createAgentSession(config: any): unknown;
    },
    cwd: string,
    params: SessionConfigParams
  ): unknown {
    const sessionManager = sdk.SessionManager.inMemory(cwd);
    const gate = SessionConfigurator.enforceBudgetGate(params);
    const sessionConfig = SessionConfigurator.buildSessionConfig(params);
    const diagnostics = SessionConfigurator.buildDiagnostics(params.model, gate, sessionConfig);
    return sdk.createAgentSession({
      cwd,
      sessionManager,
      diagnostics,
      ...sessionConfig,
    });
  }

  private static enforceBudgetGate(params: SessionConfigParams): { budget: BudgetResult; threshold: ThresholdResult } {
    const budget = SessionConfigurator.calculateBudget(params.model, params.contextBudget);
    const threshold = SessionConfigurator.evaluateThreshold(budget.usagePercent);
    if (threshold.decision === 'REJECT') {
      logger.error('Context budget rejected session creation', {
        model: params.model,
        usagePercent: budget.usagePercent,
      });
      throw new ContextBudgetError(threshold.message, budget);
    }
    if (threshold.decision === 'WARN') {
      logger.warn(threshold.message, { model: params.model });
    }
    return { budget, threshold };
  }

  private static buildDiagnostics(
    requestedModel: string,
    gate: { budget: BudgetResult; threshold: ThresholdResult },
    sessionConfig: Record<string, unknown>
  ): SessionDiagnostics {
    const resolved = SessionConfigurator.resolveModel(requestedModel);
    return {
      model: resolved.model,
      fallbackFrom: resolved.fallbackFrom,
      contextWindow: resolved.entry.contextWindow,
      maxTokens: sessionConfig.maxTokens as number,
      estimatedTokens: gate.budget.estimatedTokens,
      usagePercent: Math.round(gate.budget.usagePercent * 10) / 10,
      decision: gate.threshold.decision,
    };
  }

  private static resolveModel(requested: string): ResolvedModel {
    const entry = SessionConfigurator.registry.get(requested);
    if (entry) {
      return { model: requested, entry };
    }
    const defaultEntry = SessionConfigurator.registry.get(DEFAULT_MODEL_ID);
    if (!defaultEntry) {
      throw new Error(`Model '${requested}' not found and default '${DEFAULT_MODEL_ID}' unavailable`);
    }
    return { model: DEFAULT_MODEL_ID, fallbackFrom: requested, entry: defaultEntry };
  }
}
