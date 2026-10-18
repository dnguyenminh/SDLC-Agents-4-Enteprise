/**
 * CurlTransport — curl.exe subprocess HTTP driver for enterprise proxy bypass.
 *
 * In corporate environments with EDR (Trellix, CrowdStrike) and NTLM proxy
 * (Skyhigh SWG, McAfee), Node.js native HTTP is often blocked because
 * node.exe is not whitelisted. curl.exe IS whitelisted and supports NTLM SSO.
 *
 * Key rules:
 * - execFile (not shell) — safe with & in URLs
 * - NEVER -X GET with HTTPS proxy (breaks CONNECT tunnel)
 * - Use -I for HEAD (not -X HEAD)
 * - Skip 407 NTLM + 200 Connection Established intermediate headers
 * - --proxy-ntlm -U : for automatic Windows NTLM credentials
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { buildCurlArgs, parseCurlOutput } from "./curl-args";

const execFileAsync = promisify(execFile);

/** Response from curl transport */
export interface CurlResponse {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}

/** Options for curl request */
export interface CurlRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  proxyUrl?: string;
  /** Explicit proxy credentials (user:pass). Null = use NTLM SSO */
  proxyAuth?: string | null;
  insecure?: boolean;
  followRedirects?: boolean;
  /** Path to persistent cookie jar file. Enables -b/-c for session reuse. */
  cookieJarPath?: string;
}

/**
 * HTTP transport using curl.exe subprocess.
 * Bypasses EDR and uses NTLM SSO or explicit credentials for proxy auth.
 */
export class CurlTransport {
  private readonly proxyUrl: string | null;
  private readonly defaultTimeout: number;
  private readonly insecure: boolean;

  constructor(proxyUrl: string | null, defaultTimeout = 15000, insecure = false) {
    this.proxyUrl = proxyUrl;
    this.defaultTimeout = defaultTimeout;
    this.insecure = insecure;
  }

  /** Execute HTTP request via curl subprocess */
  async request(url: string, options: CurlRequestOptions = {}): Promise<CurlResponse> {
    const method = (options.method || "GET").toUpperCase();
    const timeout = options.timeout || this.defaultTimeout;
    const proxy = options.proxyUrl || this.proxyUrl;
    const args = this.buildArgs(url, method, timeout, proxy, options);

    try {
      const { stdout } = await execFileAsync(
        this.getCurlBinary(),
        args,
        { maxBuffer: 20 * 1024 * 1024 }
      );
      return parseCurlOutput(stdout);
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      throw new CurlTransportError(this.interpretCurlError(error), error.code);
    }
  }

  /** Quick connectivity test — returns latency in ms */
  async testConnection(url: string, proxyUrl?: string, proxyAuth?: string | null): Promise<number> {
    const start = Date.now();
    const response = await this.request(url, {
      method: "GET",
      timeout: 10000,
      proxyUrl: proxyUrl || this.proxyUrl || undefined,
      proxyAuth,
      followRedirects: true,
    });
    // Accept 2xx and all redirect codes (301, 302, 303, 307, 308)
    const isRedirect = response.status >= 300 && response.status < 400;
    if (!response.ok && !isRedirect) {
      throw new CurlTransportError(`HTTP ${response.status}: ${response.statusText}`);
    }
    return Date.now() - start;
  }
  
  /** Check if curl binary is available */
  static async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync(
        process.platform === "win32" ? "curl.exe" : "curl",
        ["--version"],
        { timeout: 5000 }
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Thin wrapper — arg construction lives in curl-args.ts (BR-18). */
  private buildArgs(
    url: string,
    method: string,
    timeout: number,
    proxy: string | null,
    options: CurlRequestOptions
  ): string[] {
    return buildCurlArgs(url, method, timeout, proxy, options, this.insecure);
  }

  private getCurlBinary(): string {
    return process.platform === "win32" ? "curl.exe" : "curl";
  }

  private interpretCurlError(err: Error): string {
    const msg = err.message || "";
    if (msg.includes("(28)") || msg.includes("timed out")) {
      return "Connection timed out — proxy may be unreachable";
    }
    if (msg.includes("(7)") || msg.includes("couldn't connect")) {
      return "Connection refused — verify proxy host and port";
    }
    if (msg.includes("(6)") || msg.includes("Couldn't resolve")) {
      return "Cannot resolve proxy hostname";
    }
    if (msg.includes("(60)") || msg.includes("SSL certificate")) {
      return "SSL certificate error — proxy may require CA trust";
    }
    if (msg.includes("(56)")) {
      return "Connection reset by proxy";
    }
    return `Curl error: ${msg}`;
  }
}

/** Error class for curl transport */
export class CurlTransportError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "CurlTransportError";
  }
}
