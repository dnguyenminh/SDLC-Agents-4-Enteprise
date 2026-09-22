/**
 * Type declarations for pi-ai subpath imports (the package's exports field maps
 * ./providers/* and ./api/* but TS cannot resolve the nested .d.ts targets).
 */
declare module '@earendil-works/pi-ai/providers/all' {
  import type { MutableModels, CreateModelsOptions } from '@earendil-works/pi-ai';
  export function builtinModels(options?: CreateModelsOptions): MutableModels;
  export function builtinProviders(): unknown[];
  export function getBuiltinProviders(): string[];
}

declare module '@earendil-works/pi-ai/providers/openai.models' {
  export const OPENAI_MODELS: Record<string, Record<string, unknown>>;
}

declare module '@earendil-works/pi-ai/api/openai-responses.lazy' {
  export declare const openAIResponsesApi: () => unknown;
}

declare module '@earendil-works/pi-ai/api/openai-completions.lazy' {
  export declare const openAICompletionsApi: () => unknown;
}

declare module '@earendil-works/pi-ai/providers/anthropic.models' {
  export const ANTHROPIC_MODELS: Record<string, Record<string, unknown>>;
}

declare module '@earendil-works/pi-ai/api/anthropic-messages.lazy' {
  export declare const anthropicMessagesApi: () => unknown;
}
