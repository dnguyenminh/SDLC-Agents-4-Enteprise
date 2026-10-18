/**
 * PowerShellTransport — PowerShell subprocess HTTP driver for corporate proxy environments.
 *
 * Uses Invoke-WebRequest (PowerShell 5.1+) or .NET HttpClient (PowerShell 7+)
 * to make HTTP requests through corporate proxies. PowerShell inherits system
 * proxy settings and NTLM credentials automatically on Windows.
 *
 * Key benefits over Node.js native HTTP:
 * - Inherits IE/WinHTTP proxy settings (WPAD, PAC)
 * - NTLM/Kerberos SSO via Windows credential store
 * - Not blocked by EDR policies targeting node.exe
 *
 * BR-18: script building/parsing live in ./pwsh-transport/* — this file is the
 * stable public façade (same import path and symbols as before the split).
 */

import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { PwshResponse, PwshRequestOptions, PowerShellTransportError } from "./pwsh-transport/types";
import { buildRequestScript, buildStreamScript } from "./pwsh-transport/script-builder";
import { parsePwshOutput } from "./pwsh-transport/output-parser";

export { PwshResponse, PwshRequestOptions, PowerShellTransportError } from "./pwsh-transport/types";

const execFileAsync = promisify(execFile);

/**
 * HTTP transport using PowerShell subprocess.
 * Leverages system proxy settings and Windows NTLM/Kerberos authentication.
 */
export class PowerShellTransport {
  private readonly proxyUrl: string | null;

  constructor(proxyUrl: string | null) {
    this.proxyUrl = proxyUrl;
  }

  /**
   * Detect system proxy via PowerShell .NET WebRequest.GetSystemWebProxy().
   * Returns proxy URL, or null if direct connection or DIRECT.
   */
  static async detectSystemProxy(): Promise<string | null> {
    const script = `
      $proxy = [System.Net.WebRequest]::GetSystemWebProxy()
      $testUrl = [System.Uri]'https://api.anthropic.com'
      $proxyUri = $proxy.GetProxy($testUrl)
      if ($proxyUri -and $proxyUri.AbsoluteUri -ne $testUrl.AbsoluteUri) {
        Write-Output $proxyUri.AbsoluteUri
      } else {
        Write-Output 'DIRECT'
      }
    `;
    try {
      const { stdout } = await execFileAsync(
        PowerShellTransport.getPwshBinary(),
        ["-NoProfile", "-NonInteractive", "-Command", script],
        { timeout: 10000 }
      );
      const result = stdout.trim();
      if (!result || result === "DIRECT") { return null; }
      return result;
    } catch {
      return null;
    }
  }

  /** Execute HTTP request via PowerShell Invoke-WebRequest */
  async request(url: string, options: PwshRequestOptions = {}): Promise<PwshResponse> {
    const method = (options.method || "GET").toUpperCase();
    const timeout = options.timeout || 10000;
    const timeoutSec = Math.ceil(timeout / 1000);

    const script = buildRequestScript(this.proxyUrl, url, method, timeoutSec, options);

    try {
      const { stdout } = await execFileAsync(
        PowerShellTransport.getPwshBinary(),
        ["-NoProfile", "-NonInteractive", "-Command", script],
        { timeout: timeout + 5000, maxBuffer: 20 * 1024 * 1024 }
      );
      return parsePwshOutput(stdout);
    } catch (err: unknown) {
      const error = err as Error & { stderr?: string };
      throw new PowerShellTransportError(
        this.interpretError(error)
      );
    }
  }

  /**
   * Execute streaming HTTP request via .NET HttpClient in PowerShell.
   * Returns a ReadableStream that pipes response chunks.
   */
  streamRequest(url: string, options: PwshRequestOptions = {}): ReadableStream<Uint8Array> {
    const method = (options.method || "POST").toUpperCase();
    const timeout = options.timeout || 120000;
    const timeoutSec = Math.ceil(timeout / 1000);

    const script = buildStreamScript(this.proxyUrl, url, method, timeoutSec, options);
    const encoder = new TextEncoder();

    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        const proc = spawn(
          PowerShellTransport.getPwshBinary(),
          ["-NoProfile", "-NonInteractive", "-Command", script],
          { stdio: ["pipe", "pipe", "pipe"] }
        );

        proc.stdout.on("data", (chunk: Buffer) => {
          controller.enqueue(encoder.encode(chunk.toString("utf-8")));
        });

        proc.on("close", () => {
          controller.close();
        });

        proc.on("error", (err) => {
          controller.error(new PowerShellTransportError(`Stream error: ${err.message}`));
        });

        if (options.body) {
          proc.stdin.write(options.body);
          proc.stdin.end();
        } else {
          proc.stdin.end();
        }
      },
    });
  }

  /** Quick connectivity test — returns latency in ms */
  async testConnection(url: string, proxyUrl?: string | null): Promise<number> {
    const start = Date.now();
    // 30s timeout — NTLM handshake + TLS qua corporate proxy có thể chậm
    const response = await this.request(url, { method: "GET", timeout: 30000 });
    // Accept 2xx and all redirect codes (301, 302, 303, 307, 308)
    const isRedirect = response.status >= 300 && response.status < 400;
    if (!response.ok && !isRedirect) {
      throw new PowerShellTransportError(`HTTP ${response.status}: ${response.statusText}`);
    }
    return Date.now() - start;
  }

  /** Check if PowerShell is available */
  static async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync(
        PowerShellTransport.getPwshBinary(),
        ["-NoProfile", "-NonInteractive", "-Command", "Write-Output ok"],
        { timeout: 5000 }
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Interpret PowerShell errors into user-friendly messages */
  private interpretError(err: Error & { stderr?: string }): string {
    const stderr = err.stderr || err.message || "";
    if (stderr.includes("407")) {
      return "Proxy authentication failed — 407 Proxy Authentication Required";
    }
    if (stderr.includes("timed out") || stderr.includes("TimeoutSec")) {
      return "Connection timed out — proxy may be unreachable";
    }
    if (stderr.includes("Unable to connect") || stderr.includes("ECONNREFUSED")) {
      return "Connection refused — verify proxy host and port";
    }
    if (stderr.includes("resolve") || stderr.includes("ENOTFOUND")) {
      return "Cannot resolve hostname";
    }
    if (stderr.includes("SSL") || stderr.includes("certificate")) {
      return "SSL certificate error — proxy may require CA trust";
    }
    if (stderr.includes("503")) {
      return "HTTP 503 — Service Unavailable";
    }
    return `PowerShell error: ${stderr}`;
  }

  /** Get PowerShell binary — pwsh preferred (PS7), fallback powershell.exe */
  private static getPwshBinary(): string {
    return process.platform === "win32" ? "pwsh" : "pwsh";
  }
}
