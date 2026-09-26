import { SettingsManager } from './settings-manager';
import { CredentialsManager, CredentialRef } from './credentials-manager';
import { PromptTemplateService, PromptTemplate } from './prompt-template.service';
import { logger } from '../logger';

export interface SessionConfigParams {
  model: string;
  thinkingLevel?: 'low' | 'medium' | 'high';
  scopedModels?: string[];
  modelRuntime?: string;
  settingsManager?: SettingsManager;
  credentials?: CredentialRef;
  promptsOverride?: PromptTemplate[];
}

export class SessionConfigurator {
  private static readonly SUPPORTED_MODELS = new Set<string>([
    'gpt-4o-mini',
    'gpt-4o',
    'claude-3',
    'claude-3-opus',
  ]);

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

  static buildSessionConfig(params: SessionConfigParams): Record<string, unknown> {
    // Validate
    try {
      SessionConfigurator.validateModel(params.model);
    } catch {
      logger.warn('Invalid model, fallback to default');
      params.model = 'gpt-4o-mini';
    }
    SessionConfigurator.validateThinkingLevel(params.thinkingLevel);

    const config: Record<string, unknown> = {
      model: params.model,
      thinkingLevel: params.thinkingLevel ?? 'medium',
      scopedModels: params.scopedModels ?? [],
      modelRuntime: params.modelRuntime,
    };

    if (params.settingsManager) {
      config.settingsManager = params.settingsManager.getSettings();
    }

    if (params.credentials) {
      // Do not embed secret, just key reference
      config.credentials = {
        credentialKey: params.credentials.credentialKey,
        credentialValueRef: params.credentials.credentialValueRef,
      };
    }

    return config;
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
    const sessionConfig = SessionConfigurator.buildSessionConfig(params);
    const fullConfig = {
      cwd,
      sessionManager,
      ...sessionConfig,
    };
    return sdk.createAgentSession(fullConfig);
  }
}
