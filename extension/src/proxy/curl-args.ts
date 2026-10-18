/**
 * curl-args — curl.exe argument construction and -i output parsing.
 * Extracted from CurlTransport (BR-18); flags and parsing rules unchanged:
 * - NEVER -X GET with HTTPS proxy (breaks CONNECT tunnel)
 * - Use -I for HEAD (not -X HEAD)
 * - Skip 407 NTLM + 200 Connection Established intermediate headers
 */
import type { CurlRequestOptions, CurlResponse } from "./CurlTransport";

/** Build the curl argv for a request (proxy/NTLM, redirects, headers, body). */
export function buildCurlArgs(
  url: string,
  method: string,
  timeout: number,
  proxy: string | null,
  options: CurlRequestOptions,
  insecureDefault: boolean
): string[] {
  const args: string[] = ["-s", "-S"];

  // Proxy with NTLM SSO or explicit credentials
  if (proxy) {
    if (options.proxyAuth) {
      // Explicit user:pass — use basic auth
      args.push("-x", proxy, "-U", options.proxyAuth);
    } else {
      // NTLM SSO — automatic Windows credentials
      args.push("--proxy-ntlm", "-U", ":", "-x", proxy);
    }
  }

  args.push("--max-time", String(Math.ceil(timeout / 1000)));

  if (options.insecure ?? insecureDefault) {
    args.push("-k");
  }

  if (options.followRedirects) {
    args.push("-L");
    // Persistent cookie jar — reuse session across requests (browser behavior)
    if (options.cookieJarPath) {
      args.push("-b", options.cookieJarPath, "-c", options.cookieJarPath);
    } else {
      // Fallback: in-memory cookie engine for redirect chain only
      args.push("-b", "");
    }
    // Cap redirects to prevent infinite loop
    args.push("--max-redirs", "10");
  } else if (options.cookieJarPath) {
    // Even without followRedirects, use persistent cookies for session reuse
    args.push("-b", options.cookieJarPath, "-c", options.cookieJarPath);
  }

  // Method: -I for HEAD, implicit GET, -X for others
  if (method === "HEAD") {
    args.push("-I");
  } else {
    args.push("-i");
    if (method !== "GET") {
      args.push("-X", method);
    }
  }

  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      args.push("-H", `${key}: ${value}`);
    }
  }

  if (options.body && method !== "GET" && method !== "HEAD") {
    args.push("--data-raw", options.body);
  }

  args.push(url);
  return args;
}

/** Parse curl -i output, skipping NTLM 407 and CONNECT 200 blocks */
export function parseCurlOutput(rawOutput: string): CurlResponse {
  const blocks = rawOutput.split(/\r?\n\r?\n/).filter((b) => b.trim().length > 0);
  let targetBlock = "";
  let bodyIdx = -1;

  for (let i = blocks.length - 1; i >= 0; i--) {
    const first = blocks[i].split(/\r?\n/)[0] || "";
    if (first.startsWith("HTTP/")) {
      if (!first.includes("407") && !first.includes("200 Connection Established")) {
        targetBlock = blocks[i];
        bodyIdx = i + 1;
        break;
      }
    }
  }

  if (!targetBlock && blocks.length > 0) {
    targetBlock = blocks[0];
    bodyIdx = 1;
  }

  const lines = targetBlock.split(/\r?\n/);
  const statusLine = lines[0] || "";
  const match = statusLine.match(/HTTP\/\d\.?\d?\s+(\d+)\s*(.*)/);
  const status = match ? parseInt(match[1], 10) : 0;
  const statusText = match ? match[2].trim() : "";

  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    }
  }

  const body = bodyIdx >= 0 && bodyIdx < blocks.length
    ? blocks.slice(bodyIdx).join("\n\n")
    : "";

  return { status, statusText, ok: status >= 200 && status < 300, headers, body };
}
