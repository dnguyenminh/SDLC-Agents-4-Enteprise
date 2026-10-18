/**
 * openai-model-detect — local-server model & context window detection.
 * Extracted from OpenAIProvider (BR-18). Both helpers are non-fatal:
 * they log at debug level and return undefined so callers keep defaults.
 */

/** Detect the first loaded model id from a local server /v1/models endpoint. */
export async function fetchFirstModelId(
  apiBase: string,
  cached?: string
): Promise<string | undefined> {
  if (cached) { return cached; }
  try {
    const response = await fetch(`${apiBase}/models`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json() as { data?: Array<{ id: string }> };
      const id = data.data?.[0]?.id;
      if (id) { return id; }
    }
  } catch (err) {
    console.debug(`[OpenAIProvider] model detection failed (non-fatal): ${(err as Error).message}`);
  }
  return undefined;
}

/** Detect context window from /v1/models (LM Studio / local servers). */
export async function detectLocalContextWindow(apiBase: string): Promise<number | undefined> {
  try {
    const response = await fetch(`${apiBase}/models`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json() as { data?: Array<{ id: string; context_length?: number; meta?: { n_ctx?: number } }> };
      const model = data.data?.[0];
      // Standard OpenAI field
      if (model?.context_length && model.context_length > 0) {
        return model.context_length;
      }
      // llama-server uses meta.n_ctx instead
      else if (model?.meta?.n_ctx && model.meta.n_ctx > 0) {
        return model.meta.n_ctx;
      }
    }
  } catch (err) {
    console.debug(`[OpenAIProvider] context window detection failed (non-fatal): ${(err as Error).message}`);
  }
  return undefined;
}
