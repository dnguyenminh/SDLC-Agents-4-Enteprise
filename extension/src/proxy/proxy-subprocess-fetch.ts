/**
 * proxy-subprocess-fetch — curl/powershell subprocess execution for the
 * global fetch patch. Extracted from global-fetch-patch.ts (BR-18);
 * request flags and response mapping unchanged.
 */
import { CurlHttpAdapter } from "./CurlHttpAdapter";
import { PowerShellHttpAdapter } from "./PowerShellHttpAdapter";

/** Shared adapter instances (stateless — safe to reuse) */
const curlAdapter = new CurlHttpAdapter();
const pwshAdapter = new PowerShellHttpAdapter();

/** True when curl.exe subprocess routing is active (adapter mode). */
export function isCurlModeActive(): boolean {
  return curlAdapter.isCurlMode();
}

/** True when PowerShell subprocess routing is active (adapter mode). */
export function isPowershellModeActive(): boolean {
  return pwshAdapter.isPowerShellMode();
}

/** Execute request via curl.exe subprocess, return standard Response */
export async function executeCurl(url: string, init?: RequestInit): Promise<Response> {
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
export async function executePwsh(url: string, init?: RequestInit): Promise<Response> {
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
