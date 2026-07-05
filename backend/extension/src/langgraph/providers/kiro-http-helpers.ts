/**
 * HTTP helper functions for KiroClient.
 * Handles fetch with timeout, retry logic for 401/429/5xx.
 */

import type { TokenManager } from "./token-manager";
import type { AnthropicAdapter } from "./anthropic-adapter";

const CONNECT_TIMEOUT_MS = 30_000;

/**
 * Fetch with connect timeout, respecting an optional external abort signal.
 */
export async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const existingSignal = init.signal;
  if (!existingSignal) {
    return fetch(url, { ...init, signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) });
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
  existingSignal.addEventListener("abort", () => controller.abort());
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Send a streaming request with automatic 401/429/5xx retry.
 */
export async function sendRequestWithRetry(
  url: string,
  body: any,
  model: string,
  tokenManager: TokenManager,
  adapter: AnthropicAdapter,
  signal: AbortSignal | undefined,
  log: (level: string, message: string) => void
): Promise<Response> {
  const accessToken = await tokenManager.getAccessToken();
  const headers = adapter.buildRequestHeaders(accessToken, model);

  let response = await fetchWithTimeout(url, {
    method: "POST", headers, body: JSON.stringify(body), signal,
  });

  if (response.status === 401) {
    log("WARN", "Received 401 — refreshing token and retrying");
    await tokenManager.refreshToken();
    const newToken = await tokenManager.getAccessToken();
    const newHeaders = adapter.buildRequestHeaders(newToken, model);
    response = await fetchWithTimeout(url, {
      method: "POST", headers: newHeaders, body: JSON.stringify(body), signal,
    });
    if (response.status === 401) {
      throw new Error("Authentication failed after token refresh. Please re-login via Kiro IDE.");
    }
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
    log("WARN", `Rate limited (429). Waiting ${waitMs}ms`);
    await sleep(waitMs);
    const refreshedToken = await tokenManager.getAccessToken();
    const retryHeaders = adapter.buildRequestHeaders(refreshedToken, model);
    response = await fetchWithTimeout(url, {
      method: "POST", headers: retryHeaders, body: JSON.stringify(body), signal,
    });
  }

  if (response.status >= 500) {
    log("WARN", `Server error ${response.status} — retrying once`);
    await sleep(1000);
    const refreshedToken = await tokenManager.getAccessToken();
    const retryHeaders = adapter.buildRequestHeaders(refreshedToken, model);
    response = await fetchWithTimeout(url, {
      method: "POST", headers: retryHeaders, body: JSON.stringify(body), signal,
    });
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Kiro API error ${response.status}: ${errorText}`);
  }

  return response;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
