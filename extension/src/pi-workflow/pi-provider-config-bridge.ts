import type { CredentialResolver } from './pi-provider.js';
import { debugError } from '../debug-logger.js';
import * as vscode from 'vscode';

export interface ProviderBridgeInput {
  secrets?: vscode.SecretStorage;
  providerId: string;
}

export interface ProviderBridgeResult {
  credentialResolver?: CredentialResolver;
}

/**
 * FIX A: the provider is NOT initialized at bridge time — model resolution CANNOT
 * happen here (it moved into PiWorkflowEngine.configureProvider, after init +
 * gateway registration). This builder only constructs the credential resolver.
 */
export function buildCredentialResolver(secrets?: vscode.SecretStorage): CredentialResolver | undefined {
  if (!secrets) return undefined;
  return async (providerId: string) => {
    const key = providerId === 'anthropic' || providerId === 'kiro'
      ? 'kiroSdlc.anthropicApiKey'
      : `kiroSdlc.${providerId}ApiKey`;
    try {
      return await secrets.get(key);
    } catch (err) {
      debugError(`[ProviderConfigBridge] Failed to read secret '${key}'`, err as Error);
      return undefined;
    }
  };
}

/** Back-compat alias. */
export function bridgeProviderConfig(input: ProviderBridgeInput): ProviderBridgeResult {
  return { credentialResolver: buildCredentialResolver(input.secrets) };
}
