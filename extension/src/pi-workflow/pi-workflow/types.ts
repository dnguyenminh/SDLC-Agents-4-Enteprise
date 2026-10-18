/**
 * PiWorkflowEngine configuration contracts (DI options + provider bridging).
 */

import type { RemoteCheckpointerStore } from '../checkpointer-adapter.js';
import type { CredentialResolver, IPiProvider } from '../pi-provider.js';
import type { ToolApprovalGateHandler } from '../approval-adapter.js';
import type { MutableModels } from '@earendil-works/pi-ai';

export interface PiWorkflowConfig {
  provider?: IPiProvider;
  remoteStore?: RemoteCheckpointerStore;
  gateHandler?: ToolApprovalGateHandler;
  /** DI: shared Models registry (tests inject the faux provider here). */
  models?: MutableModels;
}

export interface ConfigureProviderOptions {
  credentialResolver?: CredentialResolver;
  providerId?: string;
  /** FIX A: the RAW configured model value (sdlcAgents.llmModel, may be "" or "auto"). */
  configuredModelId?: string;
  /** FIX 4: custom OpenAI-compatible gateway base URL (e.g. http://localhost:20128/v1). */
  baseUrl?: string;
  /** PI-MODEL-FALLBACK: ordered fallback model ids tried on transient gateway errors. */
  fallbackModelIds?: string[];
}

export interface ConfigureProviderResult {
  resolvedModelId?: string;
  modelUnresolved?: boolean;
  /** FIX C: whether the credential resolver yielded an API key (seeded into pi-ai auth). */
  credentialsPresent?: boolean;
}
