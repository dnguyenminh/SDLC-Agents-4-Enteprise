/**
 * Subprocess HTTP adapters (curl.exe / PowerShell) for HttpClient.
 * When the proxy mode selects a subprocess transport, requests bypass fetch()
 * and execute through these adapters instead.
 */

import { CurlHttpAdapter } from "../CurlHttpAdapter";
import { PowerShellHttpAdapter } from "../PowerShellHttpAdapter";
import { HttpError } from "./errors";

export class SubprocessHttp {
  readonly curlAdapter = new CurlHttpAdapter();
  readonly pwshAdapter = new PowerShellHttpAdapter();

  /**
   * Check if current proxy mode is "curl" (CurlTransport subprocess).
   * When true, HttpClient delegates to curl.exe instead of fetch().
   */
  isCurlMode(): boolean {
    return this.curlAdapter.isCurlMode();
  }

  /**
   * Check if a target URL should bypass curl proxy (connect directly via fetch).
   * Uses the same bypass list as manual/system modes.
   */
  shouldBypassCurl(targetUrl: string): boolean {
    return this.curlAdapter.shouldBypass(targetUrl);
  }

  /**
   * Check if current proxy mode is "powershell" (Invoke-WebRequest subprocess).
   * When true, HttpClient delegates to PowerShell instead of fetch().
   */
  isPowerShellMode(): boolean {
    return this.pwshAdapter.isPowerShellMode();
  }

  /**
   * Check if a target URL should bypass PowerShell proxy (connect directly via fetch).
   * Uses the same bypass list as manual/system modes.
   */
  shouldBypassPwsh(targetUrl: string): boolean {
    return this.pwshAdapter.shouldBypass(targetUrl);
  }

  /**
   * Execute request via CurlTransport (subprocess).
   * Converts response to parsed JSON or throws HttpError.
   */
  async curlRequest<T>(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string,
    timeout?: number
  ): Promise<T> {
    const response = await this.curlAdapter.request(url, method, headers, body, timeout);
    if (response.status === 401) {
      throw new HttpError(401, "Unauthorized");
    }
    if (!response.ok) {
      throw new HttpError(response.status, response.body || response.statusText);
    }
    return JSON.parse(response.body) as T;
  }

  /**
   * Execute request via PowerShellTransport (subprocess).
   * Converts response to parsed JSON or throws HttpError.
   */
  async pwshRequest<T>(
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: string,
    timeout?: number
  ): Promise<T> {
    const response = await this.pwshAdapter.request(url, method, headers, body, timeout);
    if (response.status === 401) {
      throw new HttpError(401, "Unauthorized");
    }
    if (!response.ok) {
      throw new HttpError(response.status, response.body || response.statusText);
    }
    return JSON.parse(response.body) as T;
  }
}
