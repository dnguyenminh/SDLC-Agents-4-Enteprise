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
      const data = await response.json() as {
        data?: Array<{
          id: string;
          context_length?: number;
          meta?: { n_ctx?: number };
          status?: { args?: string[] };
        }>;
      };
      const model = data.data?.[0];
      // Standard OpenAI field
      if (model?.context_length && model.context_length > 0) {
        return model.context_length;
      }
      // llama-server uses meta.n_ctx instead
      else if (model?.meta?.n_ctx && model.meta.n_ctx > 0) {
        return model.meta.n_ctx;
      }
      // SA4E-370: LM Studio gateway exposes launcher args instead of meta
      // (e.g. [..., '--ctx-size', '131072', ...]) — parse the flag's value.
      else {
        const args = model?.status?.args;
        if (Array.isArray(args)) {
          const flagIndex = args.indexOf("--ctx-size");
          if (flagIndex >= 0 && flagIndex + 1 < args.length) {
            const parsed = Number.parseInt(args[flagIndex + 1], 10);
            if (Number.isFinite(parsed) && parsed > 0) {
              return parsed;
            }
          }
        }
      }
    }
  } catch (err) {
    console.debug(`[OpenAIProvider] context window detection failed (non-fatal): ${(err as Error).message}`);
  }
  return undefined;
}
