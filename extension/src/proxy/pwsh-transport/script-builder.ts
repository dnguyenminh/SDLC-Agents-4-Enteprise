/**
 * Invoke-WebRequest / .NET HttpClient script builders for PowerShellTransport.
 * Extracted from PowerShellTransport.ts (BR-18 file-size limit). Pure string
 * assembly — identical output, proxy URL injected instead of `this.proxyUrl`.
 */
import { PwshRequestOptions } from "./types";

/** Build Invoke-WebRequest script with structured output delimiters */
export function buildRequestScript(
  proxyUrl: string | null,
  url: string,
  method: string,
  timeoutSec: number,
  options: PwshRequestOptions
): string {
  const lines = buildRequestParams(proxyUrl, url, method, timeoutSec, options);
  lines.push(...buildRequestOutputLines());
  return lines.join("\n");
}

/** Build the $params hashtable + headers + body section of the request script. */
function buildRequestParams(
  proxyUrl: string | null,
  url: string,
  method: string,
  timeoutSec: number,
  options: PwshRequestOptions
): string[] {
  const escapedUrl = url.replace(/'/g, "''");
  const lines: string[] = [];

  // Constrained Language Mode: avoid variable assignment & method calls
  // PS7 + Windows 10+ default to TLS 1.2, no need to force
  // $ProgressPreference cannot be set in CLM — accept progress output noise

  // Build params hashtable
  lines.push("$params = @{");
  lines.push(`  Uri = '${escapedUrl}'`);
  lines.push(`  Method = '${method}'`);
  lines.push(`  TimeoutSec = ${timeoutSec}`);
  lines.push("  UseBasicParsing = $true");

  if (proxyUrl) {
    lines.push(`  Proxy = '${proxyUrl}'`);
    lines.push("  ProxyUseDefaultCredentials = $true");
  }

  lines.push("}");

  // Add headers
  if (options.headers && Object.keys(options.headers).length > 0) {
    lines.push("$params.Headers = @{");
    for (const [k, v] of Object.entries(options.headers)) {
      if (k.toLowerCase() === "content-type") { continue; } // handled separately
      lines.push(`  '${k}' = '${v.replace(/'/g, "''")}'`);
    }
    lines.push("}");
  }

  // Add body and content type
  if (options.body && method !== "GET" && method !== "HEAD") {
    lines.push(`$params.Body = '${options.body.replace(/'/g, "''")}'`);
    const contentType = options.headers?.["Content-Type"] || options.headers?.["content-type"];
    if (contentType) {
      lines.push(`$params.ContentType = '${contentType}'`);
    }
  }

  return lines;
}

/** Structured success/error output block appended to every request script. */
function buildRequestOutputLines(): string[] {
  const lines: string[] = [];
  lines.push("try {");
  lines.push("  $r = Invoke-WebRequest @params");
  lines.push("  Write-Output '---PWSH_STATUS---'");
  lines.push("  Write-Output $r.StatusCode");
  lines.push("  Write-Output '---PWSH_STATUS_TEXT---'");
  lines.push("  Write-Output $r.StatusDescription");
  lines.push("  Write-Output '---PWSH_HEADERS---'");
  lines.push("  $r.Headers.Keys | ForEach-Object { Write-Output \"${_}: $($r.Headers[$_])\" }");
  lines.push("  Write-Output '---PWSH_BODY---'");
  lines.push("  Write-Output $r.Content");
  lines.push("} catch {");
  lines.push("  $ex = $_.Exception");
  lines.push("  if ($ex.Response) {");
  lines.push("    $code = [int]$ex.Response.StatusCode");
  lines.push("    Write-Output '---PWSH_STATUS---'");
  lines.push("    Write-Output $code");
  lines.push("    Write-Output '---PWSH_STATUS_TEXT---'");
  lines.push("    Write-Output $ex.Response.StatusDescription");
  lines.push("    Write-Output '---PWSH_HEADERS---'");
  lines.push("    Write-Output ''");
  lines.push("    Write-Output '---PWSH_BODY---'");
  lines.push("    Write-Output $ex.Message");
  lines.push("  } else {");
  lines.push("    Write-Error $ex.Message");
  lines.push("    exit 1");
  lines.push("  }");
  lines.push("}");
  return lines;
}

/** Build streaming script using .NET HttpClient */
export function buildStreamScript(
  proxyUrl: string | null,
  url: string,
  method: string,
  timeoutSec: number,
  options: PwshRequestOptions
): string {
  const lines: string[] = [];
  lines.push("$ProgressPreference = 'SilentlyContinue'");
  lines.push(`$handler = [System.Net.Http.HttpClientHandler]::new()`);

  if (proxyUrl) {
    lines.push(`$handler.Proxy = [System.Net.WebProxy]::new('${proxyUrl}')`);
    lines.push(`$handler.UseDefaultCredentials = $true`);
  }

  lines.push(`$client = [System.Net.Http.HttpClient]::new($handler)`);
  lines.push(`$client.Timeout = [TimeSpan]::FromSeconds(${timeoutSec})`);

  lines.push(`$request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::${dotNetMethod(method)}, '${url}')`);

  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      lines.push(`$request.Headers.TryAddWithoutValidation('${k}', '${v.replace(/'/g, "''")}') | Out-Null`);
    }
  }

  // Body from stdin
  lines.push("$body = [System.Console]::In.ReadToEnd()");
  lines.push("if ($body.Length -gt 0) {");
  lines.push("  $request.Content = [System.Net.Http.StringContent]::new($body, [System.Text.Encoding]::UTF8, 'application/json')");
  lines.push("}");

  // Stream response
  lines.push("$response = $client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).Result");
  lines.push("$stream = $response.Content.ReadAsStreamAsync().Result");
  lines.push("$reader = [System.IO.StreamReader]::new($stream)");
  lines.push("while (-not $reader.EndOfStream) {");
  lines.push("  $line = $reader.ReadLine()");
  lines.push("  [Console]::WriteLine($line)");
  lines.push("}");
  lines.push("$reader.Dispose()");
  lines.push("$client.Dispose()");

  return lines.join("\n");
}

/** Map HTTP method to .NET HttpMethod property name */
export function dotNetMethod(method: string): string {
  const map: Record<string, string> = {
    GET: "Get", POST: "Post", PUT: "Put",
    DELETE: "Delete", PATCH: "Patch", HEAD: "Head",
    OPTIONS: "Options",
  };
  return map[method] || "Post";
}
