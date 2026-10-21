/**
 * Windows proxy detection: PowerShell .NET WebRequest + netsh fallback (SA).
 */

import { execQuiet } from "./exec";

/** Detect proxy URL from Windows configuration. */
export function detectWindowsProxy(): string | null {
  try {
    // Use PowerShell to call .NET WebRequest.GetSystemWebProxy()
    // This detects WPAD/PAC auto-configured proxies that netsh misses
    // FIX: (1) if/else on same line (no `;` before else — PowerShell syntax error)
    //      (2) try/catch inside PS to handle Constrained Language Mode gracefully
    //      (3) output validation — reject error text masquerading as proxy URL
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "try {",
      "  $proxy = [System.Net.WebRequest]::GetSystemWebProxy()",
      "  $uri = [Uri]'https://www.google.com'",
      "  $proxyUri = $proxy.GetProxy($uri)",
      "  if ($proxyUri.AbsoluteUri -eq $uri.AbsoluteUri) { Write-Output 'DIRECT' } else { Write-Output $proxyUri.AbsoluteUri }",
      "} catch {",
      "  Write-Output 'CLM_FALLBACK'",
      "}",
    ].join("\n");
    const output = execQuiet(
      `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`
    );
    const result = output.trim();
    // CLM_FALLBACK = Constrained Language Mode blocked .NET method calls → netsh
    if (result === "CLM_FALLBACK") { return detectWindowsProxyNetsh(); }
    if (!result || result === "DIRECT") { return null; }
    // Validate: output must look like a URL — reject PowerShell error text
    if (!/^https?:\/\/\S+/.test(result)) { return detectWindowsProxyNetsh(); }
    return result;
  } catch {
    // Fallback to netsh if PowerShell fails (timeout, not found, etc.)
    return detectWindowsProxyNetsh();
  }
}

/** Fallback: netsh winhttp (only works when proxy is explicitly set) */
function detectWindowsProxyNetsh(): string | null {
  try {
    const output = execQuiet("netsh winhttp show proxy");
    const match = output.match(/Proxy Server\(s\)\s*:\s*(.+)/i);
    if (!match) { return null; }
    const server = match[1].trim();
    if (server.toLowerCase().includes("direct access")) { return null; }
    if (server.includes("=")) { return parsePerProtocolProxy(server); }
    return `http://${server}`;
  } catch {
    return null;
  }
}

/** Detect bypass list from Windows netsh winhttp configuration. */
export function detectWindowsBypass(): string | null {
  try {
    const output = execQuiet("netsh winhttp show proxy");
    // Parse: "Bypass List     :  *.local;<local>"
    const match = output.match(/Bypass List\s*:\s*(.+)/i);
    if (!match) { return null; }
    const bypass = match[1].trim();
    if (bypass.toLowerCase() === "(none)") { return null; }
    return bypass.split(";").map((s) => s.trim()).filter(Boolean).join(",");
  } catch {
    return null;
  }
}

/**
 * Parse per-protocol proxy string (e.g. "http=host1:80;https=host2:443").
 * Prefers https, falls back to http.
 */
function parsePerProtocolProxy(server: string): string | null {
  const entries = server.split(";").map((s) => s.trim());
  const map = new Map<string, string>();
  for (const entry of entries) {
    const [protocol, address] = entry.split("=", 2);
    if (protocol && address) { map.set(protocol.toLowerCase(), address); }
  }
  const httpsAddr = map.get("https");
  if (httpsAddr) { return `http://${httpsAddr}`; }
  const httpAddr = map.get("http");
  if (httpAddr) { return `http://${httpAddr}`; }
  return null;
}
