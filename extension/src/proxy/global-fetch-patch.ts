/**
 * global-fetch-patch.ts — Patches globalThis.fetch to route through proxy.
 *
 * Called ONCE at extension activation (after ProxyAgentFactory.initialize()).
 * All subsequent fetch() calls anywhere in the extension process will
 * automatically use the configured proxy transport.
 *
 * Routing strategy (same as HttpClient three-tier):
 * 1. curl mode → CurlHttpAdapter subprocess (NTLM SSO)
 * 2. powershell mode → PowerShellHttpAdapter subprocess
 * 3. system/manual mode → undici ProxyAgent dispatcher
 * 4. none mode → direct connection (no proxy)
 *
 * Rules:
 * - Bypass list is respected for ALL modes
 * - If fetch already has a dispatcher option, it's NOT overridden (modes 3/4 only)
 */

import { Agent } from "undici";
import type { Dispatcher } from "undici";
import { ProxyAgentFactory } from "./ProxyAgentFactory";
import { CurlHttpAdapter } from "./CurlHttpAdapter";
import { PowerShellHttpAdapter } from "./PowerShellHttpAdapter";

/** Original unpatched fetch — preserved for bypass/fallback */
const originalFetch = globalThis.fetch;

/** Whether the patch has been applied */
let patched = false;

/**
 * Direct-connection dispatcher with undici timeouts aligned to the OpenAI SDK
 * default timeout (10 minutes). Node's built-in global undici dispatcher uses
 * a 300s default headersTimeout, which aborts LLM requests queued behind busy
 * llama-server slots BEFORE the SDK's own 10-minute budget elapses
 * (SA4E-339: "Request timed out ... headersTimeout is at least the SDK timeout").
 */
const directFetchAgent = new Agent({
  headersTimeout: 600_000,
  bodyTimeout: 600_000,
  connectTimeout: 15_000,
});

/** Test access to the shared direct-connection dispatcher */
export function getDirectFetchDispatcher(): Dispatcher { return directFetchAgent; }

/**
 * Execute a direct (non-proxied) fetch with the raised-timeout dispatcher.
 * Respects a caller-provided dispatcher; otherwise attaches directFetchAgent
 * so headers/body timeouts match the SDK timeout instead of undici's 300s default.
 */
function directFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init && (init as any).dispatcher) {
    return originalFetch(input, init);
  }
  return originalFetch(input, { ...(init || {}), dispatcher: directFetchAgent } as RequestInit);
}

/** Shared adapter instances (stateless — safe to reuse) */
const curlAdapter = new CurlHttpAdapter();
const pwshAdapter = new PowerShellHttpAdapter();

/**
 * Apply the global fetch proxy patch.
 * Safe to call multiple times — only patches once.
 */
export function applyGlobalFetchPatch(): void {
  if (patched) { return; }
  patched = true;

  globalThis.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    // Resolve target URL from input
    const targetUrl = resolveUrl(input);
    if (!targetUrl) {
      return originalFetch(input, init);
    }

    // Check bypass list — bypassed URLs skip the proxy but still get the
    // raised-timeout direct dispatcher (LLM localhost endpoints live here).
    if (shouldBypass(targetUrl)) {
      return directFetch(input, init);
    }

    // Curl mode: route through curl.exe subprocess (handles NTLM SSO)
    if (curlAdapter.isCurlMode()) {
      return executeCurl(targetUrl, init);
    }

    // PowerShell mode: route through Invoke-WebRequest subprocess
    if (pwshAdapter.isPowerShellMode()) {
      return executePwsh(targetUrl, init);
    }

    // Defensive fallback: if adapter mode checks failed (e.g. factory threw during
    // isCurlMode/isPowerShellMode), re-check config directly to prevent request leak.
    // Without this, curl/powershell mode requests silently bypass the proxy.
    const activeMode = getActiveProxyMode();
    if (activeMode === "curl") {
      return executeCurl(targetUrl, init);
    }
    if (activeMode === "powershell") {
      return executePwsh(targetUrl, init);
    }

    // System/manual mode: inject undici ProxyAgent dispatcher
    if (init && (init as any).dispatcher) {
      // Caller already specified a dispatcher — respect it
      return originalFetch(input, init);
    }

    const dispatcher = await getProxyDispatcher(targetUrl);
    if (!dispatcher) {
      // No proxy resolved — direct connection with raised-timeout dispatcher
      return directFetch(input, init);
    }

    const patchedInit = { ...(init || {}), dispatcher } as RequestInit;
    return originalFetch(input, patchedInit);
  };
}

/**
 * Remove the global fetch patch (for testing/deactivation).
 */
export function removeGlobalFetchPatch(): void {
  if (!patched) { return; }
  globalThis.fetch = originalFetch;
  patched = false;
}

/** Extract URL string from fetch input */
function resolveUrl(input: RequestInfo | URL): string | null {
  if (typeof input === "string") { return input; }
  if (input instanceof URL) { return input.href; }
  if (input instanceof Request) { return input.url; }
  return null;
}

/** Check bypass list across all modes */
function shouldBypass(targetUrl: string): boolean {
  try {
    const factory = ProxyAgentFactory.getInstance();
    const config = factory.getConfig();
    if (config.mode === "none") { return true; }
    return factory.shouldBypass(targetUrl, config.bypass);
  } catch {
    return false;
  }
}

/**
 * Read proxy mode directly from ProxyAgentFactory config.
 * Separate path from adapter checks — adapters wrap this in try-catch that may swallow errors.
 * Returns null if factory is not initialized (extension still starting up).
 */
function getActiveProxyMode(): string | null {
  try {
    const factory = ProxyAgentFactory.getInstance();
    return factory.getConfig().mode;
  } catch {
    return null;
  }
}

/** Execute request via curl.exe subprocess, return standard Response */
async function executeCurl(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method || "GET";
  const headers = extractHeaders(init);
  const body = typeof init?.body === "string" ? init.body : undefined;
  // fetch() mặc định follow redirects (redirect: "follow").
  // Chỉ skip follow khi caller explicitly set redirect: "manual" hoặc "error".
  const shouldFollow = !init || (init as any).redirect !== "manual";
  const res = await curlAdapter.request(url, method, headers, body, 30000, shouldFollow);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: buildResponseHeaders(res.body),
  });
}

/** Execute request via PowerShell subprocess, return standard Response */
async function executePwsh(url: string, init?: RequestInit): Promise<Response> {
  const method = init?.method || "GET";
  const headers = extractHeaders(init);
  const body = typeof init?.body === "string" ? init.body : undefined;
  // PowerShell Invoke-WebRequest follows redirects by default (MaximumRedirection > 0)
  const res = await pwshAdapter.request(url, method, headers, body, 30000);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: buildResponseHeaders(res.body),
  });
}

/** Extract headers Record from RequestInit */
function extractHeaders(init?: RequestInit): Record<string, string> {
  if (!init?.headers) { return {}; }
  if (init.headers instanceof Headers) {
    const result: Record<string, string> = {};
    init.headers.forEach((value, key) => { result[key] = value; });
    return result;
  }
  if (Array.isArray(init.headers)) {
    const result: Record<string, string> = {};
    for (const [key, value] of init.headers) { result[key] = value; }
    return result;
  }
  return init.headers as Record<string, string>;
}

/** Build minimal response headers — detect content type from body */
function buildResponseHeaders(body: string): Record<string, string> {
  // Heuristic: if body starts with { or [ it's likely JSON
  const trimmed = body.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return { "content-type": "application/json" };
  }
  return { "content-type": "text/plain" };
}

/** Get undici ProxyAgent dispatcher for system/manual modes */
async function getProxyDispatcher(targetUrl: string): Promise<Dispatcher | undefined> {
  try {
    const factory = ProxyAgentFactory.getInstance();
    return await factory.getDispatcher(targetUrl);
  } catch {
    return undefined;
  }
}
